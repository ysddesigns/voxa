package app.voxa.engine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.util.zip.ZipInputStream
import kotlin.math.min

/**
 * Reads the text of a document for the Speak for me editor (PRD ED-1), on the phone:
 *  - .docx: the paragraphs of word/document.xml (no library: a .docx is a zip of XML).
 *  - PDF: each page is drawn with Android's PdfRenderer and read with ML Kit, the same offline
 *    recognizer as Scan text. That also reads scanned PDFs, at the cost of speed.
 */
class DocumentReader(private val context: Context, private val scanner: TextScanner) {
  @Volatile var cancelled = false

  fun readDocx(uri: String): String {
    context.contentResolver.openInputStream(Uri.parse(uri)).use { input ->
      requireNotNull(input) { "Could not open the file" }
      ZipInputStream(input).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break
          if (entry.name == "word/document.xml") return docxText(zip)
        }
      }
    }
    throw IllegalArgumentException("This is not a Word (.docx) document")
  }

  private fun docxText(input: InputStream): String {
    val parser = Xml.newPullParser()
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
    parser.setInput(input, "UTF-8")
    val out = StringBuilder()
    var inText = false
    while (true) {
      when (parser.next()) {
        XmlPullParser.END_DOCUMENT -> break
        XmlPullParser.START_TAG -> when (parser.name) {
          "w:t" -> inText = true
          "w:tab" -> out.append('\t')
          "w:br", "w:cr" -> out.append('\n')
        }
        XmlPullParser.END_TAG -> when (parser.name) {
          "w:t" -> inText = false
          "w:p" -> out.append('\n')
        }
        XmlPullParser.TEXT -> if (inText) out.append(parser.text)
      }
    }
    return out.toString()
  }

  /** onPage(done, total) after each page. Reads at most maxPages pages. */
  fun readPdf(uri: String, maxPages: Int, onPage: (Int, Int) -> Unit): Pair<String, Int> {
    val fd = context.contentResolver.openFileDescriptor(Uri.parse(uri), "r") ?: throw IllegalArgumentException("Could not open the file")
    fd.use {
      PdfRenderer(it).use { pdf ->
        val total = pdf.pageCount
        val pages = min(total, maxPages)
        val out = StringBuilder()
        for (i in 0 until pages) {
          if (cancelled) break
          pdf.openPage(i).use { page ->
            // About 150 dpi, capped so one page stays under ~10 MB of memory on a 2 GB phone.
            val scale = min(150f / 72f, MAX_SIDE.toFloat() / maxOf(page.width, page.height))
            val bmp = Bitmap.createBitmap((page.width * scale).toInt().coerceAtLeast(1), (page.height * scale).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
            try {
              bmp.eraseColor(Color.WHITE)
              page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              val text = scanner.recognizeBitmap(bmp)
              if (text.isNotBlank()) out.append(text).append("\n\n")
            } finally {
              bmp.recycle()
            }
          }
          onPage(i + 1, pages)
        }
        return out.toString() to total
      }
    }
  }

  companion object {
    const val MAX_SIDE = 1800
  }
}
