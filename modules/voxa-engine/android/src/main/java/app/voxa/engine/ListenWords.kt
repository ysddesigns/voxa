package app.voxa.engine

import android.content.Context
import java.io.File

/**
 * Custom words for Live: names and places the model was not trained on well (Chinedu, Abuja,
 * Port Harcourt). With beam search on, sherpa-onnx gives each word's word pieces a bonus while
 * decoding, so a close-sounding reading of the name wins over common English ("Lagos", not "levels").
 *
 * Two parts: a built-in list of Nigerian places, names and words (on by default) and the
 * person's own words. Saved in SharedPreferences and read each time Live starts.
 */
object ListenWords {
  private const val PREFS = "voxa-listen-words"
  const val MAX_WORDS = 300
  const val MAX_LENGTH = 40

  /** Bonus per matched word piece. Higher finds more names but starts writing them for similar sounds. */
  const val SCORE = 1.5f

  val BUILT_IN = listOf(
    // Country, languages, money
    "Nigeria", "Nigerian", "Naira", "Kobo", "Yoruba", "Hausa", "Igbo", "Fulani", "Ijaw", "Pidgin",
    // Cities and states
    "Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt", "Enugu", "Kaduna", "Benin", "Jos", "Ilorin",
    "Abeokuta", "Onitsha", "Owerri", "Calabar", "Warri", "Maiduguri", "Sokoto", "Zaria", "Akure",
    "Uyo", "Asaba", "Osogbo", "Ogun", "Oyo", "Anambra", "Delta", "Rivers", "Kwara", "Ekiti",
    "Ondo", "Edo", "Imo", "Abia", "Plateau", "Bauchi", "Gombe", "Yola", "Minna", "Lokoja", "Makurdi",
    // Lagos and Abuja areas
    "Ikeja", "Lekki", "Yaba", "Surulere", "Ikorodu", "Ajah", "Victoria Island", "Wuse", "Garki", "Maitama",
    // Common names
    "Chinedu", "Emeka", "Ngozi", "Chioma", "Obinna", "Uche", "Ifeoma", "Amaka", "Chukwuemeka", "Nnamdi",
    "Tunde", "Bola", "Funmi", "Kemi", "Segun", "Femi", "Adebayo", "Oluwaseun", "Damilola", "Yetunde",
    "Aisha", "Musa", "Ibrahim", "Fatima", "Yusuf", "Abubakar", "Halima", "Zainab", "Usman", "Bello",
    // Everyday words
    "Jollof", "Danfo", "Okada", "Keke", "Suya", "Agbada", "Ankara", "Oga", "Wahala",
  )

  data class Saved(val builtIn: Boolean, val custom: List<String>)

  fun load(context: Context): Saved {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val custom = p.getString("custom", "").orEmpty().split('\n').filter { it.isNotBlank() }
    return Saved(p.getBoolean("builtIn", true), custom)
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

  /**
   * sherpa-onnx's per-stream hotwords: one phrase per "/". "/" and ":" have meanings there, so
   * they are taken out of the words.
   */
  fun hotwords(words: List<String>): String = clean(words).joinToString("/")

  /** Trimmed, single-spaced, at most [MAX_LENGTH] letters, no duplicates (ignoring case), at most [MAX_WORDS]. */
  fun clean(words: List<String>): List<String> {
    val seen = HashSet<String>()
    val out = ArrayList<String>()
    for (w in words) {
      val c = w.replace(Regex("[/:\\n\\r\\t]"), " ").replace(Regex("\\s+"), " ").trim().take(MAX_LENGTH).trim()
      if (c.isEmpty() || !seen.add(c.lowercase())) continue
      out.add(c)
      if (out.size >= MAX_WORDS) break
    }
    return out
  }

  /**
   * sherpa-onnx turns hotwords into word pieces with a SentencePiece vocabulary file
   * ("piece<TAB>score" per line). The Kroko model ships only tokens.txt ("piece id"), so the file
   * is made from it: a BPE vocabulary's scores follow merge order, which is the token id order, so
   * score = -id. Returns the file, or null if tokens.txt could not be read.
   */
  fun bpeVocab(context: Context, tokens: () -> java.io.Reader): File? = try {
    val out = File(context.filesDir, "listen-bpe.vocab")
    val lines = tokens().use { r ->
      r.readLines().mapNotNull { line ->
        val parts = line.trim().split(Regex("\\s+"))
        val id = parts.getOrNull(1)?.toIntOrNull()
        if (parts.size != 2 || id == null) null else "${parts[0]}\t${-id}"
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
