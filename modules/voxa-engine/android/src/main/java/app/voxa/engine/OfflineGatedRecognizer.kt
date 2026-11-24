package app.voxa.engine

import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.Vad
import java.util.ArrayDeque

/**
 * Whole-sentence recognition for offline models (Omnilingual 300M, Moonshine) in Live listening.
 *
 * Silero VAD monitors each 100 ms chunk. While speech continues, it buffers the 16 kHz audio.
 * When a silence of [pauseMs] is reached (or after [MAX_SENTENCE_SEC] of continuous speech),
 * the buffered waveform is decoded by [recognizer] and emitted as a finalized sentence.
 */
class OfflineGatedRecognizer(
  private val recognizer: OfflineRecognizer,
  private val vad: Vad?,
  private val rate: Int,
  private val pauseMs: Int = GatedRecognizer.PAUSE_MS,
) : ListeningGate {
  private val preRoll = ArrayDeque<FloatArray>()
  private var preRollSamples = 0
  private val speechChunks = ArrayList<FloatArray>()
  private var speechSamples = 0
  private var speaking = false
  private var silentSamples = 0
  private var segStartMs = 0L

  override var heardSamples = 0L
    private set
  override var decodedSamples = 0L
    private set
  var decodeNs = 0L
    private set

  override fun feed(samples: FloatArray, out: (GatedRecognizer.Result) -> Unit) {
    val chunkStart = heardSamples
    heardSamples += samples.size
    val voiced = if (vad == null) {
      true
    } else {
      vad.acceptWaveform(samples)
      vad.isSpeechDetected().also { while (!vad.empty()) vad.pop() }
    }

    if (!speaking) {
      if (!voiced) {
        preRoll.addLast(samples)
        preRollSamples += samples.size
        while (preRoll.size > 1 && preRollSamples - preRoll.first().size >= rate * 3 / 4) {
          preRollSamples -= preRoll.removeFirst().size
        }
        return
      }
      speaking = true
      silentSamples = 0
      segStartMs = ms(chunkStart - preRollSamples)
      for (p in preRoll) {
        speechChunks.add(p)
        speechSamples += p.size
      }
      preRoll.clear()
      preRollSamples = 0
      out(GatedRecognizer.Result("…", false, segStartMs, ms(heardSamples)))
    }

    speechChunks.add(samples)
    speechSamples += samples.size
    silentSamples = if (voiced) 0 else silentSamples + samples.size
    val now = ms(heardSamples)

    val paused = silentSamples >= rate.toLong() * pauseMs / 1000
    val maxLen = speechSamples >= rate * MAX_SENTENCE_SEC
    if (paused || maxLen) {
      val text = decodeSentence()
      if (text.isNotEmpty()) {
        out(GatedRecognizer.Result(text, true, segStartMs, now))
      }
      speechChunks.clear()
      speechSamples = 0
      silentSamples = 0
      speaking = false
      segStartMs = now
    }
  }

  override fun finish(out: (GatedRecognizer.Result) -> Unit) {
    if (speaking && speechSamples > 0) {
      val text = decodeSentence()
      if (text.isNotEmpty()) {
        out(GatedRecognizer.Result(text, true, segStartMs, ms(heardSamples)))
      }
    }
    speechChunks.clear()
    speechSamples = 0
    speaking = false
  }

  override fun release() {
    speechChunks.clear()
    preRoll.clear()
  }

  private fun decodeSentence(): String {
    if (speechSamples < rate / 4) return ""
    val total = FloatArray(speechSamples)
    var offset = 0
    for (chunk in speechChunks) {
      System.arraycopy(chunk, 0, total, offset, chunk.size)
      offset += chunk.size
    }
    val t0 = System.nanoTime()
    val stream = recognizer.createStream()
    stream.acceptWaveform(total, rate)
    recognizer.decode(stream)
    val text = recognizer.getResult(stream).text.trim()
    stream.release()
    decodeNs += System.nanoTime() - t0
    decodedSamples += speechSamples
    return text
  }

  private fun ms(samples: Long) = samples * 1000 / rate

  companion object {
    const val MAX_SENTENCE_SEC = 12
  }
}
