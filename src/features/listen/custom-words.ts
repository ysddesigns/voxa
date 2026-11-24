import { useState } from 'react';
import { Platform } from 'react-native';
import { VoxaEngine, type ListenWords } from '../../../modules/voxa-engine';

/** Must match ListenWords.kt. */
export const MAX_WORDS = 300;
export const MAX_LENGTH = 40;

const HOOKED: Record<string, string> = {
  'ɓ': 'b', 'Ɓ': 'B',
  'ɗ': 'd', 'Ɗ': 'D',
  'ƙ': 'k', 'Ƙ': 'K',
  'ƴ': 'y', 'Ƴ': 'Y',
};

/** Folds Hausa hooked letters and tone marks so custom words match acoustic models and subword tokens. */
export function normalizeWord(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ɓƁɗƊƙƘƴƳ]/g, (ch) => HOOKED[ch] || ch)
    .replace(/[’']/g, "'");
}

/**
 * Words typed in the add field: commas or new lines between them ("Lagos, Chinedu"), so a
 * list can be pasted. Spaces stay, since a name can be two words ("Port Harcourt").
 */
export function splitWords(text: string): string[] {
  return text.split(/[,\n;]/);
}

/** Same rules as the native side: tidy, no "/" or ":", no repeats ignoring case, capped. */
export function cleanWords(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const w = normalizeWord(raw);
    const c = w.replace(/[/:\t\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH).trim();
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

/** Adds words to the front of the list (newest first), skipping ones already there. */
export function addWords(list: string[], text: string): string[] {
  const saved = new Set(list.map((w) => w.toLowerCase()));
  const fresh = cleanWords(splitWords(text)).filter((w) => !saved.has(w.toLowerCase()));
  return cleanWords([...fresh, ...list]);
}

const EMPTY: ListenWords = { builtIn: false, custom: [], builtInWords: [] };

export type CustomWords = {
  /** False on builds and platforms without custom words. */
  supported: boolean;
  words: ListenWords;
  add: (text: string) => void;
  remove: (word: string) => void;
  setBuiltIn: (on: boolean) => void;
};

/** The saved custom words, kept natively and read by Live each time it starts. */
export function useCustomWords(): CustomWords {
  const supported = Platform.OS === 'android' && !!VoxaEngine?.listenWords && !!VoxaEngine?.setListenWords;
  const [words, setWords] = useState<ListenWords>(() => (supported ? VoxaEngine!.listenWords!() : EMPTY));
  const save = (builtIn: boolean, custom: string[]) => {
    if (supported) setWords(VoxaEngine!.setListenWords!(builtIn, cleanWords(custom)));
  };
  return {
    supported,
    words,
    add: (text) => save(words.builtIn, addWords(words.custom, text)),
    remove: (word) => save(words.builtIn, words.custom.filter((w) => w !== word)),
    setBuiltIn: (on) => save(on, words.custom),
  };
}
