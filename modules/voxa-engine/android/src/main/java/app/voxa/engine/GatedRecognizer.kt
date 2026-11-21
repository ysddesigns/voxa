package app.voxa.engine

import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.Vad

/**
 * Streaming recognition that only runs while someone is speaking.
 *
 * Silero VAD watches every 100 ms of microphone audio. While it hears no speech the recognizer
 * is not fed at all; the last half second is kept so the start of the first word is not lost.
 * A pause of [PAUSE_MS] ends the sentence even if the recognizer's own endpoint rule has not
 * fired, which gives cleaner sentence breaks in noisy rooms.
 *
 * In a meeting much of the audio is silence or pauses, so this saves battery on long sessions.
 * Not thread-safe: use from the one listening thread.
 */
class GatedRecognizer(
  private val recognizer: OnlineRecognizer,
  private val vad: Vad,
  private val rate: Int,
) {
  class Result(val text: String, val final: Boolean, val startMs: Long, val endMs: Long)

  private var stream = recognizer.createStream("")
  private val preRoll = ArrayDeque<FloatArray>()
  private var preRollSamples = 0
  private var speaking = false
  private var silentSamples = 0
  private var segStartMs = 0L
  private var last = ""

  /** All audio given to [feed], in samples: the session's clock. */
  var heardSamples = 0L
    private set

  /** Audio that actually went through the recognizer, and the time it took. */
  var decodedSamples = 0L
    private set
  var decodeNs = 0L
    private set

  fun feed(samples: FloatArray, out: (Result) -> Unit) {
    val chunkStart = heardSamples
    heardSamples += samples.size
    vad.acceptWaveform(samples)
    val voiced = vad.isSpeechDetected()
    // Only the speech/no-speech flag is used; drop the VAD's own copies of speech segments.
    while (!vad.empty()) vad.pop()

    if (!speaking) {
      if (!voiced) {
        preRoll.addLast(samples)
        preRollSamples += samples.size
        while (preRoll.size > 1 && preRollSamples - preRoll.first().size >= rate / 2) {
          preRollSamples -= preRoll.removeFirst().size
        }
        return
      }
      speaking = true
      silentSamples = 0
      segStartMs = ms(chunkStart - preRollSamples)
      for (p in preRoll) decode(p)
      preRoll.clear()
      preRollSamples = 0
    }

    decode(samples)
    silentSamples = if (voiced) 0 else silentSamples + samples.size
    val now = ms(heardSamples)
    val text = recognizer.getResult(stream).text.trim()
    if (text != last) {
      last = text
      if (text.isNotEmpty()) out(Result(text, false, segStartMs, now))
    }

    val paused = silentSamples >= rate.toLong() * PAUSE_MS / 1000
    if (paused || recognizer.isEndpoint(stream)) {
      // A little silence lets the model finish the last word before the sentence is closed.
      if (paused) decode(FloatArray(rate * 3 / 10))
      val final = recognizer.getResult(stream).text.trim()
      if (final.isNotEmpty()) out(Result(final, true, segStartMs, now))
      recognizer.reset(stream)
      last = ""
      segStartMs = now
      if (paused) speaking = false
    }
  }

  /** Closes the last sentence when listening stops. The recognizer cannot be fed after this. */
  fun finish(out: (Result) -> Unit) {
    if (speaking) {
      decode(FloatArray(rate / 2))
      stream.inputFinished()
      while (recognizer.isReady(stream)) recognizer.decode(stream)
      val text = recognizer.getResult(stream).text.trim()
      if (text.isNotEmpty()) out(Result(text, true, segStartMs, ms(heardSamples)))
    }
    speaking = false
  }

  fun release() {
    stream.release()
  }

  private fun decode(samples: FloatArray) {
    val t = System.nanoTime()
    stream.acceptWaveform(samples, rate)
    while (recognizer.isReady(stream)) recognizer.decode(stream)
    decodeNs += System.nanoTime() - t
    decodedSamples += samples.size
  }

  private fun ms(samples: Long) = samples * 1000 / rate

  companion object {
    /** Silence that ends a sentence. */
    const val PAUSE_MS = 800
  }
}
