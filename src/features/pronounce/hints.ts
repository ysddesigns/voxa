import { lexiconKeys, pronounce, readLetters } from './nigerian-rules';

/**
 * Pronunciations to send with a piece of text, keyed by lower-case word.
 *  - overrides win over the English lexicon. Only words written with Yoruba, Igbo or Hausa letters
 *    or tone marks (Olúwaṣeun, Ẹ̀kọ́, ƙasa): their spelling leaves no doubt.
 *  - fallbacks are used only when the English lexicon lacks the word (Chinedu, Yusuf, Nnamdi).
 *    A plain-letter word that is also English ("chicken", "Ada") keeps its English sound.
 */
export type PronunciationHints = { overrides: Record<string, string>; fallbacks: Record<string, string> };

const NIGERIAN_LETTERS = /[ẹọṣịụṅɓɗƙƴ]/;

export function hasNigerianMarks(word: string): boolean {
  return readLetters(word).some((l) => l.tone !== null || NIGERIAN_LETTERS.test(l.ch));
}

/** Strips quotes, brackets and punctuation around a word, as the native tokenizer does. */
function bare(token: string): string {
  return token.replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, '').replace(/^['-]+|['-]+$/g, '');
}

export function pronunciationHints(text: string): PronunciationHints {
  const overrides: Record<string, string> = {};
  const fallbacks: Record<string, string> = {};
  const seen = new Set<string>();
  for (const m of text.normalize('NFC').matchAll(/\S+/g)) {
    for (const word of bare(m[0]).split('-')) {
      if (!word || seen.has(word)) continue;
      seen.add(word);
      const p = pronounce(word);
      if (!p) continue;
      const target = hasNigerianMarks(word) ? overrides : fallbacks;
      const phones = p.phones.join(' ');
      for (const key of lexiconKeys(word)) target[key] = phones;
    }
  }
  return { overrides, fallbacks };
}
