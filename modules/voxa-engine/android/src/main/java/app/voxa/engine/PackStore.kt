package app.voxa.engine

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.StatFs
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Downloaded packs (voices, later speech models) in <files>/packs/<id>/.
 *
 *  - Each file downloads to "<name>.part" and resumes from where it stopped (HTTP Range), so a
 *    dropped mobile connection does not start a 20 MB voice again.
 *  - Every file is checked against its SHA-256 from the catalogue before it is used.
 *  - A pack is built in "<id>.tmp" and renamed into place only when every file checks out, so the
 *    app never sees a half-installed pack. pack.json (the catalogue entry) marks it complete.
 *
 * Signatures on the catalogue itself come with the CDN (Phase 1, "CDN contract").
 */
class PackStore(private val context: Context) {
  class PackFile(val path: String, val url: String, val sha256: String, val bytes: Long)

  class Cancelled : IOException("Download cancelled")

  private val root: File get() = File(context.filesDir, "packs").apply { mkdirs() }

  fun dir(id: String) = File(root, checkId(id))

  fun installed(): List<String> =
    root.listFiles()?.filter { it.isDirectory && File(it, MANIFEST).isFile }?.map { it.name }?.sorted() ?: emptyList()

  fun manifest(id: String): String? = File(dir(id), MANIFEST).takeIf { it.isFile }?.readText()

  fun delete(id: String) {
    dir(id).deleteRecursively()
    File(root, "${checkId(id)}.tmp").deleteRecursively()
  }

  fun freeBytes(): Long = StatFs(context.filesDir.path).availableBytes

  /** Connected, and on a network that is not charged by the megabyte (Wi-Fi, Ethernet). */
  fun network(): Pair<Boolean, Boolean> {
    val cm = context.getSystemService(ConnectivityManager::class.java)
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false to false
    val connected = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    return connected to caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
  }

  /**
   * Downloads, checks and installs a pack. [onProgress] gets bytes done and total across all files.
   * Throws [Cancelled] when [cancelled] turns true; partial files are kept so the next try resumes.
   */
  fun install(
    id: String,
    manifestJson: String,
    files: List<PackFile>,
    cancelled: () -> Boolean,
    onProgress: (Long, Long) -> Unit,
  ) {
    val tmp = File(root, "${checkId(id)}.tmp").apply { mkdirs() }
    val total = files.sumOf { it.bytes }
    var before = 0L
    for (f in files) {
      val dest = File(tmp, checkPath(f.path))
      dest.parentFile?.mkdirs()
      if (!(dest.isFile && dest.length() == f.bytes && sha256(dest) == f.sha256.lowercase())) {
        dest.delete()
        fetch(f, dest, cancelled) { done -> onProgress(before + done, total) }
      }
      before += f.bytes
      onProgress(before, total)
    }
    File(tmp, MANIFEST).writeText(manifestJson)
    val final = dir(id)
    final.deleteRecursively()
    if (!tmp.renameTo(final)) throw IOException("Could not install pack $id")
  }

  private fun fetch(f: PackFile, dest: File, cancelled: () -> Boolean, onBytes: (Long) -> Unit) {
    val part = File(dest.path + ".part")
    if (part.length() > f.bytes) part.delete()
    var have = part.length()
    val conn = (URL(f.url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15_000
      readTimeout = 30_000
      instanceFollowRedirects = true
      if (have > 0) setRequestProperty("Range", "bytes=$have-")
    }
    try {
      val code = conn.responseCode
      val append = when {
        code == HttpURLConnection.HTTP_PARTIAL && have > 0 -> true
        code == HttpURLConnection.HTTP_OK -> false
        // The part file is already complete; the server has nothing more to send.
        code == 416 && have == f.bytes -> true
        else -> throw IOException("Server answered $code for ${f.path}")
      }
      if (!append) have = 0
      if (code != 416) {
        conn.inputStream.use { input ->
          FileOutputStream(part, append).use { out ->
            val buf = ByteArray(64 * 1024)
            var lastReport = 0L
            while (true) {
              if (cancelled()) throw Cancelled()
              val n = input.read(buf)
              if (n < 0) break
              out.write(buf, 0, n)
              have += n
              if (have > f.bytes) throw IOException("${f.path} is larger than the catalogue says")
              if (have - lastReport >= 256 * 1024) { onBytes(have); lastReport = have }
            }
          }
        }
      }
    } finally {
      conn.disconnect()
    }
    if (have != f.bytes) throw IOException("${f.path} stopped at $have of ${f.bytes} bytes")
    if (sha256(part) != f.sha256.lowercase()) {
      // A bad file must not be resumed: start it from the beginning next time.
      part.delete()
      throw IOException("${f.path} failed its checksum")
    }
    if (!part.renameTo(dest)) throw IOException("Could not save ${f.path}")
  }

  companion object {
    const val MANIFEST = "pack.json"
    private val ID = Regex("^[a-z0-9][a-z0-9._-]{0,63}$")

    fun checkId(id: String): String = if (ID.matches(id)) id else throw IllegalArgumentException("Bad pack id: $id")

    /** Relative paths only, no "..": a catalogue must not write outside its pack folder. */
    fun checkPath(path: String): String {
      if (path.isEmpty() || path.startsWith("/") || path.split('/', '\\').any { it == ".." || it.isEmpty() }) {
        throw IllegalArgumentException("Bad file path in pack: $path")
      }
      return path
    }

    fun sha256(file: File): String {
      val md = MessageDigest.getInstance("SHA-256")
      FileInputStream(file).use { input ->
        val buf = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          md.update(buf, 0, n)
        }
      }
      return md.digest().joinToString("") { "%02x".format(it) }
    }

    fun parseFiles(list: List<Map<String, Any>>): List<PackFile> = list.map {
      PackFile(
        path = it["path"] as String,
        url = (it["url"] as String).also { u -> require(u.startsWith("https://")) { "Pack files must use https: $u" } },
        sha256 = it["sha256"] as String,
        bytes = (it["bytes"] as Number).toLong(),
      )
    }
  }
}
