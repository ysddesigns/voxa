package app.voxa.engine

import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarization
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractor
import java.io.File
import java.io.RandomAccessFile
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Speaker labels for a whole meeting, run after it ends.
 *
 * The recording is raw 16-bit mono PCM. sherpa-onnx's diarization needs the whole clip in memory,
 * which for an hour is ~230 MB of floats, too much for a 2-3 GB phone. So the audio is labelled in
 * 10-minute chunks, and each chunk's speakers are matched to the speakers found so far by voice
 * embedding (cosine similarity to a running mean); a speaker that matches nobody is new.
 */
class SpeakerLabeller(
  private val diar: OfflineSpeakerDiarization,
  private val extractor: SpeakerEmbeddingExtractor,
  private val sampleRate: Int,
) {
  data class Turn(val startMs: Long, val endMs: Long, val speaker: Int)

  class Cancelled : Exception("Labelling cancelled")

  private class Speaker(var mean: FloatArray, var count: Int)

  fun label(pcm: File, cancelled: () -> Boolean, onProgress: (Double) -> Unit): List<Turn> {
    val totalSamples = pcm.length() / 2
    if (totalSamples < sampleRate) return emptyList()
    val chunk = CHUNK_SEC * sampleRate.toLong()
    val speakers = mutableListOf<Speaker>()
    val out = mutableListOf<Turn>()
    RandomAccessFile(pcm, "r").use { raf ->
      var offset = 0L
      while (offset < totalSamples) {
        if (cancelled()) throw Cancelled()
        var len = min(chunk, totalSamples - offset)
        // Fold a short tail into this chunk rather than labelling a few seconds alone.
        if (totalSamples - offset - len < MIN_TAIL_SEC * sampleRate) len = totalSamples - offset
        val samples = read(raf, offset, len.toInt())
        val base = offset
        val turns = diar.processWithCallback(samples, { done, total, _ ->
          if (total > 0) onProgress((base + len * done.toDouble() / total) / totalSamples)
          if (cancelled()) 1 else 0
        }, 0L)
        if (cancelled()) throw Cancelled()

        // Map this chunk's speaker numbers to meeting-wide ones.
        val local = turns.map { it.speaker }.distinct()
        val mapping = HashMap<Int, Int>()
        for (s in local) {
          val emb = embed(samples, turns.filter { it.speaker == s }.map { it.start to it.end })
          mapping[s] = if (emb == null) {
            // Too little speech to tell: keep it apart rather than guess.
            speakers.add(Speaker(FloatArray(0), 0))
            speakers.size - 1
          } else {
            match(speakers, emb)
          }
        }
        val baseMs = offset * 1000 / sampleRate
        for (t in turns) {
          out.add(Turn(baseMs + (t.start * 1000).toLong(), baseMs + (t.end * 1000).toLong(), mapping[t.speaker] ?: 0))
        }
        offset += len
        onProgress(offset.toDouble() / totalSamples)
      }
    }
    return renumber(out)
  }

  private fun read(raf: RandomAccessFile, offsetSamples: Long, count: Int): FloatArray {
    val bytes = ByteArray(count * 2)
    raf.seek(offsetSamples * 2)
    raf.readFully(bytes)
    return FloatArray(count) { i ->
      val v = (bytes[2 * i].toInt() and 0xff) or (bytes[2 * i + 1].toInt() shl 8)
      v.toShort() / 32768f
    }
  }

  /** Embedding from up to EMBED_SEC of the speaker's longest turns; null when under a second of speech. */
  private fun embed(samples: FloatArray, turns: List<Pair<Float, Float>>): FloatArray? {
    val stream = extractor.createStream()
    try {
      var taken = 0
      val limit = EMBED_SEC * sampleRate
      for ((s, e) in turns.sortedByDescending { it.second - it.first }) {
        val from = (s * sampleRate).toInt().coerceIn(0, samples.size)
        val to = min((e * sampleRate).toInt(), samples.size)
        if (to <= from) continue
        val n = min(to - from, limit - taken)
        stream.acceptWaveform(samples.copyOfRange(from, from + n), sampleRate)
        taken += n
        if (taken >= limit) break
      }
      if (taken < sampleRate) return null
      stream.inputFinished()
      if (!extractor.isReady(stream)) return null
      return normalise(extractor.compute(stream))
    } finally {
      stream.release()
    }
  }

  private fun match(speakers: MutableList<Speaker>, emb: FloatArray): Int {
    var best = -1
    var bestSim = MATCH_THRESHOLD
    speakers.forEachIndexed { i, sp ->
      if (sp.count == 0 || sp.mean.size != emb.size) return@forEachIndexed
      val sim = dot(sp.mean, emb)
      if (sim > bestSim) {
        bestSim = sim
        best = i
      }
    }
    if (best < 0) {
      speakers.add(Speaker(emb, 1))
      return speakers.size - 1
    }
    val sp = speakers[best]
    sp.mean = normalise(FloatArray(emb.size) { (sp.mean[it] * sp.count + emb[it]) / (sp.count + 1) })
    sp.count++
    return best
  }

  /** Speakers numbered 0, 1, 2... in order of first appearance. */
  private fun renumber(turns: List<Turn>): List<Turn> {
    val order = HashMap<Int, Int>()
    return turns.sortedBy { it.startMs }.map { t -> t.copy(speaker = order.getOrPut(t.speaker) { order.size }) }
  }

  companion object {
    const val CHUNK_SEC = 600
    const val MIN_TAIL_SEC = 60
    const val EMBED_SEC = 30
    /** Cosine similarity above which two chunks' speakers are the same person. Tune on real meetings. */
    const val MATCH_THRESHOLD = 0.55f

    private fun dot(a: FloatArray, b: FloatArray): Float {
      var s = 0f
      for (i in a.indices) s += a[i] * b[i]
      return s
    }

    private fun normalise(v: FloatArray): FloatArray {
      val n = sqrt(dot(v, v))
      return if (n > 0f) FloatArray(v.size) { v[it] / n } else v
    }
  }
}
