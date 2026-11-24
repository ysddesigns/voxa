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
 * With no [vad] every chunk is decoded and only the recognizer's endpoint rule ends sentences
 * (the settings test compares both). [hotwords] are custom words to boost, "/" between them
 * (beam search only). Not thread-safe: use from the one listening thread.
 */
class GatedRecognizer(
  private val recognizer: OnlineRecognizer,
  private val vad: Vad?,
  private val rate: Int,
  private val pauseMs: Int = PAUSE_MS,
  private val hotwords: String = "",
) : ListeningGate {
  class Result(val text: String, val final: Boolean, val startMs: Long, val endMs: Long)

  private var stream = recognizer.createStream(hotwords)
  private val preRoll = ArrayDeque<FloatArray>()
  private var preRollSamples = 0
  private var speaking = false
  private var silentSamples = 0
  private var segStartMs = 0L
  private var last = ""

  /** All audio given to [feed], in samples: the session's clock. */
  override var heardSamples = 0L
    private set

  /** Audio that actually went through the recognizer, and the time it took. */
  override var decodedSamples = 0L
    private set
  var decodeNs = 0L
    private set

  override fun feed(samples: FloatArray, out: (Result) -> Unit) {
    val chunkStart = heardSamples
    heardSamples += samples.size
    val voiced = if (vad == null) {
      true
    } else {
      vad.acceptWaveform(samples)
      // Only the speech/no-speech flag is used; drop the VAD's own copies of speech segments.
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

    val paused = silentSamples >= rate.toLong() * pauseMs / 1000
    if (paused || recognizer.isEndpoint(stream)) {
      // Close the sentence properly: tell the model no more audio is coming so it writes out the
      // last word it is still holding (a streaming model looks a little ahead), then start a fresh
      // stream. Reading the text and resetting straight away lost each sentence's final word.
      flush()
      val final = recognizer.getResult(stream).text.trim()
      if (final.isNotEmpty()) out(Result(final, true, segStartMs, now))
      stream.release()
      stream = recognizer.createStream(hotwords)
      last = ""
      segStartMs = now
      if (paused) speaking = false
    }
  }

  /** Closes the last sentence when listening stops. The recognizer cannot be fed after this. */
  override fun finish(out: (Result) -> Unit) {
    // A short last word ("ten.") right before Stop may still be waiting for the VAD to confirm it.
    // Ask the VAD to decide on what it has; if it was speech, decode the held audio too.
    if (!speaking && vad != null && preRoll.isNotEmpty()) {
      vad.flush()
      if (!vad.empty()) {
        speaking = true
        segStartMs = ms(heardSamples - preRollSamples)
        for (p in preRoll) decode(p)
      }
      while (!vad.empty()) vad.pop()
      preRoll.clear()
      preRollSamples = 0
    }
    if (speaking) {
      flush()
      val text = recognizer.getResult(stream).text.trim()
      if (text.isNotEmpty()) out(Result(text, true, segStartMs, ms(heardSamples)))
    }
    speaking = false
  }

  override fun release() {
    stream.release()
  }

  /** Half a second of silence, then end of input: the model emits everything it heard. */
  private fun flush() {
    decode(FloatArray(rate / 2))
    val t = System.nanoTime()
    stream.inputFinished()
    while (recognizer.isReady(stream)) recognizer.decode(stream)
    decodeNs += System.nanoTime() - t
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
    /** Silence that ends a sentence (1.2s default allows natural pauses without premature splitting). */
    const val PAUSE_MS = 1200
  }
}
