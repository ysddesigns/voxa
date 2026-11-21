package app.voxa.engine

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.os.Debug
import android.os.SystemClock
import android.util.Log
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import com.k2fsa.sherpa.onnx.WaveReader
import expo.modules.interfaces.permissions.Permissions
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
private val WORD = Regex("\\S+")
private val SENTENCE = Regex("[^.!?\\n]+[.!?]*")

/**
 * On-device speech for Voxa (engine spike, Android only).
 *  - speak: Kitten nano (sherpa-onnx OfflineTts), one sentence at a time, played with AudioTrack.
 *    Word events are estimated from each sentence's audio length, weighted by word length.
 *  - listen: streaming Zipformer 20M (sherpa-onnx OnlineRecognizer) on 16 kHz AudioRecord input.
 *  - benchmark: load time, real-time factor, first-audio latency and memory.
 */
class VoxaEngineModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val lock = Any()
  private var tts: OfflineTts? = null
  private var ttsLoadMs = 0L
  private var recognizer: OnlineRecognizer? = null
  private var asrLoadMs = 0L

  /** Bumped by every speak/stop; a speaking thread only acts while its number is current. */
  private val speakGen = AtomicInteger(0)

  @Volatile private var listening = false
  private var listenThread: Thread? = null

  private class Sentence(val start: Int, val end: Int, val text: String)
  private class Chunk(val start: Int, val end: Int, val samples: FloatArray)
  private val endOfSpeech = Chunk(0, 0, FloatArray(0))

  override fun definition() = ModuleDefinition {
    Name("VoxaEngine")
    Events("onSpeak", "onListen")

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
    Function("speak") { id: Int, text: String, sid: Int, speed: Double ->
      val gen = speakGen.incrementAndGet()
      thread(name = "voxa-tts") { runSpeak(id, gen, text, sid, speed.toFloat()) }
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
          // sherpa-onnx 2.x has no espeak-ng: words are looked up in this lexicon.
          lexicon = "$MODELS/tts/lexicon.txt",
        ),
        numThreads = 2,
        debug = false,
        provider = "cpu",
      ),
      maxNumSentences = 1,
    )
    val created = OfflineTts(assetManager = context.assets, config = config)
    ttsLoadMs = SystemClock.elapsedRealtime() - t0
    Log.i(TAG, "voice loaded in ${ttsLoadMs} ms: ${created.numSpeakers()} voices at ${created.sampleRate()} Hz")
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
    tts?.release(); tts = null
    recognizer?.release(); recognizer = null
  }

  // --- Speak ---------------------------------------------------------------------

  private fun emitSpeak(id: Int, type: String, extra: Map<String, Any> = emptyMap()) {
    sendEvent("onSpeak", mapOf("id" to id, "type" to type) + extra)
  }

  private fun splitSentences(text: String): List<Sentence> =
    SENTENCE.findAll(text)
      .filter { it.value.isNotBlank() }
      .map { Sentence(it.range.first, it.range.last + 1, it.value.trim()) }
      .toList()

  private fun runSpeak(id: Int, gen: Int, text: String, sid: Int, speed: Float) {
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
      for (s in sentences) {
        if (!live()) break
        val audio = engine.generate(s.text, sid, speed)
        if (first) {
          first = false
          emitSpeak(id, "metrics", mapOf("firstAudioMs" to (SystemClock.elapsedRealtime() - t0).toDouble()))
        }
        val chunk = Chunk(s.start, s.end, audio.samples)
        while (live() && !queue.offer(chunk, 50, TimeUnit.MILLISECONDS)) { /* wait for the player */ }
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

      val stream = r.createStream("")
      val buf = ShortArray(ASR_RATE / 10) // 100 ms
      val t0 = SystemClock.elapsedRealtime()
      var segment = 0
      var segStart = 0L
      var last = ""
      while (listening) {
        val n = rec.read(buf, 0, buf.size)
        if (n <= 0) continue
        var sum = 0.0
        val samples = FloatArray(n) { val v = buf[it] / 32768f; sum += v * v; v }
        emitListen("level", mapOf("rms" to sqrt(sum / n)))
        stream.acceptWaveform(samples, ASR_RATE)
        while (r.isReady(stream)) r.decode(stream)
        val text = r.getResult(stream).text.trim()
        val now = SystemClock.elapsedRealtime() - t0
        if (text != last) {
          last = text
          if (text.isNotEmpty()) emitSegment(segment, text, segStart, now, false)
        }
        if (r.isEndpoint(stream)) {
          if (text.isNotEmpty()) { emitSegment(segment, text, segStart, now, true); segment++ }
          r.reset(stream)
          last = ""
          segStart = now
        }
      }
      // Flush what is left as the final segment.
      stream.acceptWaveform(FloatArray(ASR_RATE / 2), ASR_RATE)
      stream.inputFinished()
      while (r.isReady(stream)) r.decode(stream)
      val text = r.getResult(stream).text.trim()
      if (text.isNotEmpty()) emitSegment(segment, text, segStart, SystemClock.elapsedRealtime() - t0, true)
      stream.release()
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

  // --- Benchmark ---------------------------------------------------------------------

  private fun runBenchmark(): Map<String, Any> {
    val out = linkedMapOf<String, Any>()
    out["device"] = "${Build.MANUFACTURER} ${Build.MODEL}"
    out["android"] = Build.VERSION.RELEASE
    out["abi"] = Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown"
    out["cores"] = Runtime.getRuntime().availableProcessors()

    out["ttsCold"] = tts == null
    val t = ensureTts()
    out["ttsLoadMs"] = ttsLoadMs.toDouble()
    out["ttsVoices"] = t.numSpeakers()

    var t0 = SystemClock.elapsedRealtime()
    t.generate("Hello there.", 0, 1f)
    out["ttsFirstAudioMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()

    val sample = "Voxa reads your words out loud, right on this phone, with no internet connection at all."
    t0 = SystemClock.elapsedRealtime()
    val audio = t.generate(sample, 0, 1f)
    val genMs = SystemClock.elapsedRealtime() - t0
    val audioSec = audio.samples.size.toDouble() / audio.sampleRate
    out["ttsGenMs"] = genMs.toDouble()
    out["ttsAudioSec"] = audioSec
    out["ttsRtf"] = genMs / 1000.0 / audioSec

    out["asrCold"] = recognizer == null
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
    out["asrRtf"] = asrMs / 1000.0 / asrSec

    val mem = Debug.MemoryInfo()
    Debug.getMemoryInfo(mem)
    out["pssMb"] = mem.totalPss / 1024.0
    out["nativeHeapMb"] = Debug.getNativeHeapAllocatedSize() / 1048576.0
    return out
  }
}
