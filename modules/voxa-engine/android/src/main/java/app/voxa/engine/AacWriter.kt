package app.voxa.engine

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Writes mono float audio to an .m4a file (AAC-LC) with the phone's own encoder (MediaCodec):
 * no bundled encoder, so no MP3 or LGPL licence questions. Not thread-safe: one writer, one thread.
 */
class AacWriter(private val file: File, private val sampleRate: Int, bitRate: Int = 64_000) {
  private val codec: MediaCodec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
  private val muxer: MediaMuxer
  private val info = MediaCodec.BufferInfo()
  private var track = -1
  private var started = false
  private var framesIn = 0L
  private var pcm = ShortArray(0)

  init {
    file.parentFile?.mkdirs()
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16 * 1024)
    }
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()
    muxer = MediaMuxer(file.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
  }

  /** Adds samples (-1..1). */
  fun write(samples: FloatArray, from: Int = 0, to: Int = samples.size) {
    if (to <= from) return
    if (pcm.size < to - from) pcm = ShortArray(to - from)
    for (i in from until to) pcm[i - from] = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt().toShort()
    feed(pcm, to - from, endOfStream = false)
  }

  fun writeSilence(frames: Int) {
    if (frames <= 0) return
    if (pcm.size < frames) pcm = ShortArray(frames)
    pcm.fill(0, 0, frames)
    feed(pcm, frames, endOfStream = false)
  }

  /** Flushes the encoder and closes the file. Returns its length in milliseconds. */
  fun finish(): Long {
    feed(pcm, 0, endOfStream = true)
    codec.stop()
    codec.release()
    if (started) muxer.stop()
    muxer.release()
    return framesIn * 1000 / sampleRate
  }

  /** Stops without a usable file (cancelled or failed) and deletes it. */
  fun abort() {
    try { codec.stop() } catch (_: Throwable) {}
    codec.release()
    try { if (started) muxer.stop() } catch (_: Throwable) {}
    try { muxer.release() } catch (_: Throwable) {}
    file.delete()
  }

  /** Sends count samples from source to the encoder, waiting for room as needed. */
  private fun feed(source: ShortArray, count: Int, endOfStream: Boolean) {
    var off = 0
    while (off < count || endOfStream) {
      val index = codec.dequeueInputBuffer(10_000)
      if (index >= 0) {
        val buf = codec.getInputBuffer(index)!!.order(ByteOrder.LITTLE_ENDIAN)
        buf.clear()
        val n = minOf(count - off, buf.capacity() / 2)
        buf.asShortBuffer().put(source, off, n)
        off += n
        val pts = framesIn * 1_000_000 / sampleRate
        framesIn += n
        val last = endOfStream && off >= count
        codec.queueInputBuffer(index, 0, n * 2, pts, if (last) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0)
        drain(wait = false)
        if (last) break
      } else {
        drain(wait = false)
      }
    }
    if (endOfStream) drain(wait = true)
  }

  private fun drain(wait: Boolean) {
    while (true) {
      val index = codec.dequeueOutputBuffer(info, if (wait) 10_000 else 0)
      when {
        index == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!wait) return
        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          track = muxer.addTrack(codec.outputFormat)
          muxer.start()
          started = true
        }
        index >= 0 -> {
          val out: ByteBuffer = codec.getOutputBuffer(index)!!
          val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
          if (!config && info.size > 0 && started) {
            out.position(info.offset)
            out.limit(info.offset + info.size)
            muxer.writeSampleData(track, out, info)
          }
          codec.releaseOutputBuffer(index, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
        }
      }
    }
  }
}
