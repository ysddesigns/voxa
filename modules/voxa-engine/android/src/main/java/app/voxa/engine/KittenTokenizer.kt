package app.voxa.engine

import java.io.BufferedReader
import java.text.Normalizer
import java.util.Locale

/**
 * Turns text into Kitten voice tokens, the way sherpa-onnx 2.x does for its lexicon frontend
 * (offline-tts-kitten-impl.h, TokenizeFromLexiconStr), with one addition: words that are not
 * in the English lexicon can be given a pronunciation by the app (the Nigerian spelling rules,
 * and later the user's own pronunciations), instead of being skipped.
 *
 * Doing this here, rather than in sherpa-onnx, also means sherpa does not keep its own much
 * larger copy of the lexicon in memory.
 *
 * The same tokens also drive Piper (VITS) voices: every phone in the lexicon splits into single
 * characters, which is what sherpa-onnx's VITS path needs. [withTokens] reuses the lexicon.
 */
class KittenTokenizer private constructor(
  /** word (NFC, lower case) → space-separated phones, as written in lexicon-en-us.txt */
  private val words: HashMap<String, String>,
  private val tokenSet: Set<String>,
) {
  constructor(lexicon: BufferedReader, tokens: BufferedReader) : this(readLexicon(lexicon), readTokens(tokens))

  /** The same lexicon (not copied) for another voice model with its own tokens.txt. */
  fun withTokens(tokens: BufferedReader) = KittenTokenizer(words, readTokens(tokens))

  val size: Int get() = words.size

  fun contains(word: String) = words.containsKey(key(word))

  /**
   * @param overrides pronunciations that win over the English lexicon (words with Nigerian letters,
   *   the user's own pronunciations). Keys are lower case; values are space-separated phones.
   * @param fallbacks pronunciations used only when the English lexicon has no entry.
   * @param skipped collects words that could not be pronounced at all.
   */
  fun tokenize(
    text: String,
    overrides: Map<String, String> = emptyMap(),
    fallbacks: Map<String, String> = emptyMap(),
    skipped: MutableCollection<String>? = null,
  ): List<String> {
    val out = ArrayList<String>()
    val normalized = Normalizer.normalize(text, Normalizer.Form.NFC)
    val word = StringBuilder()

    fun flushWord() {
      if (word.isEmpty()) return
      appendWord(word.toString(), overrides, fallbacks, skipped, out)
      word.setLength(0)
    }

    var i = 0
    while (i < normalized.length) {
      val cp = normalized.codePointAt(i)
      i += Character.charCount(cp)
      when {
        Character.isWhitespace(cp) -> {
          flushWord()
          if (out.isNotEmpty() && out.last() != " ") out.add(" ")
        }
        cp == ','.code || cp == '.'.code || cp == '!'.code || cp == '?'.code || cp == ';'.code -> {
          flushWord(); addToken(String(Character.toChars(cp)), out)
        }
        cp == ':'.code || cp == '，'.code || cp == '、'.code || cp == '：'.code -> { flushWord(); addToken(",", out) }
        cp == '。'.code -> { flushWord(); addToken(".", out) }
        cp == '…'.code -> { flushWord(); addToken("…", out) }
        cp == '—'.code || cp == '–'.code -> { flushWord(); addToken(",", out) }
        else -> word.appendCodePoint(if (cp == '’'.code || cp == 'ʼ'.code) '\''.code else cp)
      }
    }
    flushWord()
    while (out.isNotEmpty() && out.last() == " ") out.removeAt(out.size - 1)
    while (out.isNotEmpty() && out.first() == " ") out.removeAt(0)
    return out
  }

  private fun appendWord(
    raw: String,
    overrides: Map<String, String>,
    fallbacks: Map<String, String>,
    skipped: MutableCollection<String>?,
    out: MutableList<String>,
  ) {
    // Quotes and brackets around a word are not part of it: "hello" (Lagos)
    val trimmed = raw.trim { !Character.isLetterOrDigit(it) && it != '\'' && it != '-' }.trim('\'', '-')
    if (trimmed.isEmpty()) return
    val k = key(trimmed)
    val phones = overrides[k] ?: words[k] ?: fallbacks[k]
    if (phones != null) { addPhones(phones, out); return }
    // "two-thirds" → "two" + "thirds", as sherpa-onnx does
    if ('-' in trimmed) {
      for (part in trimmed.split('-')) if (part.isNotBlank()) appendWord(part, overrides, fallbacks, skipped, out)
      return
    }
    skipped?.add(trimmed)
  }

  /** Splits lexicon phones into voice tokens with the same rule as sherpa-onnx's ParseLexiconFile. */
  private fun addPhones(phones: String, out: MutableList<String>) {
    for (p in phones.split(' ')) {
      if (p.isEmpty()) continue
      val cps = p.codePoints().toArray()
      val last = cps.last()
      val keep = cps.size <= 1 || (last in '0'.code..'9'.code) || (last in 'a'.code..'z'.code) || (last in 'A'.code..'Z'.code)
      if (keep) addToken(p, out) else for (cp in cps) addToken(String(Character.toChars(cp)), out)
    }
  }

  private fun addToken(t: String, out: MutableList<String>) {
    if (t in tokenSet) out.add(t)
  }

  companion object {
    private fun readLexicon(lexicon: BufferedReader): HashMap<String, String> {
      val words = HashMap<String, String>(200_000)
      lexicon.useLines { lines ->
        for (line in lines) {
          if (line.isEmpty() || line[0] == '#') continue
          val bar = line.indexOf("||")
          if (bar < 0) continue
          val key = key(line.substring(0, bar).trim())
          val phones = line.substring(bar + 2).trim()
          // Multi-word entries ("new york") are rare; sherpa-onnx itself rarely matches them.
          if (key.isNotEmpty() && phones.isNotEmpty() && ' ' !in key) words[key] = phones
        }
      }
      return words
    }

    /** tokens.txt lines are "<token> <id>"; the space token is written as "  3". */
    private fun readTokens(tokens: BufferedReader): Set<String> {
      val set = HashSet<String>()
      tokens.useLines { lines ->
        for (line in lines) {
          val sp = line.lastIndexOf(' ')
          if (sp < 0) continue
          set.add(line.substring(0, sp).ifEmpty { " " })
        }
      }
      return set
    }

    /** NFC → lower case → NFC, like sherpa-onnx's NormalizeLexiconKey. */
    fun key(s: String): String =
      Normalizer.normalize(Normalizer.normalize(s, Normalizer.Form.NFC).lowercase(Locale.ROOT), Normalizer.Form.NFC)
  }
}
