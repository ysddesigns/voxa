package app.voxa.engine

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.os.BatteryManager
import android.os.PowerManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.os.Debug
import android.os.SystemClock
import android.util.Log
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.GeneratedAudio
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import com.k2fsa.sherpa.onnx.FastClusteringConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarization
import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarizationConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerSegmentationModelConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerSegmentationPyannoteModelConfig
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractorConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import com.k2fsa.sherpa.onnx.WaveReader
import expo.modules.interfaces.permissions.Permissions
import org.json.JSONObject
import java.io.File
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.sqrt

private const val TAG = "VoxaEngine"
private const val MODELS = "voxa-models"
private const val ASR_RATE = 16000
/** Longer sentences are spoken in pieces, like sherpa-onnx's max_words_in_sentence. */
private const val MAX_WORDS = 20
/** The voice is the slowest model; give it up to 4 cores (2 made Kitten slower than real time on a Redmi Note 13). */
private val TTS_THREADS = Runtime.getRuntime().availableProcessors().coerceIn(1, 4)
private const val LONG_TEST_FILE = "long-test.jsonl"
/** Silero VAD reads 16 kHz audio in windows of 512 samples (32 ms). */
private const val VAD_WINDOW = 512
private val WORD = Regex("\\S+")
private val SENTENCE = Regex("[^.!?\\n]+[.!?]*")

/**
 * On-device speech for Voxa (engine spike, Android only).
 *  - speak: Kitten nano (sherpa-onnx OfflineTts), one sentence (or 20-word piece) at a time, played
 *    with AudioTrack. Text becomes voice tokens in KittenTokenizer: English words from the lexicon,
 *    other words from pronunciations the app passes in (Nigerian spelling rules). Word events are
 *    estimated from each piece's audio length, weighted by word length.
 *  - listen: streaming Zipformer 20M (sherpa-onnx OnlineRecognizer) on 16 kHz AudioRecord input.
 *  - benchmark: load time, real-time factor, first-audio latency and memory, for the voice,
 *    speech recognition, Silero VAD and speaker labels (diarization).
 *  - long test: listens for up to 60 minutes with the screen off (ListenService keeps the mic on)
 *    and writes battery, temperature, memory and speed once a minute to long-test.jsonl.
 */
class VoxaEngineModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val lock = Any()
  private var tts: OfflineTts? = null
  private var tokenizer: KittenTokenizer? = null
  private var ttsLoadMs = 0L
  private var recognizer: OnlineRecognizer? = null
  private var asrLoadMs = 0L

  /** Bumped by every speak/stop; a speaking thread only acts while its number is current. */
  private val speakGen = AtomicInteger(0)

  @Volatile private var listening = false
  @Volatile private var longTestRunning = false
  private var listenThread: Thread? = null

  private class Sentence(val start: Int, val end: Int, val text: String)
  private class Chunk(val start: Int, val end: Int, val samples: FloatArray)
  private val endOfSpeech = Chunk(0, 0, FloatArray(0))

  override fun definition() = ModuleDefinition {
    Name("VoxaEngine")
    Events("onSpeak", "onListen", "onLongTest")

    AsyncFunction("loadVoice") { promise: Promise ->
      thread(name = "voxa-tts-load") {
        try {
          val t = ensureTts()
          promise.resolve(mapOf("sampleRate" to t.sampleRate(), "numSpeakers" to t.numSpeakers(), "loadMs" to ttsLoadMs.toDouble()))
        } catch (e: Throwable) {
          Log.e(TAG, "voice load failed", e)
          promise.reject("E_TTS_LOAD", e.message ?: "Could not load the voice", e)
        }
      }
    }

    // Starts speaking and returns at once; progress arrives as onSpeak events with this id.
    // overrides win over the English lexicon; fallbacks are used only for words it lacks.
    Function("speak") { id: Int, text: String, sid: Int, speed: Double, overrides: Map<String, String>, fallbacks: Map<String, String> ->
      val gen = speakGen.incrementAndGet()
      thread(name = "voxa-tts") { runSpeak(id, gen, text, sid, speed.toFloat(), overrides, fallbacks) }
      Unit
    }

    Function("stopSpeaking") {
      speakGen.incrementAndGet()
      Unit
    }

    AsyncFunction("requestMicPermission") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.RECORD_AUDIO)
    }

    AsyncFunction("startListening") { promise: Promise ->
      if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        promise.reject("E_MIC_PERMISSION", "Microphone permission is not granted", null)
      } else if (listening) {
        promise.resolve(mapOf("loadMs" to asrLoadMs.toDouble()))
      } else {
        listening = true
        listenThread = thread(name = "voxa-asr") { runListen(promise) }
      }
    }

    AsyncFunction("stopListening") { promise: Promise ->
      listening = false
      val t = listenThread
      thread(name = "voxa-asr-stop") {
        t?.join(5000)
        promise.resolve(null)
      }
    }

    AsyncFunction("benchmark") { promise: Promise ->
      thread(name = "voxa-bench") {
        try {
          promise.resolve(runBenchmark())
        } catch (e: Throwable) {
          promise.reject("E_BENCHMARK", e.message ?: "Benchmark failed", e)
        }
      }
    }

    // The 60-minute screen-off test. Uses the microphone, so normal listening is blocked meanwhile.
    AsyncFunction("startLongTest") { minutes: Int, promise: Promise ->
      when {
        context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ->
          promise.reject("E_MIC_PERMISSION", "Microphone permission is not granted", null)
        listening -> promise.reject("E_BUSY", "The microphone is already in use", null)
        else -> {
          listening = true
          longTestRunning = true
          File(context.filesDir, LONG_TEST_FILE).writeText("")
          ListenService.start(context, "Voxa test: listening for $minutes minutes")
          listenThread = thread(name = "voxa-long-test") { runLongTest(minutes.coerceIn(1, 180)) }
          promise.resolve(null)
        }
      }
    }

    Function("stopLongTest") {
      if (longTestRunning) listening = false
      Unit
    }

    Function("longTestRunning") { longTestRunning }

    /** One JSON object per line: a sample each minute, then a final line with done = true. */
    Function("longTestReport") {
      val f = File(context.filesDir, LONG_TEST_FILE)
      if (f.exists()) f.readLines().filter { it.isNotBlank() } else emptyList()
    }

    Function("release") {
      speakGen.incrementAndGet()
      listening = false
      releaseModels()
      Unit
    }

    OnDestroy {
      speakGen.incrementAndGet()
      listening = false
      releaseModels()
    }
  }

  // --- Models ------------------------------------------------------------------

  private fun ensureTts(): OfflineTts = synchronized(lock) {
    tts?.let { return it }
    val t0 = SystemClock.elapsedRealtime()
    val config = OfflineTtsConfig(
      model = OfflineTtsModelConfig(
        kitten = OfflineTtsKittenModelConfig(
          model = "$MODELS/tts/model.onnx",
          voices = "$MODELS/tts/voices.bin",
          tokens = "$MODELS/tts/tokens.txt",
          // No lexicon here: KittenTokenizer reads it and passes tokens (sherpa-onnx 2.x has no espeak-ng).
        ),
        numThreads = TTS_THREADS,
        debug = false,
        provider = "cpu",
      ),
      maxNumSentences = 1,
    )
    val created = OfflineTts(assetManager = context.assets, config = config)
    val assets = context.assets
    tokenizer = KittenTokenizer(
      assets.open("$MODELS/tts/lexicon.txt").bufferedReader(Charsets.UTF_8),
      assets.open("$MODELS/tts/tokens.txt").bufferedReader(Charsets.UTF_8),
    )
    ttsLoadMs = SystemClock.elapsedRealtime() - t0
    Log.i(TAG, "voice loaded in ${ttsLoadMs} ms: ${created.numSpeakers()} voices at ${created.sampleRate()} Hz, ${tokenizer?.size} lexicon words")
    tts = created
    created
  }

  private fun ensureAsr(): OnlineRecognizer = synchronized(lock) {
    recognizer?.let { return it }
    val t0 = SystemClock.elapsedRealtime()
    val config = OnlineRecognizerConfig(
      featConfig = FeatureConfig(sampleRate = ASR_RATE, featureDim = 80),
      modelConfig = OnlineModelConfig(
        transducer = OnlineTransducerModelConfig(
          encoder = "$MODELS/asr/encoder.onnx",
          decoder = "$MODELS/asr/decoder.onnx",
          joiner = "$MODELS/asr/joiner.onnx",
        ),
        tokens = "$MODELS/asr/tokens.txt",
        numThreads = 2,
        provider = "cpu",
      ),
      enableEndpoint = true,
      decodingMethod = "greedy_search",
    )
    val created = OnlineRecognizer(assetManager = context.assets, config = config)
    asrLoadMs = SystemClock.elapsedRealtime() - t0
    recognizer = created
    created
  }

  private fun releaseModels() = synchronized(lock) {
    tts?.release(); tts = null; tokenizer = null
    recognizer?.release(); recognizer = null
  }

  // --- Speak ---------------------------------------------------------------------

  private fun emitSpeak(id: Int, type: String, extra: Map<String, Any> = emptyMap()) {
    sendEvent("onSpeak", mapOf("id" to id, "type" to type) + extra)
  }

  /** Sentences, with long ones cut into pieces of at most MAX_WORDS words (at a comma when there is one). */
  private fun splitSentences(text: String): List<Sentence> {
    val out = ArrayList<Sentence>()
    for (m in SENTENCE.findAll(text)) {
      if (m.value.isBlank()) continue
      val words = WORD.findAll(m.value).toList()
      var first = 0
      while (first < words.size) {
        var last = minOf(first + MAX_WORDS, words.size) - 1
        if (last < words.size - 1) {
          val comma = (last downTo first + MAX_WORDS / 2).firstOrNull { words[it].value.endsWith(',') }
          if (comma != null) last = comma
        }
        val start = m.range.first + words[first].range.first
        val end = m.range.first + words[last].range.last + 1
        out.add(Sentence(start, end, text.substring(start, end)))
        first = last + 1
      }
    }
    return out
  }

  /** Speaks one piece of text through the tokenizer. Returns null when no word could be pronounced. */
  private fun synth(
    engine: OfflineTts,
    text: String,
    sid: Int,
    speed: Float,
    overrides: Map<String, String> = emptyMap(),
    fallbacks: Map<String, String> = emptyMap(),
    skipped: MutableCollection<String>? = null,
    tk: KittenTokenizer = tokenizer ?: throw IllegalStateException("The voice is not loaded"),
  ): GeneratedAudio? {
    val tokens = tk.tokenize(text, overrides, fallbacks, skipped)
    // Only spaces and punctuation means nothing to say.
    if (tokens.none { t -> t.any { it.isLetter() } }) return null
    val cfg = GenerationConfig(sid = sid, speed = speed, tokens = arrayOf(tokens.toTypedArray()))
    val audio = engine.generateWithConfig(text, cfg)
    return if (audio.samples.isEmpty()) null else audio
  }

  private fun runSpeak(id: Int, gen: Int, text: String, sid: Int, speed: Float, overrides: Map<String, String>, fallbacks: Map<String, String>) {
    fun live() = speakGen.get() == gen
    try {
      val engine = ensureTts()
      if (!live()) return
      val words = WORD.findAll(text).toList()
      val sentences = splitSentences(text)
      emitSpeak(id, "start")
      if (sentences.isEmpty()) { emitSpeak(id, "end"); return }

      val rate = engine.sampleRate()
      val minBuf = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
      val track = AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
            .setSampleRate(rate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build(),
        )
        .setBufferSizeInBytes(max(minBuf, rate)) // ~250 ms of float audio
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()

      // Generate on this thread while the player thread writes the previous sentence.
      val queue = LinkedBlockingQueue<Chunk>(2)
      val player = thread(name = "voxa-tts-play") { play(id, gen, track, queue, words, rate) }
      val t0 = SystemClock.elapsedRealtime()
      var first = true
      val skipped = LinkedHashSet<String>()
      for (s in sentences) {
        if (!live()) break
        val audio = synth(engine, s.text, sid, speed, overrides, fallbacks, skipped)
        if (first) {
          first = false
          emitSpeak(id, "metrics", mapOf("firstAudioMs" to (SystemClock.elapsedRealtime() - t0).toDouble()))
        }
        // A piece with no speakable words still goes to the player so its words are passed over.
        val chunk = Chunk(s.start, s.end, audio?.samples ?: FloatArray(0))
        while (live() && !queue.offer(chunk, 50, TimeUnit.MILLISECONDS)) { /* wait for the player */ }
      }
      if (skipped.isNotEmpty()) {
        Log.i(TAG, "words not spoken: $skipped")
        emitSpeak(id, "skipped", mapOf("words" to skipped.toList()))
      }
      while (live() && !queue.offer(endOfSpeech, 50, TimeUnit.MILLISECONDS)) { /* wait */ }
      player.join()
    } catch (e: Throwable) {
      Log.e(TAG, "speak failed", e)
      if (live()) emitSpeak(id, "error", mapOf("message" to (e.message ?: "Speech failed")))
    }
  }

  private fun play(id: Int, gen: Int, track: AudioTrack, queue: LinkedBlockingQueue<Chunk>, words: List<MatchResult>, rate: Int) {
    fun live() = speakGen.get() == gen
    val marks = ArrayList<Pair<Long, Int>>() // (frame where the word starts, word index)
    var nextMark = 0
    var written = 0L

    fun emitDue(): Long {
      val head = track.playbackHeadPosition.toLong() and 0xffffffffL
      while (nextMark < marks.size && marks[nextMark].first <= head) {
        val wi = marks[nextMark].second
        val m = words[wi]
        emitSpeak(id, "word", mapOf("index" to wi, "charStart" to m.range.first, "charEnd" to m.range.last + 1))
        nextMark++
      }
      return head
    }

    var finished = false
    try {
      track.play()
      while (live()) {
        val chunk = queue.poll(50, TimeUnit.MILLISECONDS)
        if (chunk == null) { emitDue(); continue }
        if (chunk === endOfSpeech) break
        val samples = chunk.samples
        val inChunk = words.indices.filter { words[it].range.first >= chunk.start && words[it].range.first < chunk.end }
        val total = inChunk.sumOf { words[it].value.length + 1 }.coerceAtLeast(1)
        var acc = 0
        for (wi in inChunk) {
          marks.add(written + acc.toLong() * samples.size / total to wi)
          acc += words[wi].value.length + 1
        }
        var off = 0
        while (off < samples.size && live()) {
          val n = track.write(samples, off, samples.size - off, AudioTrack.WRITE_NON_BLOCKING)
          if (n < 0) throw IllegalStateException("AudioTrack write failed ($n)")
          off += n
          emitDue()
          if (n == 0) Thread.sleep(10)
        }
        written += samples.size
      }
      // Let the tail play out, then report the end.
      val deadline = SystemClock.elapsedRealtime() + (written * 1000 / rate) + 1500
      while (live() && emitDue() < written && SystemClock.elapsedRealtime() < deadline) Thread.sleep(20)
      finished = live()
    } catch (e: Throwable) {
      Log.e(TAG, "playback failed", e)
      if (live()) emitSpeak(id, "error", mapOf("message" to (e.message ?: "Playback failed")))
    } finally {
      try { track.pause(); track.flush() } catch (_: Throwable) {}
      track.release()
      // A stop from JS ends the handle on the JS side, so "end" is only sent for natural endings.
      if (finished) emitSpeak(id, "end")
    }
  }

  // --- Listen ----------------------------------------------------------------------

  private fun emitListen(type: String, extra: Map<String, Any>) {
    sendEvent("onListen", mapOf("type" to type) + extra)
  }

  @SuppressLint("MissingPermission") // checked in startListening
  private fun runListen(started: Promise) {
    var resolved = false
    var rec: AudioRecord? = null
    try {
      val r = ensureAsr()
      val minBuf = AudioRecord.getMinBufferSize(ASR_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, ASR_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(minBuf, ASR_RATE))
      if (rec.state != AudioRecord.STATE_INITIALIZED) throw IllegalStateException("The microphone is busy")
      rec.startRecording()
      started.resolve(mapOf("loadMs" to asrLoadMs.toDouble()))
      resolved = true

      val vad = newVad()
      val gate = GatedRecognizer(r, vad, ASR_RATE)
      val buf = ShortArray(ASR_RATE / 10) // 100 ms
      var segment = 0
      // Times come from the audio itself, so they line up with a recording of the session.
      val onResult = { res: GatedRecognizer.Result ->
        emitSegment(segment, res.text, res.startMs, res.endMs, res.final)
        if (res.final) segment++
      }
      try {
        while (listening) {
          val n = rec.read(buf, 0, buf.size)
          if (n <= 0) continue
          var sum = 0.0
          val samples = FloatArray(n) { val v = buf[it] / 32768f; sum += v * v; v }
          emitListen("level", mapOf("rms" to sqrt(sum / n)))
          gate.feed(samples, onResult)
        }
        gate.finish(onResult)
        Log.i(TAG, "listened ${gate.heardSamples / ASR_RATE} s, recognizer ran on ${gate.decodedSamples / ASR_RATE} s")
      } finally {
        gate.release()
        vad.release()
      }
    } catch (e: Throwable) {
      Log.e(TAG, "listen failed", e)
      if (!resolved) started.reject("E_LISTEN", e.message ?: "Could not start listening", e)
      else emitListen("error", mapOf("message" to (e.message ?: "Listening failed")))
    } finally {
      try { rec?.stop() } catch (_: Throwable) {}
      rec?.release()
      listening = false
    }
  }

  private fun emitSegment(index: Int, text: String, startMs: Long, endMs: Long, final: Boolean) {
    emitListen(
      "segment",
      mapOf("index" to index, "text" to text, "startMs" to startMs.toDouble(), "endMs" to endMs.toDouble(), "final" to final),
    )
  }

  // --- Long screen-off test ------------------------------------------------------------

  @SuppressLint("MissingPermission") // checked in startLongTest
  private fun runLongTest(minutes: Int) {
    val file = File(context.filesDir, LONG_TEST_FILE)
    val power = context.getSystemService(PowerManager::class.java)
    var rec: AudioRecord? = null
    val t0 = SystemClock.elapsedRealtime()
    var words = 0
    var screenOffMs = 0L
    var reason = "finished"

    fun record(extra: Map<String, Any>) {
      val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val bm = context.getSystemService(BatteryManager::class.java)
      val mem = Debug.MemoryInfo()
      Debug.getMemoryInfo(mem)
      val now = SystemClock.elapsedRealtime()
      val row = linkedMapOf<String, Any>(
        "min" to (now - t0) / 60_000.0,
        "battery" to bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY),
        "tempC" to (battery?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0) / 10.0,
        "charging" to ((battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0),
        "screenOffMin" to screenOffMs / 60_000.0,
        "pssMb" to mem.totalPss / 1024.0,
        "words" to words,
      )
      row.putAll(extra)
      val line = JSONObject(row as Map<*, *>).toString()
      file.appendText(line + "\n")
      Log.i(TAG, "long test: $line")
      sendEvent("onLongTest", row)
    }

    try {
      val r = ensureAsr()
      val minBuf = AudioRecord.getMinBufferSize(ASR_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, ASR_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(minBuf, ASR_RATE))
      if (rec.state != AudioRecord.STATE_INITIALIZED) throw IllegalStateException("The microphone is busy")
      rec.startRecording()
      val vad = newVad()
      val gate = GatedRecognizer(r, vad, ASR_RATE)
      val countWords: (GatedRecognizer.Result) -> Unit = { res ->
        if (res.final) words += res.text.split(' ').size
      }
      val buf = ShortArray(ASR_RATE / 10) // 100 ms
      val endAt = t0 + minutes * 60_000L
      var nextSample = t0 + 60_000L
      var lastTick = t0
      var lastNs = 0L
      var lastHeard = 0L
      var lastDecoded = 0L
      record(mapOf("rtf" to 0.0, "speechShare" to 0.0, "minutes" to minutes))
      try {
        while (listening && SystemClock.elapsedRealtime() < endAt) {
          val n = rec.read(buf, 0, buf.size)
          if (n <= 0) continue
          gate.feed(FloatArray(n) { buf[it] / 32768f }, countWords)
          val now = SystemClock.elapsedRealtime()
          if (!power.isInteractive) screenOffMs += now - lastTick
          lastTick = now
          if (now >= nextSample) {
            val heard = (gate.heardSamples - lastHeard).toDouble()
            record(
              mapOf(
                // Recognizer time / audio time over the last minute, silence included (lower is better).
                "rtf" to (gate.decodeNs - lastNs) / 1e9 / (heard / ASR_RATE),
                // Share of the minute the recognizer actually ran (the rest was silence).
                "speechShare" to (gate.decodedSamples - lastDecoded) / heard,
              ),
            )
            lastNs = gate.decodeNs
            lastHeard = gate.heardSamples
            lastDecoded = gate.decodedSamples
            nextSample += 60_000L
          }
        }
        gate.finish(countWords)
        if (!listening) reason = "stopped"
      } finally {
        gate.release()
        vad.release()
      }
    } catch (e: Throwable) {
      Log.e(TAG, "long test failed", e)
      reason = e.message ?: "failed"
    } finally {
      try { rec?.stop() } catch (_: Throwable) {}
      rec?.release()
      try { record(mapOf("done" to true, "reason" to reason)) } catch (e: Throwable) { Log.e(TAG, "long test: last sample failed", e) }
      listening = false
      longTestRunning = false
      ListenService.stop(context)
    }
  }

  // --- Benchmark ---------------------------------------------------------------------

  /** Whole-app memory (PSS) in MB, after a garbage collection so freed Java objects do not count. */
  private fun pssMb(): Double {
    Runtime.getRuntime().gc()
    val m = Debug.MemoryInfo()
    Debug.getMemoryInfo(m)
    return m.totalPss / 1024.0
  }

  /** Silero VAD for 16 kHz audio. Small (2 MB) and fast, so each listening session makes its own. */
  private fun newVad() = Vad(
    assetManager = context.assets,
    config = VadModelConfig(
      sileroVadModelConfig = SileroVadModelConfig(
        model = "$MODELS/vad/silero_vad.onnx",
        threshold = 0.5f,
        minSilenceDuration = 0.25f,
        minSpeechDuration = 0.25f,
        windowSize = VAD_WINDOW,
      ),
      sampleRate = ASR_RATE,
      numThreads = 1,
      provider = "cpu",
    ),
  )

  private fun assetExists(path: String): Boolean =
    try { context.assets.open(path).close(); true } catch (_: Throwable) { false }

  private fun runBenchmark(): Map<String, Any> {
    val out = linkedMapOf<String, Any>()
    out["device"] = "${Build.MANUFACTURER} ${Build.MODEL}"
    out["android"] = Build.VERSION.RELEASE
    out["abi"] = Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown"
    out["cores"] = Runtime.getRuntime().availableProcessors()
    out["ttsThreads"] = TTS_THREADS
    if (listening) throw IllegalStateException("Stop listening before running the benchmark")

    // Start from nothing loaded, so each model's memory can be measured on its own.
    speakGen.incrementAndGet()
    releaseModels()
    val base = pssMb()
    out["basePssMb"] = base

    out["ttsCold"] = tts == null
    val t = ensureTts()
    out["ttsMemMb"] = pssMb() - base
    out["ttsLoadMs"] = ttsLoadMs.toDouble()
    out["ttsVoices"] = t.numSpeakers()

    var t0 = SystemClock.elapsedRealtime()
    synth(t, "Hello there.", 0, 1f) ?: throw IllegalStateException("The voice produced no audio")
    out["ttsFirstAudioMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()

    val sample = "Voxa reads your words out loud, right on this phone, with no internet connection at all."
    t0 = SystemClock.elapsedRealtime()
    val audio = synth(t, sample, 0, 1f) ?: throw IllegalStateException("The voice produced no audio")
    val genMs = SystemClock.elapsedRealtime() - t0
    val audioSec = audio.samples.size.toDouble() / audio.sampleRate
    out["ttsGenMs"] = genMs.toDouble()
    out["ttsAudioSec"] = audioSec
    out["ttsRtf"] = genMs / 1000.0 / audioSec

    // Piper (VITS, Amy low, int8) for comparison. It is loaded only here and released at once,
    // so the peak memory below is for the models the app really uses.
    if (assetExists("$MODELS/piper/model.onnx")) {
      t0 = SystemClock.elapsedRealtime()
      val piper = OfflineTts(
        assetManager = context.assets,
        config = OfflineTtsConfig(
          model = OfflineTtsModelConfig(
            vits = OfflineTtsVitsModelConfig(model = "$MODELS/piper/model.onnx", tokens = "$MODELS/piper/tokens.txt"),
            numThreads = 2,
            debug = false,
            provider = "cpu",
          ),
          maxNumSentences = 1,
        ),
      )
      try {
        val ptk = tokenizer!!.withTokens(context.assets.open("$MODELS/piper/tokens.txt").bufferedReader(Charsets.UTF_8))
        out["piperLoadMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
        t0 = SystemClock.elapsedRealtime()
        synth(piper, "Hello there.", 0, 1f, tk = ptk) ?: throw IllegalStateException("Piper produced no audio")
        out["piperFirstAudioMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
        t0 = SystemClock.elapsedRealtime()
        val pa = synth(piper, sample, 0, 1f, tk = ptk) ?: throw IllegalStateException("Piper produced no audio")
        val pMs = SystemClock.elapsedRealtime() - t0
        out["piperRtf"] = pMs / 1000.0 / (pa.samples.size.toDouble() / pa.sampleRate)
      } catch (e: Throwable) {
        Log.e(TAG, "Piper benchmark failed", e)
        out["piperError"] = e.message ?: e.toString()
      } finally {
        piper.release()
      }
    }

    out["asrCold"] = recognizer == null
    val beforeAsr = pssMb()
    val r = ensureAsr()
    out["asrLoadMs"] = asrLoadMs.toDouble()
    val wave = WaveReader.readWave(context.assets, "$MODELS/asr/benchmark.wav")
    val stream = r.createStream("")
    t0 = SystemClock.elapsedRealtime()
    stream.acceptWaveform(wave.samples, wave.sampleRate)
    stream.acceptWaveform(FloatArray(wave.sampleRate / 2), wave.sampleRate)
    stream.inputFinished()
    while (r.isReady(stream)) r.decode(stream)
    val asrMs = SystemClock.elapsedRealtime() - t0
    val asrSec = wave.samples.size.toDouble() / wave.sampleRate
    out["asrText"] = r.getResult(stream).text.trim()
    stream.release()
    out["asrAudioSec"] = asrSec
    out["asrMemMb"] = pssMb() - beforeAsr
    out["asrRtf"] = asrMs / 1000.0 / asrSec

    // Silero VAD (finds where speech starts and stops) over the same clip, in 512-sample windows.
    t0 = SystemClock.elapsedRealtime()
    val vad = newVad()
    out["vadLoadMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
    try {
      t0 = SystemClock.elapsedRealtime()
      var speechSamples = 0L
      var segments = 0
      val drain = {
        while (!vad.empty()) {
          speechSamples += vad.front().samples.size
          segments++
          vad.pop()
        }
      }
      var i = 0
      while (i + VAD_WINDOW <= wave.samples.size) {
        vad.acceptWaveform(wave.samples.copyOfRange(i, i + VAD_WINDOW))
        drain()
        i += VAD_WINDOW
      }
      vad.flush()
      drain()
      val vadMs = SystemClock.elapsedRealtime() - t0
      out["vadRtf"] = vadMs / 1000.0 / asrSec
      out["vadSegments"] = segments
      out["vadSpeechSec"] = speechSamples.toDouble() / ASR_RATE
    } finally {
      vad.release()
    }

    val beforeDiar = pssMb()
    // Speaker labels (pyannote segmentation + CAM++ embeddings) on a clip with four speakers.
    // Runs after a recording ends, so it is timed as a whole, not streamed.
    t0 = SystemClock.elapsedRealtime()
    val diar = OfflineSpeakerDiarization(
      assetManager = context.assets,
      config = OfflineSpeakerDiarizationConfig(
        segmentation = OfflineSpeakerSegmentationModelConfig(
          pyannote = OfflineSpeakerSegmentationPyannoteModelConfig(model = "$MODELS/diar/segmentation.onnx"),
          numThreads = 2,
        ),
        embedding = SpeakerEmbeddingExtractorConfig(model = "$MODELS/diar/embedding.onnx", numThreads = 2),
        // numClusters = -1: the number of speakers is not known, so the threshold decides.
        clustering = FastClusteringConfig(numClusters = -1, threshold = 0.5f),
        minDurationOn = 0.3f,
        minDurationOff = 0.5f,
      ),
    )
    out["diarLoadMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
    try {
      val clip = WaveReader.readWave(context.assets, "$MODELS/diar/benchmark.wav")
      if (clip.sampleRate != diar.sampleRate()) throw IllegalStateException("Speaker clip is ${clip.sampleRate} Hz, expected ${diar.sampleRate()}")
      t0 = SystemClock.elapsedRealtime()
      val turns = diar.process(clip.samples)
      val diarMs = SystemClock.elapsedRealtime() - t0
      val clipSec = clip.samples.size.toDouble() / clip.sampleRate
      out["diarAudioSec"] = clipSec
      out["diarRtf"] = diarMs / 1000.0 / clipSec
      out["diarSpeakers"] = turns.map { it.speaker }.distinct().size
      out["diarTurns"] = turns.size
      // Peak: voice, listening and speaker models are all loaded at this point.
      val peak = Debug.MemoryInfo()
      Debug.getMemoryInfo(peak)
      out["peakPssMb"] = peak.totalPss / 1024.0
      out["diarMemMb"] = peak.totalPss / 1024.0 - beforeDiar
    } finally {
      diar.release()
    }

    val mem = Debug.MemoryInfo()
    Debug.getMemoryInfo(mem)
    out["pssMb"] = mem.totalPss / 1024.0
    out["nativeHeapMb"] = Debug.getNativeHeapAllocatedSize() / 1048576.0
    return out
  }
}
