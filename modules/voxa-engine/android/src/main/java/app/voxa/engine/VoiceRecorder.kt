package app.voxa.engine

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Records the microphone to a 16 kHz, 16-bit mono WAV file: the format the training scripts read
 * (training/asr). Used by "Donate your voice". No speech model runs while it records.
 *
 * onLevel gets the loudness (RMS, 0..1) every 100 ms, for the meter.
 */
class VoiceRecorder(private val onLevel: (Double) -> Unit) {
  @Volatile private var running = false
  private var worker: Thread? = null
  @Volatile private var samplesWritten = 0L
  @Volatile private var error: Throwable? = null

  val isRecording get() = running

  @SuppressLint("MissingPermission") // The caller checks RECORD_AUDIO first.
  fun start(file: File) {
    check(!running) { "Already recording" }
    file.parentFile?.mkdirs()
    val minBuf = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(minBuf, RATE))
    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw IllegalStateException("The microphone is busy")
    }
    samplesWritten = 0
    error = null
    try {
      rec.startRecording()
    } catch (e: Throwable) {
      rec.release()
      throw e
    }
    running = true
    worker = thread(name = "voxa-donate-record") {
      val buf = ShortArray(RATE / 10)
      val bytes = ByteArray(buf.size * 2)
      try {
        FileOutputStream(file).use { out ->
          out.write(ByteArray(HEADER)) // filled in once the length is known
          while (running) {
            val n = rec.read(buf, 0, buf.size)
            if (n <= 0) continue
            var sum = 0.0
            for (i in 0 until n) {
              val v = buf[i].toInt()
              bytes[2 * i] = (v and 0xff).toByte()
              bytes[2 * i + 1] = ((v shr 8) and 0xff).toByte()
              val f = v / 32768.0
              sum += f * f
            }
            out.write(bytes, 0, 2 * n)
            samplesWritten += n
            onLevel(sqrt(sum / n))
          }
        }
        writeHeader(file, samplesWritten)
      } catch (e: Throwable) {
        error = e
      } finally {
        rec.stop()
        rec.release()
      }
    }
  }

  /** Stops and returns the length in milliseconds. */
  fun stop(): Long {
    running = false
    worker?.join(3000)
    worker = null
    error?.let { throw it }
    return samplesWritten * 1000 / RATE
  }

  companion object {
    const val RATE = 16000
    private const val HEADER = 44

    private fun writeHeader(file: File, samples: Long) {
      val data = samples * 2
      RandomAccessFile(file, "rw").use { f ->
        fun int(v: Long) { for (i in 0 until 4) f.write(((v shr (8 * i)) and 0xff).toInt()) }
        fun short(v: Int) { f.write(v and 0xff); f.write((v shr 8) and 0xff) }
        f.seek(0)
        f.writeBytes("RIFF"); int(36 + data); f.writeBytes("WAVE")
        f.writeBytes("fmt "); int(16); short(1); short(1); int(RATE.toLong()); int(RATE * 2L); short(2); short(16)
        f.writeBytes("data"); int(data)
      }
    }

    /** Zips a folder (paths inside the zip start at the folder's own name). Returns the zip's size. */
    fun zipFolder(src: File, dest: File): Long {
      require(src.isDirectory) { "Nothing to share yet" }
      dest.parentFile?.mkdirs()
      val tmp = File(dest.path + ".part")
      ZipOutputStream(FileOutputStream(tmp)).use { zip ->
        src.walkTopDown().filter { it.isFile }.forEach { f ->
          zip.putNextEntry(ZipEntry("${src.name}/${f.relativeTo(src).invariantSeparatorsPath}"))
          f.inputStream().use { it.copyTo(zip) }
          zip.closeEntry()
        }
      }
      if (dest.exists()) dest.delete()
      check(tmp.renameTo(dest)) { "Could not write ${dest.name}" }
      return dest.length()
    }
  }
}
