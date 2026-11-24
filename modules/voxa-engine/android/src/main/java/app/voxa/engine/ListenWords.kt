package app.voxa.engine

import android.content.Context
import java.io.File

/**
 * Custom words for Live: names and places the model was not trained on well (Chinedu, Abuja,
 * Port Harcourt). With beam search on, sherpa-onnx gives each word's word pieces a bonus while
 * decoding, so a close-sounding reading of the name wins over common English ("Lagos", not "levels").
 *
 * Two parts: the person's own words and a built-in list of Nigerian places, names and words.
 * Saved in SharedPreferences and read each time Live starts.
 *
 * The built-in list is off by default. On a Nigerian-English test reading through Live's own
 * pipeline (voice gate on) it fixed nothing at 1.5 and from 2 up pushed parts of names into
 * ordinary speech ("and Abuja" → "Ana Buja", from Anambra). A handful of names the person
 * actually meets is the safer use; the settings test measures the list for whoever wants it.
 */
object ListenWords {
  private const val PREFS = "voxa-listen-words"
  const val MAX_WORDS = 300
  const val MAX_LENGTH = 40

  /**
   * Default bonus per matched word piece ([ListenTuning.wordsScore] overrides it). 1.3 provides
   * a focused boost without hallucinating names on phonetically similar ordinary words.
   */
  const val SCORE = 1.3f

  /**
   * Short names and ones that start like common English (Edo, Oyo, Oga, Anambra, Ankara) are left
   * out: their pieces match ordinary speech too easily.
   */
  val BUILT_IN = listOf(
    // Country, languages, money
    "Nigeria", "Nigerian", "Naira", "Kobo", "Yoruba", "Hausa", "Igbo", "Fulani", "Ijaw", "Pidgin",
    // Cities, states and major hubs
    "Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt", "Enugu", "Kaduna", "Ilorin",
    "Abeokuta", "Onitsha", "Owerri", "Calabar", "Warri", "Maiduguri", "Sokoto", "Zaria", "Akure",
    "Asaba", "Osogbo", "Kwara", "Ekiti", "Bauchi", "Gombe", "Yola", "Minna", "Lokoja", "Makurdi",
    "Katsina", "Jigawa", "Kebbi", "Zamfara", "Nasarawa", "Damaturu", "Benin City", "Abakaliki",
    "Umuahia", "Birnin Kebbi", "Ijebu Ode", "Ogbomoso", "Nsukka", "Keffi",
    // Neighborhoods and districts (Lagos, Abuja, PH)
    "Ikeja", "Lekki", "Yaba", "Surulere", "Ikorodu", "Victoria Island", "Ajah", "Festac", "Apapa",
    "Oshodi", "Agege", "Maryland", "Magodo", "Wuse", "Garki", "Maitama", "Asokoro", "Gwarinpa",
    "Kubwa", "Jabi", "Lugbe", "Nyanya", "Trans Amadi", "Rumuokoro",
    // Common names (Igbo, Yoruba, Hausa/Northern, Niger Delta)
    "Chinedu", "Emeka", "Ngozi", "Chioma", "Obinna", "Uche", "Ifeoma", "Amaka", "Chukwuemeka", "Nnamdi",
    "Kelechi", "Chidiebere", "Chukwuma", "Nkechi", "Chibuzor", "Chiamaka", "Ikenna", "Chidinma", "Somtochukwu", "Ebuka", "Chizoba", "Onyinye",
    "Tunde", "Bola", "Funmi", "Kemi", "Segun", "Femi", "Adebayo", "Oluwaseun", "Damilola", "Yetunde",
    "Babajide", "Olumide", "Omotola", "Adekunle", "Folashade", "Kehinde", "Taiwo", "Babatunde", "Olayinka", "Bukola", "Abimbola", "Ayodele",
    "Aisha", "Musa", "Ibrahim", "Fatima", "Yusuf", "Abubakar", "Halima", "Zainab", "Usman", "Aliyu", "Bello", "Shehu",
    "Aminu", "Suleiman", "Balarabe", "Danladi", "Mustapha", "Bilkisu", "Hadiza", "Maryam", "Zubairu", "Sanusi", "Nasiru", "Garba",
    "Osaze", "Osamwonyi", "Oghenekaro", "Akpobome", "Tamuno",
    // Everyday words, foods & greetings
    "Jollof", "Danfo", "Okada", "Suya", "Agbada", "Wahala", "Sannu", "Nagode", "Barka",
    "Keke Napep", "Owambe", "Babanriga", "Kunu", "Zobo", "Kuli Kuli", "Puff Puff", "Chin Chin",
    "Abeg", "Biko", "Ndewo", "Bawo ni", "E kaaro", "E ku irole",
  )

  data class Saved(val builtIn: Boolean, val custom: List<String>)

  fun load(context: Context): Saved {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val custom = p.getString("custom", "").orEmpty().split('\n').filter { it.isNotBlank() }
    return Saved(p.getBoolean("builtIn", false), custom)
  }

  fun save(context: Context, builtIn: Boolean, custom: List<String>): Saved {
    val clean = clean(custom)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("builtIn", builtIn)
      .putString("custom", clean.joinToString("\n"))
      .apply()
    return Saved(builtIn, clean)
  }

  /** The words Live boosts now: the person's own first, then the built-in list if it is on. */
  fun active(context: Context): List<String> {
    val s = load(context)
    return clean(s.custom + if (s.builtIn) BUILT_IN else emptyList())
  }

  /** The settings test's words: the person's own and always the built-in list, so it has a measure. */
  fun forTest(context: Context): List<String> = clean(load(context).custom + BUILT_IN)

  /**
   * sherpa-onnx's per-stream hotwords: one phrase per "/", each with its bonus ("Lagos :3.0").
   * sherpa-onnx splits them into word pieces with the [bpeVocab] file. Words already split into
   * pieces ("▁L a g o s") were tried and had no effect in sherpa-onnx 2.0.1, so plain words it is.
   * A word with a letter the model has no piece for is left out.
   */
  fun hotwords(words: List<String>, tokens: Map<String, Int>, score: Float): String {
    val s = String.format(java.util.Locale.US, "%.1f", score)
    return clean(words).filter { pieces(tokens, it) != null }.joinToString("/") { "$it :$s" }
  }

  /** tokens.txt as piece → id, without the special entries (<blk>, #0). */
  fun loadTokens(reader: java.io.Reader): Map<String, Int> = reader.use { r ->
    r.readLines().mapNotNull { line ->
      val parts = line.trim().split(Regex("\\s+"))
      val id = parts.getOrNull(1)?.toIntOrNull()
      if (parts.size != 2 || id == null || parts[0].startsWith("<") || parts[0].startsWith("#")) null else parts[0] to id
    }.toMap()
  }

  /**
   * A phrase as the model's word pieces, the way the model itself would write it. Kroko's
   * vocabulary is SentencePiece Unigram with pieces ordered from most to least common, so the
   * likeliest split is the one with the best total of -ln(rank) (Zipf's law), found by Viterbi.
   * ("afternoon" → "▁after n o on", not "▁a f ter no on".) Null if a letter has no piece.
   */
  fun pieces(tokens: Map<String, Int>, phrase: String): String? {
    val maxLen = tokens.keys.maxOfOrNull { it.length } ?: return null
    val out = ArrayList<String>()
    for (word in phrase.split(' ')) {
      if (word.isEmpty()) continue
      val t = "▁$word"
      val n = t.length
      val best = DoubleArray(n + 1) { Double.NEGATIVE_INFINITY }
      val from = IntArray(n + 1) { -1 }
      best[0] = 0.0
      for (e in 1..n) {
        for (s in maxOf(0, e - maxLen) until e) {
          if (best[s] == Double.NEGATIVE_INFINITY) continue
          val id = tokens[t.substring(s, e)] ?: continue
          val v = best[s] - kotlin.math.ln(id + 1.0)
          if (v > best[e]) {
            best[e] = v
            from[e] = s
          }
        }
      }
      if (best[n] == Double.NEGATIVE_INFINITY) return null
      val word0 = ArrayList<String>()
      var e = n
      while (e > 0) {
        word0.add(t.substring(from[e], e))
        e = from[e]
      }
      out.addAll(word0.asReversed())
    }
    return out.takeIf { it.isNotEmpty() }?.joinToString(" ")
  }

  /** Folds Hausa hooked letters and strips tone marks so words match subword tokens. */
  fun normalize(text: String): String {
    val nfd = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFD)
    val stripped = nfd.replace(Regex("[\\u0300-\\u036f]"), "")
    val sb = StringBuilder(stripped.length)
    for (ch in stripped) {
      when (ch) {
        'ɓ' -> sb.append('b')
        'Ɓ' -> sb.append('B')
        'ɗ' -> sb.append('d')
        'Ɗ' -> sb.append('D')
        'ƙ' -> sb.append('k')
        'Ƙ' -> sb.append('K')
        'ƴ' -> sb.append('y')
        'Ƴ' -> sb.append('Y')
        '’' -> sb.append('\'')
        else -> sb.append(ch)
      }
    }
    return sb.toString()
  }

  /** Trimmed, single-spaced, at most [MAX_LENGTH] letters, no duplicates (ignoring case), at most [MAX_WORDS]. */
  fun clean(words: List<String>): List<String> {
    val seen = HashSet<String>()
    val out = ArrayList<String>()
    for (raw in words) {
      val w = normalize(raw)
      val c = w.replace(Regex("[/:\\n\\r\\t]"), " ").replace(Regex("\\s+"), " ").trim().take(MAX_LENGTH).trim()
      if (c.isEmpty() || !seen.add(c.lowercase())) continue
      out.add(c)
      if (out.size >= MAX_WORDS) break
    }
    return out
  }

  /**
   * sherpa-onnx will not take hotwords for a "bpe" model without a SentencePiece vocabulary file
   * ("piece<TAB>score" per line), though [hotwords] hands it pieces already split. Kroko ships only
   * tokens.txt ("piece id", most common first), so the file is made from it with score -ln(id + 1).
   * Returns the file, or null if tokens.txt could not be read.
   */
  fun bpeVocab(context: Context, tokens: () -> java.io.Reader): File? = try {
    val out = File(context.filesDir, "listen-bpe.vocab")
    val lines = tokens().use { r ->
      r.readLines().mapNotNull { line ->
        val parts = line.trim().split(Regex("\\s+"))
        val id = parts.getOrNull(1)?.toIntOrNull()
        if (parts.size != 2 || id == null) null else "${parts[0]}\t${String.format(java.util.Locale.US, "%.4f", -kotlin.math.ln(id + 1.0))}"
      }
    }
    if (lines.isEmpty()) null else {
      val text = lines.joinToString("\n", postfix = "\n")
      if (!out.isFile || out.readText() != text) out.writeText(text)
      out
    }
  } catch (e: Throwable) {
    android.util.Log.w("VoxaEngine", "could not make the word-piece file for custom words", e)
    null
  }
}
