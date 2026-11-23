package app.voxa.engine

import android.content.Context
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * How Live turns sound into words. The Engine lab's settings test scores variants on the person's
 * own recording and can save the best one, which Live then uses (no rebuild needed).
 *
 * Defaults since 24 Nov 2026: beam search and the volume boost. On a Nigerian-English reading of
 * the test passage, beam search cut word error by about 2 points at the same speed; the boost
 * changed nothing for a close voice and is there for the far side of a meeting table. The voice
 * gate stays: without it the model writes words for room noise and runs through every silence.
 *
 * - beam: modified beam search over 4 paths instead of greedy search (more accurate, a little slower).
 * - gain: [Agc] raises quiet speech (far side of a meeting table) before recognition.
 * - vadThreshold: how sure Silero must be that someone is speaking (lower lets soft voices through).
 * - pauseMs: silence that ends a sentence and restarts the recognizer.
 * - gate: run the recognizer only while the VAD hears speech; false feeds everything and ends
 *   sentences by the recognizer's own endpoint rule.
 * - words: boost the custom words ([ListenWords]); needs beam search.
 * - wordsScore: how strongly (bonus per matched word piece). Too high writes names for words that
 *   only sound alike.
 */
data class ListenTuning(
  val beam: Boolean = true,
  val gain: Boolean = true,
  val vadThreshold: Float = 0.5f,
  val pauseMs: Int = GatedRecognizer.PAUSE_MS,
  val gate: Boolean = true,
  val words: Boolean = true,
  val wordsScore: Float = ListenWords.SCORE,
) {
  fun toMap(): Map<String, Any> = mapOf(
    "beam" to beam,
    "gain" to gain,
    "vadThreshold" to vadThreshold.toDouble(),
    "pauseMs" to pauseMs,
    "gate" to gate,
    "words" to words,
    "wordsScore" to wordsScore.toDouble(),
  )

  companion object {
    private const val PREFS = "voxa-listen-tuning"

    fun from(m: Map<String, Any?>): ListenTuning {
      val d = ListenTuning()
      fun num(k: String) = (m[k] as? Number)?.toDouble()
      return ListenTuning(
        beam = m["beam"] as? Boolean ?: d.beam,
        gain = m["gain"] as? Boolean ?: d.gain,
        vadThreshold = (num("vadThreshold") ?: d.vadThreshold.toDouble()).toFloat().coerceIn(0.1f, 0.9f),
        pauseMs = (num("pauseMs") ?: d.pauseMs.toDouble()).toInt().coerceIn(300, 3000),
        gate = m["gate"] as? Boolean ?: d.gate,
        words = m["words"] as? Boolean ?: d.words,
        wordsScore = (num("wordsScore") ?: d.wordsScore.toDouble()).toFloat().coerceIn(0.5f, 8f),
      )
    }

    fun load(context: Context): ListenTuning {
      val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val d = ListenTuning()
      return ListenTuning(
        beam = p.getBoolean("beam", d.beam),
        gain = p.getBoolean("gain", d.gain),
        vadThreshold = p.getFloat("vadThreshold", d.vadThreshold),
        pauseMs = p.getInt("pauseMs", d.pauseMs),
        gate = p.getBoolean("gate", d.gate),
        words = p.getBoolean("words", d.words),
        wordsScore = p.getFloat("wordsScore", d.wordsScore),
      )
    }

    fun save(context: Context, t: ListenTuning) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean("beam", t.beam)
        .putBoolean("gain", t.gain)
        .putFloat("vadThreshold", t.vadThreshold)
        .putInt("pauseMs", t.pauseMs)
        .putBoolean("gate", t.gate)
        .putBoolean("words", t.words)
        .putFloat("wordsScore", t.wordsScore)
        .apply()
    }

    fun reset(context: Context) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
  }
}

/**
 * Slow automatic gain for speech: follows the level of speech (not of silence) and lifts it toward
 * [TARGET], at most [MAX_GAIN] times, so a quiet speaker reaches the model at a normal loudness.
 * Gain moves gradually and a soft limiter keeps loud peaks from clipping. Silence is not boosted
 * past the gain speech last needed, so room noise is not pumped up between sentences.
 * Not thread-safe: one per listening run.
 */
class Agc {
  private var speechLevel = TARGET
  private var gain = 1f

  fun process(x: FloatArray): FloatArray {
    var sum = 0.0
    for (v in x) sum += v * v
    val rms = sqrt(sum / x.size.coerceAtLeast(1)).toFloat()
    // Only chunks loud enough to be speech move the estimate; quick to rise, slow to fall.
    if (rms > NOISE_FLOOR) speechLevel = if (rms > speechLevel) 0.6f * speechLevel + 0.4f * rms else 0.95f * speechLevel + 0.05f * rms
    val wanted = (TARGET / speechLevel.coerceAtLeast(1e-4f)).coerceIn(1f, MAX_GAIN)
    gain += 0.2f * (wanted - gain)
    return FloatArray(x.size) { limit(x[it] * gain) }
  }

  /** Soft knee above 0.7, never past 1. */
  private fun limit(v: Float): Float {
    val a = abs(v)
    if (a <= KNEE) return v
    val over = (a - KNEE) / (1 - KNEE)
    val shaped = KNEE + (1 - KNEE) * (over / (1 + over))
    return if (v < 0) -shaped else shaped
  }

  companion object {
    /** About -22 dBFS: a clear close-talking voice. */
    const val TARGET = 0.08f
    const val MAX_GAIN = 8f
    /** Below this a chunk is treated as silence or room noise (about -50 dBFS). */
    const val NOISE_FLOOR = 0.003f
    private const val KNEE = 0.7f
  }
}
