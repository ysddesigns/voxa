package app.voxa.engine

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/**
 * Scan text: ML Kit's on-device Latin recognizer (bundled model, no network).
 * Returns lines top to bottom, each with ML Kit's confidence and the words it was unsure of.
 */
class TextScanner(private val context: Context) {
  private var recognizer: TextRecognizer? = null

  @Synchronized
  private fun get(): TextRecognizer =
    recognizer ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { recognizer = it }

  /** Blocking: call off the main thread. uri: a file:// or content:// image. */
  fun recognize(uri: String): List<Map<String, Any>> {
    // fromFilePath reads EXIF rotation, so photos taken sideways still read the right way up.
    val image = InputImage.fromFilePath(context, Uri.parse(uri))
    val text = Tasks.await(get().process(image))
    val out = mutableListOf<Map<String, Any>>()
    for (block in text.textBlocks) {
      for (line in block.lines) {
        val unsure = line.elements.filter { it.confidence < UNSURE }.map { it.text }
        out.add(
          mapOf(
            "text" to line.text,
            "confidence" to line.confidence.toDouble(),
            "unsureWords" to unsure,
            "top" to (line.boundingBox?.top ?: 0),
            "left" to (line.boundingBox?.left ?: 0),
            // A gap before this line's block marks a new paragraph.
            "block" to text.textBlocks.indexOf(block),
          ),
        )
      }
    }
    return out
  }

  /** Blocking: the text of a rendered page, paragraphs separated by blank lines. */
  fun recognizeBitmap(bitmap: android.graphics.Bitmap): String {
    val text = Tasks.await(get().process(InputImage.fromBitmap(bitmap, 0)))
    return text.textBlocks.joinToString("\n\n") { block -> block.lines.joinToString(" ") { it.text } }
  }

  @Synchronized
  fun release() {
    recognizer?.close()
    recognizer = null
  }

  companion object {
    /** Words ML Kit scores below this are shown for checking. */
    const val UNSURE = 0.6f
  }
}
