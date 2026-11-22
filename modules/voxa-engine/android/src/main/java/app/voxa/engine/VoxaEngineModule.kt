package app.voxa.engine

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
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
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineMoonshineModelConfig
import com.k2fsa.sherpa.onnx.OfflineOmnilingualAsrCtcModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlinePunctuation
import com.k2fsa.sherpa.onnx.OnlinePunctuationConfig
import com.k2fsa.sherpa.onnx.OnlinePunctuationModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import com.k2fsa.sherpa.onnx.FastClusteringConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarization
import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarizationConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerSegmentationModelConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerSegmentationPyannoteModelConfig
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractor
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractorConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import com.k2fsa.sherpa.onnx.WaveReader
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
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
/** Longest PDF read into the editor; ML Kit takes about a second a page on a budget phone. */
private const val MAX_PDF_PAGES = 30
/** The voice is the slowest model; give it up to 4 cores (2 made Kitten slower than real time on a Redmi Note 13). */
private val TTS_THREADS = Runtime.getRuntime().availableProcessors().coerceIn(1, 4)
private const val LONG_TEST_FILE = "long-test.jsonl"
/** Model packs (src/features/packs/catalogue.ts): listening (ASR + VAD) and speaker labels. */
/** Kroko English (chosen 22 Nov 2026 over Zipformer 20M, which was "listen-en": deleted on first use). */
private const val LISTEN_PACK = "listen-en-kroko"
/** Packs no catalogue lists any more: the old listening model, and Kroko's lab copy (now LISTEN_PACK). */
private val OLD_PACKS = listOf("listen-en", "lab-asr-kroko")
private const val SPEAKERS_PACK = "speakers"
/** Clustering threshold for meetings: 0.5 found 7 speakers in a 4-speaker clip, so start higher. Tune on real meetings. */
private const val LABEL_THRESHOLD = 0.6f
/** Silero VAD reads 16 kHz audio in windows of 512 samples (32 ms). */
private const val VAD_WINDOW = 512
private val WORD = Regex("\\S+")
private val SENTENCE = Regex("[^.!?\\n]+[.!?]*")

/**
 * On-device speech for Voxa (engine spike, Android only).
 *  - speak: Piper LJSpeech medium (sherpa-onnx OfflineTts, VITS), one sentence (or 20-word piece) at a time, played
 *    with AudioTrack. Text becomes voice tokens in KittenTokenizer: English words from the lexicon,
 *    other words from pronunciations the app passes in (Nigerian spelling rules). Word events are
 *    estimated from each piece's audio length, weighted by word length.
 *  - listen: streaming Kroko English, a Zipformer (sherpa-onnx OnlineRecognizer) on 16 kHz AudioRecord input,
 *    run only while Silero VAD hears speech (GatedRecognizer). Finished sentences get punctuation
 *    and capitals from a small CNN-BiLSTM model; in-progress text stays as the recognizer wrote it.
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
  private var ttsVoice = ""
  /** Held while a voice generates audio, so it is never freed mid-sentence. */
  private val genLock = Any()
  private var recognizer: OnlineRecognizer? = null
  /** Whether [recognizer] was built with beam search (rebuilt when the saved tuning changes). */
  private var asrBeam = false
  private var asrLoadMs = 0L
  private var punct: OnlinePunctuation? = null
  private var punctTried = false

  /** Bumped by every speak/stop; a speaking thread only acts while its number is current. */
  private val speakGen = AtomicInteger(0)

  @Volatile private var listening = false
  @Volatile private var privateOutput = false
  @Volatile private var longTestRunning = false
  private val packs by lazy { PackStore(context) }
  private val recorder by lazy { VoiceRecorder { rms -> sendEvent("onRecord", mapOf("rms" to rms)) } }
  private val scanner by lazy { TextScanner(context) }
  private val documents by lazy { DocumentReader(context, scanner) }
  @Volatile private var exportCancelled = false
  /** Pack id → cancel requested, for installs in progress. */
  private val packCancels = java.util.concurrent.ConcurrentHashMap<String, Boolean>()
  private var listenThread: Thread? = null
  /** Audio heard by the last listening run, so the app can line up runs split by pauses. */
  @Volatile private var lastHeardMs = 0L
  @Volatile private var labelling = false
  /** A Listen session owns the notification (and its service) from start to stop, pauses included. */
  @Volatile private var noticeActive = false
  @Volatile private var labelCancel = false

  private class Sentence(val start: Int, val end: Int, val text: String, val speed: Float = 1f, val gain: Float = 1f, val pauseMs: Int = 0)
  /** How to read one stretch of the text (script refinements: style, emphasis, pauses). */
  private class Piece(val start: Int, val end: Int, val speed: Float, val gain: Float, val pauseMs: Int, val gapMs: Int)
  /** speechFrames: where the words' audio ends; silence for a pause follows it. */
  private class Chunk(val start: Int, val end: Int, val samples: FloatArray, val speechFrames: Int = samples.size)
  private val endOfSpeech = Chunk(0, 0, FloatArray(0))

  override fun definition() = ModuleDefinition {
    Name("VoxaEngine")
    Events("onSpeak", "onListen", "onLongTest", "onPack", "onLabel", "onListenAction", "onRecord", "onExport", "onDocument", "onSpeakAction")

    // Notification buttons (Pause, Resume, Mark, Stop) go to the app, which does the work and
    // sends the new state back with showListenNotice.
    OnCreate {
      ListenService.onAction = { action -> sendEvent("onListenAction", mapOf("action" to action)) }
      SpeakService.onAction = { action, positionMs -> sendEvent("onSpeakAction", mapOf("action" to action, "positionMs" to positionMs)) }
    }

    // The Listen notification: title, listening or paused, time listened (the system keeps the
    // timer running), and the latest sentence ("" for none; never shown on the lock screen).
    Function("showListenNotice") { title: String, paused: Boolean, elapsedMs: Double, caption: String ->
      noticeActive = true
      try {
        ListenService.update(context, ListenService.Notice(title, paused, elapsedMs.toLong(), caption, actions = true))
      } catch (e: Throwable) {
        Log.w(TAG, "could not show the listening notification", e)
      }
      Unit
    }

    // Speak for me's media notification and lock-screen controls: title, voice, playing or paused,
    // where it is and how long. Buttons come back as onSpeakAction. Builds from 24 Nov 2026.
    Function("showSpeakNotice") { title: String, subtitle: String, playing: Boolean, positionMs: Double, durationMs: Double ->
      try {
        SpeakService.update(context, SpeakService.Notice(title, subtitle, playing, positionMs.toLong(), durationMs.toLong()))
      } catch (e: Throwable) {
        Log.w(TAG, "could not show the speaking notification", e)
      }
      Unit
    }

    Function("endSpeakNotice") {
      try { SpeakService.stop(context) } catch (e: Throwable) { Log.w(TAG, "could not end the speaking notification", e) }
      Unit
    }

    // The session ended: remove the notification once the microphone is off.
    Function("endListenNotice") {
      noticeActive = false
      if (!listening) ListenService.stop(context)
      Unit
    }

    // Loads the listening model in the background (Kroko takes ~12 s on a mid-range phone), so
    // tapping Listen starts at once. Also removes the old listening model's folder.
    AsyncFunction("loadListen") { promise: Promise ->
      thread(name = "voxa-asr-load") {
        try {
          for (old in OLD_PACKS) if (packs.installed().contains(old)) packs.delete(old)
          ensureAsr()
          promise.resolve(mapOf("loadMs" to asrLoadMs.toDouble()))
        } catch (e: Throwable) {
          Log.e(TAG, "listening model load failed", e)
          promise.reject("E_ASR_LOAD", e.message ?: "Could not load the listening model", e)
        }
      }
    }

    // Warms up a voice ("" = built-in, else a pack id). Does not replace a voice already loaded,
    // so opening the Voices screen never interrupts speech in another voice.
    AsyncFunction("loadVoice") { voice: String, promise: Promise ->
      thread(name = "voxa-tts-load") {
        try {
          val t = synchronized(lock) { tts } ?: ensureTts(voice)
          promise.resolve(mapOf("sampleRate" to t.sampleRate(), "numSpeakers" to t.numSpeakers(), "loadMs" to ttsLoadMs.toDouble()))
        } catch (e: Throwable) {
          Log.e(TAG, "voice load failed", e)
          promise.reject("E_TTS_LOAD", e.message ?: "Could not load the voice", e)
        }
      }
    }

    // Starts speaking and returns at once; progress arrives as onSpeak events with this id.
    // overrides win over the English lexicon; fallbacks are used only for words it lacks.
    // voice: "" for the built-in voice, or the id of an installed voice pack.
    Function("speak") { id: Int, text: String, sid: Int, speed: Double, overrides: Map<String, String>, fallbacks: Map<String, String>, voice: String ->
      val gen = speakGen.incrementAndGet()
      thread(name = "voxa-tts") { runSpeak(id, gen, text, sid, speed.toFloat(), overrides, fallbacks, voice) }
      Unit
    }

    // speak, following a plan: each piece {start, end, speed, gain, pauseMs, gapMs} of the text is
    // read at speed × its speed and gain × loudness, then gapMs of silence after each sentence and
    // pauseMs after the piece. Builds from 23 Nov 2026.
    Function("speakPlanned") { id: Int, text: String, sid: Int, speed: Double, overrides: Map<String, String>, fallbacks: Map<String, String>, voice: String, plan: List<Map<String, Double>> ->
      val pieces = plan.map { m ->
        fun n(k: String) = m[k] ?: 0.0
        Piece(
          n("start").toInt().coerceIn(0, text.length),
          n("end").toInt().coerceIn(0, text.length),
          (m["speed"] ?: 1.0).toFloat().coerceIn(0.3f, 3f),
          (m["gain"] ?: 1.0).toFloat().coerceIn(0f, 2f),
          n("pauseMs").toInt().coerceIn(0, 10_000),
          n("gapMs").toInt().coerceIn(0, 3_000),
        )
      }
      val gen = speakGen.incrementAndGet()
      thread(name = "voxa-tts") { runSpeak(id, gen, text, sid, speed.toFloat(), overrides, fallbacks, voice, pieces) }
      Unit
    }

    // "room" (loudspeaker, the default) or "private": earbuds when connected, else the earpiece
    // held to the ear like a call. Applies from the next speak.
    Function("setOutput") { mode: String ->
      privateOutput = mode == "private"
      Unit
    }

    Function("stopSpeaking") {
      speakGen.incrementAndGet()
      Unit
    }

    // Asks for notifications too (Android 13+), so the "Voxa is listening" notice can show.
    // Only the microphone decides the result: listening works without the notice.
    AsyncFunction("requestMicPermission") { promise: Promise ->
      val perms = appContext.permissions
      if (perms == null) {
        promise.reject("E_PERMISSIONS", "Permissions are not available", null)
        return@AsyncFunction
      }
      val wanted = if (Build.VERSION.SDK_INT >= 33) {
        arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS)
      } else {
        arrayOf(Manifest.permission.RECORD_AUDIO)
      }
      perms.askForPermissions(PermissionsResponseListener { result ->
        val mic = result[Manifest.permission.RECORD_AUDIO]
        promise.resolve(
          mapOf(
            "granted" to (mic?.status == PermissionsStatus.GRANTED),
            "status" to (mic?.status?.status ?: "undetermined"),
            "canAskAgain" to (mic?.canAskAgain ?: true),
          ),
        )
      }, *wanted)
    }

    // audioPath: "" for none, or a path inside the app's files folder where the audio is appended
    // as 16-bit mono PCM (used for speaker labels after the meeting).
    AsyncFunction("startListening") { audioPath: String, promise: Promise ->
      val audio = if (audioPath.isEmpty()) null else appFile(audioPath)
      if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        promise.reject("E_MIC_PERMISSION", "Microphone permission is not granted", null)
      } else if (audioPath.isNotEmpty() && audio == null) {
        promise.reject("E_PATH", "Bad audio path", null)
      } else if (listening) {
        promise.resolve(mapOf("loadMs" to asrLoadMs.toDouble()))
      } else {
        listening = true
        // Keeps the mic on with the screen off or another app open; stopped when runListen ends.
        try {
          ListenService.start(context, "Voxa is listening")
        } catch (e: Throwable) {
          Log.w(TAG, "could not start the listening service", e)
        }
        listenThread = thread(name = "voxa-asr") { runListen(promise, audio) }
      }
    }

    // Resolves once the last sentence has been sent, with how much audio this run heard.
    // Donate your voice: plain 16 kHz WAV recording, no speech model. Levels arrive as onRecord.
    AsyncFunction("startRecording") { path: String, promise: Promise ->
      val file = appFile(path)
      when {
        context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ->
          promise.reject("E_MIC_PERMISSION", "Microphone permission is not granted", null)
        file == null -> promise.reject("E_PATH", "Bad audio path", null)
        listening || longTestRunning -> promise.reject("E_BUSY", "Stop listening first", null)
        recorder.isRecording -> promise.reject("E_BUSY", "Already recording", null)
        else -> try {
          recorder.start(file)
          promise.resolve(null)
        } catch (e: Throwable) {
          promise.reject("E_RECORD", e.message ?: "Could not start recording", e)
        }
      }
    }

    AsyncFunction("stopRecording") { promise: Promise ->
      thread(name = "voxa-donate-stop") {
        try {
          promise.resolve(mapOf("durationMs" to recorder.stop().toDouble()))
        } catch (e: Throwable) {
          promise.reject("E_RECORD", e.message ?: "Recording failed", e)
        }
      }
    }

    // Zips a folder inside the app's files (for sharing donated recordings).
    AsyncFunction("zipFolder") { src: String, dest: String, promise: Promise ->
      val from = appFile(src)
      val to = appFile(dest)
      if (from == null || to == null) {
        promise.reject("E_PATH", "Bad path", null)
      } else {
        thread(name = "voxa-zip") {
          try {
            promise.resolve(mapOf("bytes" to VoiceRecorder.zipFolder(from, to).toDouble()))
          } catch (e: Throwable) {
            promise.reject("E_ZIP", e.message ?: "Could not make the file", e)
          }
        }
      }
    }

    AsyncFunction("stopListening") { promise: Promise ->
      listening = false
      val t = listenThread
      thread(name = "voxa-asr-stop") {
        t?.join(5000)
        promise.resolve(mapOf("heardMs" to lastHeardMs.toDouble()))
      }
    }

    // Speaker labels for a recorded meeting (see SpeakerLabeller). Progress: onLabel events.
    AsyncFunction("labelSpeakers") { audioPath: String, promise: Promise ->
      val audio = appFile(audioPath)
      when {
        audio == null || !audio.exists() -> promise.reject("E_PATH", "No recording to label", null)
        labelling -> promise.reject("E_BUSY", "Already labelling a meeting", null)
        else -> {
          labelling = true
          labelCancel = false
          thread(name = "voxa-label") {
            try {
              val turns = runLabel(audio)
              promise.resolve(turns.map { mapOf("startMs" to it.startMs.toDouble(), "endMs" to it.endMs.toDouble(), "speaker" to it.speaker) })
            } catch (e: SpeakerLabeller.Cancelled) {
              promise.reject("E_CANCELLED", "Labelling cancelled", e)
            } catch (e: Throwable) {
              Log.e(TAG, "labelling failed", e)
              promise.reject("E_LABEL", e.message ?: "Could not label speakers", e)
            } finally {
              labelling = false
            }
          }
        }
      }
    }

    Function("cancelLabel") {
      labelCancel = true
      Unit
    }

    // Listening models on one recording (see runCompare). candidates: [{ id, modelType? }].
    AsyncFunction("compareAsr") { audioPath: String, candidates: List<Map<String, String>>, promise: Promise ->
      val audio = appFile(audioPath)
      when {
        audio == null || !audio.isFile -> promise.reject("E_PATH", "Record something first", null)
        listening -> promise.reject("E_BUSY", "Stop listening first", null)
        else -> thread(name = "voxa-asr-compare") {
          try {
            promise.resolve(runCompare(audio, candidates))
          } catch (e: Throwable) {
            Log.e(TAG, "compare failed", e)
            promise.reject("E_COMPARE", e.message ?: "Comparison failed", e)
          }
        }
      }
    }

    // Settings test: Live's pipeline on one recording, once per variant (see runTune).
    // variants: [{ id, beam, gain, vadThreshold, pauseMs, gate }]. Builds from 24 Nov 2026.
    AsyncFunction("tuneAsr") { audioPath: String, variants: List<Map<String, Any?>>, promise: Promise ->
      val audio = appFile(audioPath)
      when {
        audio == null || !audio.isFile -> promise.reject("E_PATH", "Record something first", null)
        listening -> promise.reject("E_BUSY", "Stop listening first", null)
        else -> thread(name = "voxa-asr-tune") {
          try {
            promise.resolve(runTune(audio, variants))
          } catch (e: Throwable) {
            Log.e(TAG, "tune failed", e)
            promise.reject("E_TUNE", e.message ?: "Settings test failed", e)
          }
        }
      }
    }

    // The settings Live uses: read, save (from the settings test) or go back to the defaults.
    Function("listenTuning") { ListenTuning.load(context).toMap() }
    Function("setListenTuning") { tuning: Map<String, Any?>? ->
      if (tuning == null) ListenTuning.reset(context) else ListenTuning.save(context, ListenTuning.from(tuning))
      ListenTuning.load(context).toMap()
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

    // --- Packs: downloaded voices and models (see PackStore) ---

    // Downloads, checks and installs a pack; progress and the result arrive as onPack events.
    // manifest is the catalogue entry as JSON, saved with the pack.
    Function("installPack") { id: String, manifest: String, files: List<Map<String, Any>> ->
      val parsed = PackStore.parseFiles(files)
      PackStore.checkId(id)
      if (packCancels.putIfAbsent(id, false) == null) {
        thread(name = "voxa-pack-$id") { runInstall(id, manifest, parsed) }
      }
      Unit
    }

    Function("cancelPack") { id: String ->
      packCancels.replace(id, true)
      Unit
    }

    Function("installedPacks") { packs.installed() }

    Function("packManifest") { id: String -> packs.manifest(id) }

    Function("deletePack") { id: String ->
      packs.delete(id)
      Unit
    }

    Function("modelStatus") { modelStatus() }

    // Free space, and what Voxa keeps: each pack, saved sessions, and meeting audio waiting for speaker labels.
    Function("storageInfo") {
      val sessions = File(context.filesDir, "voxa/sessions")
      var audio = 0L
      var other = 0L
      sessions.walkTopDown().filter { it.isFile }.forEach { if (it.name == "audio.pcm") audio += it.length() else other += it.length() }
      mapOf(
        "freeBytes" to packs.freeBytes().toDouble(),
        "packBytes" to packs.installed().associateWith { id -> packs.dir(id).walkTopDown().filter { it.isFile }.sumOf { it.length() }.toDouble() },
        "sessionBytes" to other.toDouble(),
        "audioBytes" to audio.toDouble(),
      )
    }

    Function("networkInfo") {
      val (connected, unmetered) = packs.network()
      mapOf("connected" to connected, "unmetered" to unmetered)
    }

    // Battery: whether Android's own battery optimisation is off for Voxa (it can stop Listen with
    // the screen off). Brand battery savers (Tecno, Infinix, itel, Xiaomi...) are not visible here.
    Function("batteryStatus") {
      val power = context.getSystemService(PowerManager::class.java)
      mapOf("unrestricted" to (power?.isIgnoringBatteryOptimizations(context.packageName) ?: false))
    }

    // Opens the phone's battery settings: "optimisation" = the list of apps Android optimises,
    // "app" = Voxa's own App info page (where most brands put their battery switches).
    Function("openBatterySettings") { which: String ->
      val intents = buildList {
        if (which == "optimisation") add(Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        add(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", context.packageName, null)))
      }
      intents.any { intent ->
        try {
          context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          true
        } catch (e: Exception) {
          false
        }
      }
    }

    // Android 16 Live Updates (the status-bar chip while listening): available, and on for Voxa?
    Function("liveUpdateStatus") { ListenService.liveUpdates(context) }

    // Opens the phone's Live Updates switch for Voxa (its notification settings on older phones).
    Function("openLiveUpdateSettings") { ListenService.openLiveUpdateSettings(context) }

    // Scan text from an image (file:// or content:// uri). Lines top to bottom.
    // Export (PRD PL-2): renders the script to an .m4a (AAC) file with the phone's encoder.
    // options: text, sid, speed, overrides, fallbacks, voice, plan (as speakPlanned), dest (a path
    // inside the app's files folder). Progress arrives as onExport {fraction}.
    AsyncFunction("exportSpeech") { options: Map<String, Any?>, promise: Promise ->
      val dest = appFile(options["dest"] as? String ?: "")
      val text = options["text"] as? String ?: ""
      if (dest == null || text.isBlank()) {
        promise.reject("E_EXPORT", "Nothing to export", null)
      } else {
        exportCancelled = false
        thread(name = "voxa-export") {
          try {
            promise.resolve(runExport(text, options, dest))
          } catch (e: Throwable) {
            Log.e(TAG, "export failed", e)
            promise.reject("E_EXPORT", if (exportCancelled) "Cancelled" else (e.message ?: "Could not make the audio file"), e)
          }
        }
      }
    }

    Function("cancelExport") { exportCancelled = true }

    // Import (PRD ED-1): the text of a .docx or PDF (content:// or file://). PDF pages are read with
    // ML Kit; progress arrives as onDocument {fraction}.
    AsyncFunction("readDocument") { uri: String, kind: String, promise: Promise ->
      documents.cancelled = false
      thread(name = "voxa-document") {
        try {
          val result = when (kind) {
            "docx" -> mapOf("text" to documents.readDocx(uri), "pages" to 0, "pagesRead" to 0)
            "pdf" -> {
              val (text, pages) = documents.readPdf(uri, MAX_PDF_PAGES) { done, total ->
                sendEvent("onDocument", mapOf("fraction" to done.toDouble() / total))
              }
              mapOf("text" to text, "pages" to pages, "pagesRead" to minOf(pages, MAX_PDF_PAGES))
            }
            else -> throw IllegalArgumentException("Voxa can open .txt, .docx and PDF files")
          }
          promise.resolve(result)
        } catch (e: Throwable) {
          Log.e(TAG, "document failed", e)
          promise.reject("E_DOCUMENT", e.message ?: "Could not read the file", e)
        }
      }
    }

    Function("cancelDocument") { documents.cancelled = true }

    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      thread(name = "voxa-scan") {
        try {
          promise.resolve(scanner.recognize(uri))
        } catch (e: Throwable) {
          Log.e(TAG, "scan failed", e)
          promise.reject("E_SCAN", e.message ?: "Could not read the text", e)
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
      // The app (or its JS) is going away: no one is left to answer the notification's buttons.
      ListenService.onAction = null
      SpeakService.onAction = null
      try { appContext.reactContext?.let { SpeakService.stop(it) } } catch (_: Throwable) {}
      noticeActive = false
      try { appContext.reactContext?.let { ListenService.stop(it) } } catch (_: Throwable) {}
      speakGen.incrementAndGet()
      listening = false
      releaseModels()
      scanner.release()
    }
  }

  // --- Models ------------------------------------------------------------------

  /**
   * The voice to speak with: "" = built-in Piper LJSpeech medium (VITS, public-domain recordings,
   * chosen over Kitten in Phase 0: first audio 0.55 s vs 1.48 s on a Redmi Note 13), or the id of
   * an installed Piper voice pack. One voice is kept in memory; asking for another replaces it.
   * No lexicon or espeak-ng in sherpa: KittenTokenizer reads the lexicon and passes tokens.
   */
  private fun ensureTts(voice: String = ""): OfflineTts = synchronized(lock) {
    tts?.let { if (ttsVoice == voice) return it }
    val t0 = SystemClock.elapsedRealtime()
    val created: OfflineTts
    val tokens: java.io.BufferedReader
    if (voice.isEmpty()) {
      created = OfflineTts(assetManager = context.assets, config = piperConfig("$MODELS/voice"))
      tokens = context.assets.open("$MODELS/voice/tokens.txt").bufferedReader(Charsets.UTF_8)
    } else {
      val dir = packs.dir(voice)
      if (!java.io.File(dir, "model.onnx").isFile || !java.io.File(dir, "tokens.txt").isFile) {
        throw IllegalStateException("Voice pack $voice is not installed")
      }
      created = OfflineTts(assetManager = null, config = piperConfig(dir.path))
      tokens = java.io.File(dir, "tokens.txt").bufferedReader(Charsets.UTF_8)
    }
    // The lexicon is the same for every voice: read it once, then only swap the token list.
    tokenizer = tokenizer?.withTokens(tokens)
      ?: KittenTokenizer(context.assets.open(lexiconAsset()).bufferedReader(Charsets.UTF_8), tokens)
    val old = tts
    if (old != null) {
      // Older speech was already stopped by the speak call that asked for this voice; wait for
      // any sentence it is still generating, then free the old voice.
      synchronized(genLock) { old.release() }
    }
    ttsLoadMs = SystemClock.elapsedRealtime() - t0
    Log.i(TAG, "voice '${voice.ifEmpty { "built-in" }}' loaded in ${ttsLoadMs} ms: ${created.numSpeakers()} voices at ${created.sampleRate()} Hz, ${tokenizer?.size} lexicon words")
    tts = created
    ttsVoice = voice
    created
  }

  private fun piperConfig(dir: String) = OfflineTtsConfig(
    model = OfflineTtsModelConfig(
      vits = OfflineTtsVitsModelConfig(model = "$dir/model.onnx", tokens = "$dir/tokens.txt"),
      numThreads = TTS_THREADS,
      debug = false,
      provider = "cpu",
    ),
    maxNumSentences = 1,
  )

  private fun kittenConfig() = OfflineTtsConfig(
    model = OfflineTtsModelConfig(
      kitten = OfflineTtsKittenModelConfig(
        model = "$MODELS/tts/model.onnx",
        voices = "$MODELS/tts/voices.bin",
        tokens = "$MODELS/tts/tokens.txt",
      ),
      numThreads = TTS_THREADS,
      debug = false,
      provider = "cpu",
    ),
    maxNumSentences = 1,
  )

  private fun ensureAsr(): OnlineRecognizer = synchronized(lock) {
    val beam = ListenTuning.load(context).beam
    recognizer?.let { if (asrBeam == beam) return it else it.release() }
    recognizer = null
    val t0 = SystemClock.elapsedRealtime()
    val m = models(LISTEN_PACK, "asr", "encoder.onnx")
    val created = OnlineRecognizer(assetManager = m.assets, config = asrConfig(m, endpoint = true, beam = beam))
    asrLoadMs = SystemClock.elapsedRealtime() - t0
    recognizer = created
    asrBeam = beam
    created
  }

  /**
   * Settings test (Engine lab): replays one recording through Live's own pipeline (gain, VAD gate,
   * sentence breaks, recognizer) once per variant, so the scores are what Live would have written.
   * The recording is raw microphone audio, so every variant starts from the same sound.
   */
  private fun runTune(audio: File, variants: List<Map<String, Any?>>): List<Map<String, Any>> {
    val samples = readPcm(audio)
    if (samples.size < ASR_RATE) throw IllegalStateException("The recording is shorter than a second")
    val audioSec = samples.size.toDouble() / ASR_RATE
    synchronized(lock) {
      recognizer?.release()
      recognizer = null
    }
    val m = models(LISTEN_PACK, "asr", "encoder.onnx")
    val vadModel = models(LISTEN_PACK, "vad", "silero_vad.onnx")
    val step = ASR_RATE / 10
    return variants.map { v ->
      val id = v["id"]?.toString().orEmpty()
      val t = ListenTuning.from(v)
      val out = linkedMapOf<String, Any>("id" to id, "audioSec" to audioSec)
      var r: OnlineRecognizer? = null
      var vad: Vad? = null
      var gate: GatedRecognizer? = null
      try {
        r = OnlineRecognizer(assetManager = m.assets, config = asrConfig(m, endpoint = true, beam = t.beam))
        vad = if (t.gate) newVad(vadModel, t.vadThreshold) else null
        val g = GatedRecognizer(r, vad, ASR_RATE, t.pauseMs)
        gate = g
        val agc = if (t.gain) Agc() else null
        val finals = mutableListOf<String>()
        val collect = { res: GatedRecognizer.Result -> if (res.final) finals.add(res.text) }
        val t0 = SystemClock.elapsedRealtime()
        var i = 0
        while (i < samples.size) {
          val end = minOf(i + step, samples.size)
          val chunk = samples.copyOfRange(i, end)
          g.feed(agc?.process(chunk) ?: chunk, collect)
          i = end
        }
        g.finish(collect)
        out["rtf"] = (SystemClock.elapsedRealtime() - t0) / 1000.0 / audioSec
        out["decodedSec"] = g.decodedSamples.toDouble() / ASR_RATE
        out["sentences"] = finals.size
        out["text"] = finals.joinToString(" ")
      } catch (e: Throwable) {
        Log.e(TAG, "tune: $id failed", e)
        out["error"] = e.message ?: e.toString()
      } finally {
        gate?.release()
        vad?.release()
        r?.release()
      }
      Log.i(TAG, "tune: $out")
      out
    }
  }

  /**
   * A streaming transducer in a model folder holding encoder.onnx, decoder.onnx, joiner.onnx and
   * tokens.txt. modelType "" lets sherpa-onnx tell the kind (Zipformer, NeMo) from the model itself.
   */
  private fun asrConfig(m: ModelDir, endpoint: Boolean, modelType: String = "", beam: Boolean = false) = OnlineRecognizerConfig(
    featConfig = FeatureConfig(sampleRate = ASR_RATE, featureDim = 80),
    modelConfig = OnlineModelConfig(
      transducer = OnlineTransducerModelConfig(
        encoder = "${m.path}/encoder.onnx",
        decoder = "${m.path}/decoder.onnx",
        joiner = "${m.path}/joiner.onnx",
      ),
      tokens = "${m.path}/tokens.txt",
      numThreads = 2,
      provider = "cpu",
      modelType = modelType,
    ),
    enableEndpoint = endpoint,
    // Beam search keeps 4 readings alive and picks the best phrase: fewer errors, a little more CPU.
    decodingMethod = if (beam) "modified_beam_search" else "greedy_search",
    maxActivePaths = 4,
  )

  /**
   * Listening-model comparison (Engine lab): runs each candidate on the same recording, fed in
   * 100 ms pieces as if live, and reports its text, speed, load time and memory. Candidates are
   * the listening pack (the model the app uses now) and lab packs from the catalogue. One model
   * is loaded at a time, and the live recognizer is freed first so memory figures are its own.
   */
  private fun runCompare(audio: File, candidates: List<Map<String, String>>): List<Map<String, Any>> {
    val samples = readPcm(audio)
    if (samples.size < ASR_RATE) throw IllegalStateException("The recording is shorter than a second")
    val audioSec = samples.size.toDouble() / ASR_RATE
    synchronized(lock) {
      recognizer?.release()
      recognizer = null
    }
    val step = ASR_RATE / 10
    // Sentences for the offline models, cut once by the VAD (as the app would cut them while listening).
    val sentences by lazy { vadSegments(samples) }
    return candidates.map { c ->
      val id = c["id"].orEmpty()
      val engine = c["engine"].orEmpty().ifEmpty { "online" }
      if (engine != "online") return@map runCompareOffline(id, engine, samples, audioSec) { sentences }
      val out = linkedMapOf<String, Any>("id" to id, "audioSec" to audioSec)
      var r: OnlineRecognizer? = null
      try {
        // Only the listening pack may fall back to the bundled model; a candidate must be its own download.
        val m = when {
          id == LISTEN_PACK -> models(id, "asr", "encoder.onnx")
          hasPack(id, "encoder.onnx") -> ModelDir(null, packs.dir(id).path)
          else -> throw MissingPack(id)
        }
        val before = pssMb()
        var t0 = SystemClock.elapsedRealtime()
        r = OnlineRecognizer(assetManager = m.assets, config = asrConfig(m, endpoint = false, modelType = c["modelType"].orEmpty()))
        out["loadMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
        out["memMb"] = pssMb() - before
        val stream = r.createStream("")
        t0 = SystemClock.elapsedRealtime()
        var i = 0
        while (i < samples.size) {
          val end = minOf(i + step, samples.size)
          stream.acceptWaveform(samples.copyOfRange(i, end), ASR_RATE)
          while (r.isReady(stream)) r.decode(stream)
          i = end
        }
        stream.acceptWaveform(FloatArray(ASR_RATE / 2), ASR_RATE)
        stream.inputFinished()
        while (r.isReady(stream)) r.decode(stream)
        out["rtf"] = (SystemClock.elapsedRealtime() - t0) / 1000.0 / audioSec
        out["text"] = r.getResult(stream).text.trim()
        stream.release()
      } catch (e: MissingPack) {
        out["error"] = "Not downloaded"
      } catch (e: Throwable) {
        Log.e(TAG, "compare: $id failed", e)
        out["error"] = e.message ?: e.toString()
      } finally {
        r?.release()
      }
      Log.i(TAG, "compare: $out")
      out
    }
  }

  /**
   * An offline (whole-sentence) candidate: each VAD sentence is decoded once it has ended, which
   * is how the app would use it after each sentence. RTF counts decoding only; memory is the
   * largest rise seen while loading and decoding.
   */
  private fun runCompareOffline(
    id: String,
    engine: String,
    samples: FloatArray,
    audioSec: Double,
    sentences: () -> List<FloatArray>,
  ): Map<String, Any> {
    val out = linkedMapOf<String, Any>("id" to id, "audioSec" to audioSec)
    var r: OfflineRecognizer? = null
    try {
      val probe = when (engine) {
        "moonshine" -> "encode.int8.onnx"
        "omnilingual" -> "model.int8.onnx"
        else -> throw IllegalArgumentException("Unknown engine $engine")
      }
      if (!hasPack(id, probe)) throw MissingPack(id)
      val dir = packs.dir(id).path
      val model = when (engine) {
        "moonshine" -> OfflineModelConfig(
          moonshine = OfflineMoonshineModelConfig(
            preprocessor = "$dir/preprocess.onnx",
            encoder = "$dir/encode.int8.onnx",
            uncachedDecoder = "$dir/uncached_decode.int8.onnx",
            cachedDecoder = "$dir/cached_decode.int8.onnx",
          ),
          tokens = "$dir/tokens.txt",
          numThreads = 2,
          provider = "cpu",
        )
        else -> OfflineModelConfig(
          omnilingual = OfflineOmnilingualAsrCtcModelConfig(model = "$dir/model.int8.onnx"),
          tokens = "$dir/tokens.txt",
          numThreads = 2,
          provider = "cpu",
        )
      }
      val segs = sentences()
      val before = pssMb()
      var t0 = SystemClock.elapsedRealtime()
      r = OfflineRecognizer(config = OfflineRecognizerConfig(featConfig = FeatureConfig(sampleRate = ASR_RATE, featureDim = 80), modelConfig = model))
      out["loadMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
      var peak = pssMb() - before
      val text = StringBuilder()
      var decodeMs = 0L
      for (seg in segs) {
        val stream = r.createStream()
        t0 = SystemClock.elapsedRealtime()
        stream.acceptWaveform(seg, ASR_RATE)
        r.decode(stream)
        decodeMs += SystemClock.elapsedRealtime() - t0
        val t = r.getResult(stream).text.trim()
        if (t.isNotEmpty()) text.append(if (text.isEmpty()) "" else " ").append(t)
        stream.release()
        peak = maxOf(peak, pssMb() - before)
      }
      out["memMb"] = peak
      out["rtf"] = decodeMs / 1000.0 / audioSec
      out["text"] = text.toString()
      out["sentences"] = segs.size
    } catch (e: MissingPack) {
      out["error"] = "Not downloaded"
    } catch (e: Throwable) {
      Log.e(TAG, "compare: $id failed", e)
      out["error"] = e.message ?: e.toString()
    } finally {
      r?.release()
    }
    Log.i(TAG, "compare: $out")
    return out
  }

  /** Speech pieces as the VAD cuts them (sentences or phrases), padded with a little silence. */
  private fun vadSegments(samples: FloatArray): List<FloatArray> {
    val vad = newVad()
    val out = mutableListOf<FloatArray>()
    val pad = FloatArray(ASR_RATE / 4)
    val drain = {
      while (!vad.empty()) {
        out += pad + vad.front().samples + pad
        vad.pop()
      }
    }
    try {
      var i = 0
      while (i + VAD_WINDOW <= samples.size) {
        vad.acceptWaveform(samples.copyOfRange(i, i + VAD_WINDOW))
        drain()
        i += VAD_WINDOW
      }
      vad.flush()
      drain()
    } finally {
      vad.release()
    }
    return out
  }

  /** 16-bit little-endian mono PCM (what startListening records) as floats. */
  private fun readPcm(f: File): FloatArray {
    val bytes = f.readBytes()
    val n = bytes.size / 2
    return FloatArray(n) { i ->
      val v = (bytes[2 * i].toInt() and 0xff) or (bytes[2 * i + 1].toInt() shl 8)
      v.toShort() / 32768f
    }
  }

  /** Punctuation and capitals for finished sentences, or null when the model is not in this build. */
  private fun ensurePunct(): OnlinePunctuation? = synchronized(lock) {
    if (punctTried) return punct
    punctTried = true
    if (!assetExists("$MODELS/punct/model.onnx")) return null
    try {
      val t0 = SystemClock.elapsedRealtime()
      punct = OnlinePunctuation(
        assetManager = context.assets,
        config = OnlinePunctuationConfig(
          model = OnlinePunctuationModelConfig(
            cnnBilstm = "$MODELS/punct/model.onnx",
            bpeVocab = "$MODELS/punct/bpe.vocab",
            numThreads = 1,
            provider = "cpu",
          ),
        ),
      )
      Log.i(TAG, "punctuation loaded in ${SystemClock.elapsedRealtime() - t0} ms")
    } catch (e: Throwable) {
      Log.e(TAG, "punctuation failed to load; transcripts stay unpunctuated", e)
    }
    punct
  }

  /** "THE YELLOW LAMPS WOULD LIGHT UP" → "The yellow lamps would light up." */
  private fun punctuate(text: String): String {
    val p = ensurePunct() ?: return text
    return try { p.addPunctuation(text.lowercase()) } catch (e: Throwable) { Log.e(TAG, "punctuation failed", e); text }
  }

  private fun releaseModels() = synchronized(lock) {
    punct?.release(); punct = null; punctTried = false
    synchronized(genLock) { tts?.release() }; tts = null; tokenizer = null; ttsVoice = ""
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
    /** False once this speech was stopped or its voice replaced: then nothing is generated. */
    alive: () -> Boolean = { true },
  ): GeneratedAudio? {
    val tokens = tk.tokenize(text, overrides, fallbacks, skipped)
    // Only spaces and punctuation means nothing to say.
    if (tokens.none { t -> t.any { it.isLetter() } }) return null
    val cfg = GenerationConfig(sid = sid, speed = speed, tokens = arrayOf(tokens.toTypedArray()))
    val audio = synchronized(genLock) {
      if (!alive()) return null
      engine.generateWithConfig(text, cfg)
    }
    return if (audio.samples.isEmpty()) null else audio
  }

  /** The sentences of each piece, carrying its speed and loudness; silence after as the plan says. */
  private fun plannedSentences(text: String, pieces: List<Piece>): List<Sentence> {
    val out = ArrayList<Sentence>()
    for (p in pieces) {
      if (p.end < p.start) continue
      val inPiece = splitSentences(text.substring(p.start, p.end))
      if (inPiece.isEmpty()) {
        if (p.pauseMs > 0) out.add(Sentence(p.start, p.start, "", pauseMs = p.pauseMs))
        continue
      }
      inPiece.forEachIndexed { i, s ->
        val last = i == inPiece.size - 1
        val ends = s.text.trimEnd().lastOrNull()?.let { it in ".!?" } ?: false
        val gap = if (ends) p.gapMs else 0
        out.add(Sentence(p.start + s.start, p.start + s.end, s.text, p.speed, p.gain, gap + if (last) p.pauseMs else 0))
      }
    }
    return out
  }

  @Suppress("UNCHECKED_CAST")
  private fun runExport(text: String, options: Map<String, Any?>, dest: File): Map<String, Any> {
    val voice = options["voice"] as? String ?: ""
    val sid = (options["sid"] as? Number)?.toInt() ?: 0
    val speed = ((options["speed"] as? Number)?.toFloat() ?: 1f).coerceIn(0.3f, 3f)
    val overrides = options["overrides"] as? Map<String, String> ?: emptyMap()
    val fallbacks = options["fallbacks"] as? Map<String, String> ?: emptyMap()
    val plan = (options["plan"] as? List<Map<String, Any?>>)?.map { m ->
      fun n(k: String, d: Double = 0.0) = (m[k] as? Number)?.toDouble() ?: d
      Piece(
        n("start").toInt().coerceIn(0, text.length),
        n("end").toInt().coerceIn(0, text.length),
        n("speed", 1.0).toFloat().coerceIn(0.3f, 3f),
        n("gain", 1.0).toFloat().coerceIn(0f, 2f),
        n("pauseMs").toInt().coerceIn(0, 10_000),
        n("gapMs").toInt().coerceIn(0, 3_000),
      )
    }
    val engine = ensureTts(voice)
    val rate = engine.sampleRate()
    val sentences = if (plan != null) plannedSentences(text, plan) else splitSentences(text)
    val tmp = File(dest.path + ".part")
    val writer = AacWriter(tmp, rate)
    try {
      // A short lead-in so players do not clip the first word.
      writer.writeSilence(rate / 5)
      sentences.forEachIndexed { i, s ->
        if (exportCancelled) throw InterruptedException("Cancelled")
        val audio = if (s.text.isBlank()) null else synth(engine, s.text, sid, speed * s.speed, overrides, fallbacks, alive = { !exportCancelled })
        val samples = audio?.samples ?: FloatArray(0)
        if (s.gain != 1f) for (k in samples.indices) samples[k] *= s.gain
        writer.write(samples)
        writer.writeSilence((s.pauseMs.toLong() * rate / 1000).toInt())
        sendEvent("onExport", mapOf("fraction" to (i + 1).toDouble() / sentences.size))
      }
      if (exportCancelled) throw InterruptedException("Cancelled")
      writer.writeSilence(rate / 5)
      val ms = writer.finish()
      if (dest.exists()) dest.delete()
      check(tmp.renameTo(dest)) { "Could not save the audio file" }
      return mapOf("durationMs" to ms.toDouble(), "bytes" to dest.length().toDouble())
    } catch (e: Throwable) {
      writer.abort()
      throw e
    }
  }

  private fun runSpeak(
    id: Int,
    gen: Int,
    text: String,
    sid: Int,
    speed: Float,
    overrides: Map<String, String>,
    fallbacks: Map<String, String>,
    voice: String,
    pieces: List<Piece>? = null,
  ) {
    fun live() = speakGen.get() == gen
    var private = false
    try {
      val engine = ensureTts(voice)
      if (!live()) return
      val words = WORD.findAll(text).toList()
      val sentences = if (pieces != null) plannedSentences(text, pieces) else splitSentences(text)
      emitSpeak(id, "start")
      if (sentences.isEmpty()) { emitSpeak(id, "end"); return }

      val rate = engine.sampleRate()
      val minBuf = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
      private = privateOutput
      if (private) routePrivate(true)
      val track = AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(if (private) AudioAttributes.USAGE_VOICE_COMMUNICATION else AudioAttributes.USAGE_MEDIA)
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
        // ~250 ms of float audio. Must be a whole number of 4-byte frames: 22050 Hz (Piper)
        // is not, and AudioTrack then refuses it with "Invalid audio buffer size".
        .setBufferSizeInBytes((max(minBuf, rate) + 3) / 4 * 4)
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
        val audio = if (s.text.isBlank()) null else synth(engine, s.text, sid, speed * s.speed, overrides, fallbacks, skipped, alive = ::live)
        if (first) {
          first = false
          emitSpeak(id, "metrics", mapOf("firstAudioMs" to (SystemClock.elapsedRealtime() - t0).toDouble()))
        }
        // A piece with no speakable words still goes to the player so its words are passed over.
        val speech = audio?.samples ?: FloatArray(0)
        if (s.gain != 1f) for (i in speech.indices) speech[i] = (speech[i] * s.gain).coerceIn(-1f, 1f)
        val silence = (s.pauseMs.toLong() * rate / 1000).toInt()
        val chunk = if (silence > 0) Chunk(s.start, s.end, speech.copyOf(speech.size + silence), speech.size) else Chunk(s.start, s.end, speech)
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
    } finally {
      // Hand the audio route back, unless a newer private speech is using it (it clears it when done).
      if (private && (live() || !privateOutput)) routePrivate(false)
    }
  }

  /** Private output: call-style audio to earbuds if any are connected, otherwise the earpiece. */
  private fun routePrivate(on: Boolean) {
    val am = context.getSystemService(AudioManager::class.java) ?: return
    try {
      if (Build.VERSION.SDK_INT >= 31) {
        if (!on) {
          am.clearCommunicationDevice()
          return
        }
        val devices = am.availableCommunicationDevices
        val preferred = listOf(
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_BLE_HEADSET,
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
          AudioDeviceInfo.TYPE_USB_HEADSET,
          AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
        )
        val device = preferred.firstNotNullOfOrNull { t -> devices.firstOrNull { it.type == t } }
        if (device != null) am.setCommunicationDevice(device)
      } else {
        @Suppress("DEPRECATION")
        if (on) {
          am.mode = AudioManager.MODE_IN_COMMUNICATION
          am.isSpeakerphoneOn = false
        } else {
          am.mode = AudioManager.MODE_NORMAL
        }
      }
    } catch (e: Throwable) {
      Log.w(TAG, "could not change the audio route", e)
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
          marks.add(written + acc.toLong() * chunk.speechFrames / total to wi)
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
  private fun runListen(started: Promise, audio: File?) {
    var resolved = false
    var rec: AudioRecord? = null
    var audioOut: java.io.OutputStream? = null
    var heard = 0L
    lastHeardMs = 0L
    try {
      // Appended, so a paused-then-resumed meeting stays one recording. Buffered 64 KB (~2 s).
      audioOut = audio?.let {
        it.parentFile?.mkdirs()
        java.io.BufferedOutputStream(java.io.FileOutputStream(it, true), 64 * 1024)
      }
      val r = ensureAsr()
      val minBuf = AudioRecord.getMinBufferSize(ASR_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, ASR_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(minBuf, ASR_RATE))
      if (rec.state != AudioRecord.STATE_INITIALIZED) throw IllegalStateException("The microphone is busy")
      rec.startRecording()
      started.resolve(mapOf("loadMs" to asrLoadMs.toDouble()))
      resolved = true

      val tuning = ListenTuning.load(context)
      val vad = if (tuning.gate) newVad(tuning.vadThreshold) else null
      val gate = GatedRecognizer(r, vad, ASR_RATE, tuning.pauseMs)
      val agc = if (tuning.gain) Agc() else null
      Log.i(TAG, "listening with $tuning")
      val buf = ShortArray(ASR_RATE / 10) // 100 ms
      val bytes = ByteArray(buf.size * 2)
      var segment = 0
      // Times come from the audio itself, so they line up with a recording of the session.
      ensurePunct()
      val onResult = { res: GatedRecognizer.Result ->
        val text = if (res.final) punctuate(res.text) else res.text
        emitSegment(segment, text, res.startMs, res.endMs, res.final)
        if (res.final) segment++
      }
      try {
        while (listening) {
          val n = rec.read(buf, 0, buf.size)
          if (n <= 0) continue
          heard += n
          lastHeardMs = heard * 1000 / ASR_RATE
          audioOut?.let { out ->
            for (i in 0 until n) {
              val v = buf[i].toInt()
              bytes[2 * i] = (v and 0xff).toByte()
              bytes[2 * i + 1] = ((v shr 8) and 0xff).toByte()
            }
            out.write(bytes, 0, n * 2)
          }
          var sum = 0.0
          val samples = FloatArray(n) { val v = buf[it] / 32768f; sum += v * v; v }
          emitListen("level", mapOf("rms" to sqrt(sum / n)))
          // The saved recording stays raw; only what the model hears is levelled.
          gate.feed(agc?.process(samples) ?: samples, onResult)
        }
        gate.finish(onResult)
        Log.i(TAG, "listened ${gate.heardSamples / ASR_RATE} s, recognizer ran on ${gate.decodedSamples / ASR_RATE} s")
      } finally {
        gate.release()
        vad?.release()
      }
    } catch (e: Throwable) {
      Log.e(TAG, "listen failed", e)
      if (!resolved) started.reject("E_LISTEN", e.message ?: "Could not start listening", e)
      else emitListen("error", mapOf("message" to (e.message ?: "Listening failed")))
    } finally {
      try { rec?.stop() } catch (_: Throwable) {}
      rec?.release()
      try { audioOut?.close() } catch (_: Throwable) {}
      listening = false
      // While a session is only paused, the service (and its notification) stays for Resume.
      if (!noticeActive) ListenService.stop(context)
    }
  }

  /**
   * pyannote segmentation + CAM++ embeddings. numClusters = -1: the number of speakers is not
   * known, so the threshold decides (higher = fewer speakers).
   */
  private fun diarConfig(m: ModelDir, threshold: Float) = OfflineSpeakerDiarizationConfig(
    segmentation = OfflineSpeakerSegmentationModelConfig(
      pyannote = OfflineSpeakerSegmentationPyannoteModelConfig(model = "${m.path}/segmentation.onnx"),
      numThreads = 2,
    ),
    embedding = SpeakerEmbeddingExtractorConfig(model = "${m.path}/embedding.onnx", numThreads = 2),
    clustering = FastClusteringConfig(numClusters = -1, threshold = threshold),
    minDurationOn = 0.3f,
    minDurationOff = 0.5f,
  )

  /** A path inside the app's files folder, or null if it points anywhere else. */
  private fun appFile(path: String): File? {
    val root = context.filesDir.canonicalFile
    val f = File(root, path).canonicalFile
    return if (f.path.startsWith(root.path + File.separator)) f else null
  }

  private fun runLabel(audio: File): List<SpeakerLabeller.Turn> {
    val m = models(SPEAKERS_PACK, "diar", "embedding.onnx")
    val diar = OfflineSpeakerDiarization(assetManager = m.assets, config = diarConfig(m, LABEL_THRESHOLD))
    val extractor = SpeakerEmbeddingExtractor(
      m.assets,
      SpeakerEmbeddingExtractorConfig(model = "${m.path}/embedding.onnx", numThreads = 2),
    )
    try {
      var lastSent = -1
      return SpeakerLabeller(diar, extractor, ASR_RATE).label(audio, { labelCancel }) { fraction ->
        val pct = (fraction * 100).toInt()
        if (pct != lastSent) {
          lastSent = pct
          sendEvent("onLabel", mapOf("fraction" to fraction))
        }
      }
    } finally {
      extractor.release()
      diar.release()
    }
  }

  private fun emitSegment(index: Int, text: String, startMs: Long, endMs: Long, final: Boolean) {
    emitListen(
      "segment",
      mapOf("index" to index, "text" to text, "startMs" to startMs.toDouble(), "endMs" to endMs.toDouble(), "final" to final),
    )
  }

  // --- Packs ---------------------------------------------------------------------------

  private fun runInstall(id: String, manifest: String, files: List<PackStore.PackFile>) {
    var lastEmit = 0L
    try {
      packs.install(id, manifest, files, cancelled = { packCancels[id] == true }) { done, total ->
        val now = SystemClock.elapsedRealtime()
        if (now - lastEmit >= 250 || done == total) {
          lastEmit = now
          sendEvent("onPack", mapOf("id" to id, "type" to "progress", "done" to done.toDouble(), "total" to total.toDouble()))
        }
      }
      sendEvent("onPack", mapOf("id" to id, "type" to "installed"))
    } catch (e: PackStore.Cancelled) {
      sendEvent("onPack", mapOf("id" to id, "type" to "cancelled"))
    } catch (e: Throwable) {
      Log.e(TAG, "pack $id failed", e)
      sendEvent("onPack", mapOf("id" to id, "type" to "error", "message" to (e.message ?: "Download failed")))
    } finally {
      packCancels.remove(id)
    }
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
  private fun newVad(threshold: Float = 0.5f): Vad {
    val m = models(LISTEN_PACK, "vad", "silero_vad.onnx")
    return newVad(m, threshold)
  }

  private fun newVad(m: ModelDir, threshold: Float = 0.5f) = Vad(
    assetManager = m.assets,
    config = VadModelConfig(
      sileroVadModelConfig = SileroVadModelConfig(
        model = "${m.path}/silero_vad.onnx",
        threshold = threshold,
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

  /** Benchmark clips: in bench/ (slim builds), or beside their models (older asset layouts). */
  private fun benchClip(name: String): String =
    if (assetExists("$MODELS/bench/$name.wav")) "$MODELS/bench/$name.wav" else "$MODELS/$name/benchmark.wav"

  private fun lexiconAsset(): String =
    if (assetExists("$MODELS/voice/lexicon.txt")) "$MODELS/voice/lexicon.txt" else "$MODELS/tts/lexicon.txt"

  /** Where a set of models lives: an installed pack (real files, no asset manager) or the copy bundled in the app. */
  private class ModelDir(val assets: android.content.res.AssetManager?, val path: String)

  /** Thrown when neither the pack nor a bundled copy is there; the app offers the download. */
  class MissingPack(val packId: String) : IllegalStateException("NEEDS_PACK:$packId")

  private fun hasPack(packId: String, probe: String) =
    packs.installed().contains(packId) && File(packs.dir(packId), probe).isFile

  private fun models(packId: String, assetDir: String, probe: String): ModelDir = when {
    hasPack(packId, probe) -> ModelDir(null, packs.dir(packId).path)
    assetExists("$MODELS/$assetDir/$probe") -> ModelDir(context.assets, "$MODELS/$assetDir")
    else -> throw MissingPack(packId)
  }

  /** Which model sets are ready, bundled or downloaded. */
  private fun modelStatus() = mapOf(
    "listen" to (hasPack(LISTEN_PACK, "encoder.onnx") || assetExists("$MODELS/asr/encoder.onnx")),
    "speakers" to (hasPack(SPEAKERS_PACK, "embedding.onnx") || assetExists("$MODELS/diar/embedding.onnx")),
    "bundledListen" to assetExists("$MODELS/asr/encoder.onnx"),
    "bundledSpeakers" to assetExists("$MODELS/diar/embedding.onnx"),
  )

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
    out["ttsName"] = "Piper LJSpeech"

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

    // Kitten nano for comparison (the Phase 0 runner-up). Loaded only here and released at once,
    // so the peak memory below is for the models the app really uses.
    if (assetExists("$MODELS/tts/model.onnx")) {
      out["compareName"] = "Kitten nano"
      t0 = SystemClock.elapsedRealtime()
      val other = OfflineTts(assetManager = context.assets, config = kittenConfig())
      try {
        val otk = tokenizer!!.withTokens(context.assets.open("$MODELS/tts/tokens.txt").bufferedReader(Charsets.UTF_8))
        out["compareLoadMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
        t0 = SystemClock.elapsedRealtime()
        synth(other, "Hello there.", 0, 1f, tk = otk) ?: throw IllegalStateException("Kitten produced no audio")
        out["compareFirstAudioMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
        t0 = SystemClock.elapsedRealtime()
        val oa = synth(other, sample, 0, 1f, tk = otk) ?: throw IllegalStateException("Kitten produced no audio")
        val oMs = SystemClock.elapsedRealtime() - t0
        out["compareRtf"] = oMs / 1000.0 / (oa.samples.size.toDouble() / oa.sampleRate)
      } catch (e: Throwable) {
        Log.e(TAG, "comparison voice failed", e)
        out["compareError"] = e.message ?: e.toString()
      } finally {
        other.release()
      }
    }

    out["asrCold"] = recognizer == null
    val beforeAsr = pssMb()
    val r = ensureAsr()
    out["asrLoadMs"] = asrLoadMs.toDouble()
    val wave = WaveReader.readWave(context.assets, benchClip("asr"))
    val stream = r.createStream("")
    t0 = SystemClock.elapsedRealtime()
    stream.acceptWaveform(wave.samples, wave.sampleRate)
    stream.acceptWaveform(FloatArray(wave.sampleRate / 2), wave.sampleRate)
    stream.inputFinished()
    while (r.isReady(stream)) r.decode(stream)
    val asrMs = SystemClock.elapsedRealtime() - t0
    val asrSec = wave.samples.size.toDouble() / wave.sampleRate
    val heard = r.getResult(stream).text.trim()
    out["asrText"] = heard
    if (ensurePunct() != null) {
      t0 = SystemClock.elapsedRealtime()
      out["asrPunctuated"] = punctuate(heard)
      out["punctMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
    }
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
    val dm = models(SPEAKERS_PACK, "diar", "embedding.onnx")
    val diar = OfflineSpeakerDiarization(assetManager = dm.assets, config = diarConfig(dm, 0.5f))
    out["diarLoadMs"] = (SystemClock.elapsedRealtime() - t0).toDouble()
    try {
      val clip = WaveReader.readWave(context.assets, benchClip("diar"))
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
