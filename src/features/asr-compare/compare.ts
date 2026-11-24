import {
  LAB_MOONSHINE_BASE,
  LAB_NEMO_480,
  LAB_OMNILINGUAL_300M,
  LAB_ZIPFORMER_0626,
  LAB_ZIPFORMER_20M,
  LISTEN_PACK,
  LISTEN_PACK_NG,
} from '@/features/packs/catalogue';

/**
 * Listening-model comparison (Engine lab): the user reads PASSAGE aloud once, every candidate
 * model transcribes that same recording, and each transcript is scored by word error rate.
 */

/**
 * Everyday meeting English with Nigerian names, numbers said as words, and a few short words that
 * small models drop. About 25 seconds read at a normal pace.
 */
export const PASSAGE =
  'Good morning everyone. Before we start, Chinedu will share the sales report from Lagos and Abuja. ' +
  'We sold three hundred bags last week, which is better than we planned. ' +
  'Please send your updates to Aisha by Friday afternoon, and remember that the team meeting moves to Tuesday at ten.';

/** Names no English model has seen: scored apart, so they do not hide the difference on ordinary words. */
export const PASSAGE_NAMES = ['chinedu', 'aisha', 'abuja'];

export type Passage = { id: string; label: string; text: string };

/**
 * The same meeting in each language. The Yoruba, Hausa and Igbo texts were not checked by a native
 * speaker: the card lets the reader correct them before scoring.
 */
export const PASSAGES: Passage[] = [
  { id: 'en', label: 'English', text: PASSAGE },
  {
    id: 'pcm',
    label: 'Pidgin',
    text:
      'Good morning everybody. Before we start, Chinedu go share the sales report from Lagos and Abuja. ' +
      'We sell three hundred bags last week, e pass wetin we plan. ' +
      'Abeg send your update give Aisha before Friday afternoon, and remember say the meeting don move to Tuesday by ten o’clock.',
  },
  {
    id: 'yo',
    label: 'Yoruba',
    text:
      'Ẹ káàárọ̀ gbogbo yín. Kí a tó bẹ̀rẹ̀, Chinedu yóò sọ̀rọ̀ nípa ọjà tí a tà ní Èkó àti Abuja. ' +
      'A ta ọ̀ọ́dúnrún àpò ní ọ̀sẹ̀ tó kọjá. ' +
      'Ẹ jọ̀wọ́, ẹ fi ìròyìn yín ránṣẹ́ sí Aisha ní ọjọ́ Ẹtì, kí ẹ sì rántí pé ìpàdé wa yóò wáyé ní ọjọ́ Ìṣẹ́gun ní agogo mẹ́wàá.',
  },
  {
    id: 'ha',
    label: 'Hausa',
    text:
      'Barka da safiya kowa da kowa. Kafin mu fara, Chinedu zai gabatar da rahoton kasuwa daga Legas da Abuja. ' +
      'Mun sayar da buhu ɗari uku a makon da ya wuce. ' +
      'Don Allah ku aika da bayananku ga Aisha kafin ranar Juma’a da yamma, kuma ku tuna cewa taron zai koma ranar Talata da ƙarfe goma.',
  },
  {
    id: 'ig',
    label: 'Igbo',
    text:
      'Ụtụtụ ọma unu niile. Tupu anyị amalite, Chinedu ga-ekwu maka ahịa anyị rere na Legọs na Abuja. ' +
      'Anyị rere akpa narị atọ n’izu gara aga. ' +
      'Biko zitere Aisha ozi unu tupu ehihie Fraịde, ma cheta na nzukọ ahụ ga-adị na Tuzde n’elekere iri.',
  },
];

/** online: a live model fed as if streaming. moonshine / omnilingual: whole-sentence models, run per VAD sentence. */
export type CandidateEngine = 'online' | 'moonshine' | 'omnilingual';

export type Candidate = { id: string; name: string; note: string; modelType?: string; engine?: CandidateEngine };

/** The model in use first, then the candidates (catalogue lab packs). */
export const CANDIDATES: Candidate[] = [
  { id: LISTEN_PACK, name: 'Kroko English (current)', note: 'Live, trained on varied speech, 71 MB, CC-BY-SA' },
  { id: LISTEN_PACK_NG, name: 'Voxa Nigerian ASR (Zipformer)', note: 'Live, Nigerian English, Pidgin, Yoruba, Hausa, Igbo int8, ~71 MB' },
  { id: LAB_ZIPFORMER_20M, name: 'Zipformer 20M (previous)', note: 'Live, LibriSpeech only, 45 MB' },
  { id: LAB_ZIPFORMER_0626, name: 'Zipformer 2023-06-26', note: 'Live, LibriSpeech, larger model, 73 MB' },
  { id: LAB_NEMO_480, name: 'NeMo FastConformer', note: 'Live, NVIDIA, large training set, 137 MB, 0.48 s delay' },
  { id: LAB_MOONSHINE_BASE, name: 'Moonshine base', note: 'After each sentence, English only, 287 MB, MIT', engine: 'moonshine' },
  {
    id: LAB_OMNILINGUAL_300M,
    name: 'Omnilingual 300M',
    note: 'After each sentence, 1600 languages incl. Yoruba, Hausa, Igbo, Pidgin, 365 MB, Apache-2.0',
    engine: 'omnilingual',
  },
];

/** Hausa hooked letters have no plain-letter decomposition. */
const HOOKED: Record<string, string> = { ɓ: 'b', ɗ: 'd', ƙ: 'k', ƴ: 'y' };

/**
 * Lower case words, punctuation dropped; hyphens and apostrophes split or kept as models write them.
 * Tone marks and dots under letters are dropped (Yoruba ẹ → e), so a model is not marked wrong
 * only for writing plain letters; it does mean tone errors are not counted.
 */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ɓɗƙƴ]/g, (c) => HOOKED[c])
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

export type Score = {
  /** Word error rate over the whole passage: (substitutions + deletions + insertions) / reference words. */
  wer: number;
  /** The same, counting only reference words that are not in PASSAGE_NAMES. */
  werWithoutNames: number;
  errors: number;
  refWords: number;
};

/**
 * Word-level edit distance between reference and hypothesis, with an alignment so errors on
 * names can be told apart from errors on ordinary words.
 */
export function score(reference: string, hypothesis: string, names: readonly string[] = PASSAGE_NAMES): Score {
  const ref = words(reference);
  const hyp = words(hypothesis);
  const n = ref.length;
  const m = hyp.length;
  // d[i][j]: edits to turn ref[0..i) into hyp[0..j).
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      d[i][j] = Math.min(sub, d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  // Walk back through the alignment. A name misheard as several words ("Chinedu" → "she knew do")
  // is one substitution plus insertions, so in a run of errors that touches a name, the name's own
  // error and the inserted words count as name errors. Errors on ordinary reference words in that
  // run still count against the model: a garbled stretch must not hide behind a name.
  const nameSet = new Set(names);
  type Step = { error: boolean; name: boolean; inserted: boolean };
  const steps: Step[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      steps.push({ error: ref[i - 1] !== hyp[j - 1], name: nameSet.has(ref[i - 1]), inserted: false });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      steps.push({ error: true, name: nameSet.has(ref[i - 1]), inserted: false });
      i--;
    } else {
      steps.push({ error: true, name: false, inserted: true });
      j--;
    }
  }
  let nameErrors = 0;
  for (let k = 0; k < steps.length; ) {
    if (!steps[k].error) {
      k++;
      continue;
    }
    let end = k;
    while (end < steps.length && steps[end].error) end++;
    const run = steps.slice(k, end);
    if (run.some((s) => s.name)) nameErrors += run.filter((s) => s.name || s.inserted).length;
    k = end;
  }
  const errors = d[n][m];
  const nameWords = ref.filter((w) => nameSet.has(w)).length;
  const rest = n - nameWords;
  return {
    wer: n === 0 ? 0 : errors / n,
    werWithoutNames: rest === 0 ? 0 : (errors - nameErrors) / rest,
    errors,
    refWords: n,
  };
}

export const percent = (x: number) => `${Math.round(x * 100)}%`;
