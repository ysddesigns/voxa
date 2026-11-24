/**
 * Spelling-to-sound rules for Yoruba, Igbo and Hausa words (names, places, everyday words).
 *
 * The voice (Piper LJSpeech, like Kitten before it) only knows American English sounds, so every rule maps to a sound that
 * the English lexicon (lexicon-en-us.txt) already uses. That makes the output close, not
 * perfect: Yoruba and Igbo tones are not spoken (a high tone becomes the stressed syllable),
 * Hausa ɓ ɗ ƙ become b d k, and nasal vowels become vowel + n.
 *
 * Sources for the letter values: the standard orthographies of Yoruba (1974), Igbo (Ọnwụ, 1961)
 * and Hausa (boko). Every phone in the output is one character, as the voice's tokens.txt expects.
 */

export type NgLanguage = 'yoruba' | 'igbo' | 'hausa' | 'nigerian';

export type Pronunciation = {
  word: string;
  language: NgLanguage;
  /** One sound per item, ready for the voice, e.g. ['o', 'l', 'ˈ', 'u', 'w', 'ɑ', 'ʃ', 'e', 'u', 'n']. */
  phones: string[];
  syllables: number;
  /** True when the word carries clear Yoruba/Igbo/Hausa signs; false when it only looks Nigerian. */
  confident: boolean;
};

/** Sounds the voice was trained on (every symbol used by lexicon-en-us.txt more than 400 times). */
export const ENGLISH_PHONES: ReadonlySet<string> = new Set(
  'ˈ ˌ ː ɪ l t m n ɹ ʌ ə s k d i æ ɛ b ʊ ɑ z ɚ o p a f e ɡ ʃ h ŋ v ᵻ ɔ u ɾ ʒ w ɜ ɐ j θ ð ʔ'.split(' '),
);

const STRESS = 'ˈ';
const LONG = 'ː';

type Tone = 'high' | 'low' | 'mid' | null;
type Letter = { ch: string; tone: Tone };

// --- Reading the spelling -----------------------------------------------------------------

const TONE_MARKS: Record<string, Tone> = { '́': 'high', '̀': 'low', '̄': 'mid' };
const DOT_BELOW = new Set(['̣', '̩']); // ẹ ọ ṣ ị ụ, also written e̩ o̩ s̩
const DOTTED: Record<string, string> = { e: 'ẹ', o: 'ọ', s: 'ṣ', i: 'ị', u: 'ụ' };
const NG_DOT = '̇'; // ṅ

/** Splits a word into letters, folding tone marks and under-dots into each base letter. */
export function readLetters(word: string): Letter[] {
  const out: Letter[] = [];
  for (const ch of word.normalize('NFD').toLowerCase()) {
    const last = out[out.length - 1];
    if (ch in TONE_MARKS) {
      if (last) last.tone = TONE_MARKS[ch];
    } else if (DOT_BELOW.has(ch)) {
      if (last && DOTTED[last.ch]) last.ch = DOTTED[last.ch];
    } else if (ch === NG_DOT) {
      if (last?.ch === 'n') last.ch = 'ṅ';
    } else if (/[\p{M}]/u.test(ch)) {
      // other accents (e.g. a diaeresis) carry no sound here
    } else {
      out.push({ ch: ch === 'ʼ' || ch === '’' ? "'" : ch, tone: null });
    }
  }
  return out;
}

// --- Is it a Nigerian word, and which language? -------------------------------------------------

const VOWELS = new Set(['a', 'e', 'ẹ', 'i', 'ị', 'o', 'ọ', 'u', 'ụ']);
const DIGRAPHS = ['gb', 'kp', 'gw', 'kw', 'nw', 'ny', 'ch', 'sh', 'gh', 'ts', 'kh', 'ph', 'th', 'dh'];
const NASALS = new Set(['m', 'n', 'ṅ']);
const ARABIC_FIRST = new Set(['b', 'd', 'f', 'h', 'k', 'l', 'm', 'n', 'r', 's']);

const YORUBA_NAMES = /^(olu|oluwa|ade|ayo|ola|femi|fola|funmi|bola|tunde|seun|yemi|kemi|tolu|dayo|sola|bisi|gbenga|wale|kunle|segun|tobi|tayo|ife|baba|buko|abim|omot|ibadan|ogun|oyo|osun|ekiti|abeokuta|ilorin|eko)/;
const IGBO_NAMES = /^(chi|chukwu|uche|ngozi|obi|eze|ike|ifeanyi|nna|nne|emeka|ugo|amaka|adaeze|obinna|chidi|nkem|ebuka|kele|somto|onitsha|enugu|nnewi|owerri|aba)/;
const HAUSA_NAMES = /^(abdul|abu|yusuf|musa|aisha|fatima|ibrahim|aliyu|usman|umar|garba|sani|bello|hassan|hussaini|kabir|maryam|zainab|hauwa|sule|idris|yakubu|halima|bashir|lawal|danjuma|amin|must|bilk|hadi|sanu|nasi|kano|kaduna|zaria|sokoto|katsina|bauchi|maiduguri|abuja)/;

/** True when the word's letters and clusters fit Yoruba, Igbo or Hausa spelling. */
export function looksNigerian(letters: Letter[]): boolean {
  const s = letters.map((l) => l.ch).join('');
  if (!/^[a-zẹọṣịụṅɓɗƙƴ']+$/.test(s) || /[qx]/.test(s) || !letters.some((l) => VOWELS.has(l.ch))) return false;
  // Consonant runs between vowels must be one sound, a digraph, a nasal + sound, a doubled letter,
  // or a two-letter Hausa/Arabic-style cluster (abdul, alhaji, usman).
  for (const run of s.split(/[aeẹiịoọuụ]+/)) {
    if (run.length <= 1 || DIGRAPHS.includes(run)) continue;
    if (run.length === 2 && (run[0] === run[1] || ARABIC_FIRST.has(run[0]) || NASALS.has(run[0]) || run[0] === "'" || run[1] === "'")) continue;
    if (run.length === 3 && NASALS.has(run[0]) && DIGRAPHS.includes(run.slice(1))) continue;
    if (run.length === 3 && run[0] === run[1] && DIGRAPHS.includes(run.slice(1))) continue;
    return false;
  }
  return true;
}

/** Picks the language from marks, clusters and well-known names; null if the word does not look Nigerian. */
export function detectLanguage(word: string): { language: NgLanguage; confident: boolean } | null {
  const letters = readLetters(word);
  if (!looksNigerian(letters)) return null;
  const s = letters.map((l) => l.ch).join('');
  const toned = letters.some((l) => l.tone);
  const score = { yoruba: 0, igbo: 0, hausa: 0 };

  if (/[ẹṣ]/.test(s)) score.yoruba += 3;
  if (/[ịụṅ]/.test(s)) score.igbo += 3;
  if (/[ɓɗƙƴ]|'y|[aeiou]'[aeiou]/.test(s)) score.hausa += 3;
  if (/kp|nw|gw|kw|^ny|^nn|^nk|^ng|ch/.test(s)) score.igbo += 2;
  if (/ts|^dan|^abd|^al[hk]|kh/.test(s)) score.hausa += 2;
  if (/gb/.test(s)) { score.yoruba += 1; score.igbo += 1; }
  if (toned && score.igbo < 3) score.yoruba += 1;
  if (YORUBA_NAMES.test(s)) score.yoruba += 2;
  if (IGBO_NAMES.test(s)) score.igbo += 2;
  if (HAUSA_NAMES.test(s)) score.hausa += 2;

  const best = (Object.keys(score) as (keyof typeof score)[]).reduce((a, b) => (score[b] > score[a] ? b : a));
  if (score[best] === 0) return { language: 'nigerian', confident: false };
  return { language: best, confident: score[best] >= 2 };
}

// --- Letters to sounds -------------------------------------------------------------------

const VOWEL_SOUND: Record<string, string> = {
  a: 'ɑ', e: 'e', ẹ: 'ɛ', i: 'i', ị: 'ɪ', o: 'o', ọ: 'ɔ', u: 'u', ụ: 'ʊ',
};

/** Consonants shared by the three languages. Hausa ɓ ɗ ƙ have no English sound, so b d k. */
const CONSONANTS: Record<string, string[]> = {
  gb: ['ɡ', 'b'], kp: ['k', 'p'], gw: ['ɡ', 'w'], kw: ['k', 'w'], nw: ['ŋ', 'w'], ny: ['n', 'j'],
  ch: ['t', 'ʃ'], sh: ['ʃ'], gh: ['ɡ'], ts: ['t', 's'], kh: ['k'], ph: ['f'], th: ['t'], dh: ['d'],
  b: ['b'], ɓ: ['b'], c: ['t', 'ʃ'], d: ['d'], ɗ: ['d'], f: ['f'], g: ['ɡ'], h: ['h'], j: ['d', 'ʒ'],
  k: ['k'], ƙ: ['k'], l: ['l'], m: ['m'], n: ['n'], ṅ: ['ŋ'], p: ['p'], r: ['ɾ'], s: ['s'], ṣ: ['ʃ'],
  t: ['t'], v: ['v'], w: ['w'], y: ['j'], ƴ: ['j'], z: ['z'], "'": ['ʔ'],
};

/** Per-language differences from the shared table. */
const OVERRIDES: Record<NgLanguage, Record<string, string[]>> = {
  yoruba: { p: ['k', 'p'] }, // Yoruba p is the same double stop as Igbo kp
  igbo: {},
  hausa: { "'y": ['j'] },
  nigerian: {},
};

type Unit = { phones: string[]; vowel: boolean; tone: Tone };

function toUnits(letters: Letter[], language: NgLanguage): Unit[] {
  const units: Unit[] = [];
  const table = { ...CONSONANTS, ...OVERRIDES[language] };
  const s = letters.map((l) => l.ch);
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const next = s[i + 1];
    if (VOWELS.has(ch)) {
      const prev = units[units.length - 1];
      // A doubled vowel (Hausa "aa", Igbo "oo") is one long vowel.
      if (prev?.vowel && s[i - 1] === ch) prev.phones.push(LONG);
      else units.push({ phones: [VOWEL_SOUND[ch]], vowel: true, tone: letters[i].tone });
      i++;
      continue;
    }
    // Silent final h after a vowel: Aishah, Fatimah.
    if (ch === 'h' && i === s.length - 1 && i > 0 && VOWELS.has(s[i - 1])) { i++; continue; }
    // A doubled consonant is said once: Bello, Hassan, Nnamdi.
    if (ch === next && !VOWELS.has(ch)) { i++; continue; }
    // Igbo/Yoruba initial "ng" before a vowel: Ngozi → ŋ ɡ.
    if (ch === 'n' && next === 'g' && i === 0 && VOWELS.has(s[i + 2])) {
      units.push({ phones: ['ŋ', 'ɡ'], vowel: false, tone: null });
      i += 2;
      continue;
    }
    const two = ch + (next ?? '');
    const pair = table[two];
    if (pair) {
      units.push({ phones: [...pair], vowel: false, tone: null });
      i += 2;
      continue;
    }
    const one = table[ch];
    if (one) units.push({ phones: [...one], vowel: false, tone: null });
    i++;
  }
  return units;
}

/** Stress the first high-tone syllable if marked, otherwise the second to last (as in Nigerian English). */
function stressIndex(vowels: Unit[]): number {
  const high = vowels.findIndex((u) => u.tone === 'high');
  if (high >= 0) return high;
  return vowels.length >= 2 ? vowels.length - 2 : 0;
}

/** Returns the pronunciation of a Yoruba, Igbo or Hausa word, or null if it does not look like one. */
export function pronounce(word: string, language?: NgLanguage): Pronunciation | null {
  const detected = detectLanguage(word);
  if (!detected && !language) return null;
  const lang = language ?? detected!.language;
  const units = toUnits(readLetters(word), lang);
  const vowels = units.filter((u) => u.vowel);
  if (vowels.length === 0) return null;
  const stressed = vowels[stressIndex(vowels)];
  const phones = units.flatMap((u) => (u === stressed ? [STRESS, ...u.phones] : u.phones));
  return { word, language: lang, phones, syllables: vowels.length, confident: language ? true : detected!.confident };
}

/** Lexicon keys for a word: as written (lower case) and without accents, since most people type plain letters. */
export function lexiconKeys(word: string): string[] {
  const written = word.normalize('NFC').toLowerCase();
  const plain = readLetters(word)
    .map((l) => l.ch.normalize('NFD').replace(/\p{M}/gu, '').replace('ṅ', 'n').replace('ɓ', 'b').replace('ɗ', 'd').replace('ƙ', 'k').replace('ƴ', 'y'))
    .join('')
    .replace(/[ẹ]/g, 'e').replace(/[ọ]/g, 'o').replace(/[ṣ]/g, 's').replace(/[ị]/g, 'i').replace(/[ụ]/g, 'u');
  return written === plain ? [written] : [written, plain];
}

/** Lines in the sherpa-onnx lexicon format: "word || p h o n e s". */
export function toLexiconLines(p: Pronunciation): string[] {
  return lexiconKeys(p.word).map((key) => `${key} || ${p.phones.join(' ')}`);
}
