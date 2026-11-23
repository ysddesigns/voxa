import type { ListenTuning } from '../../../modules/voxa-engine';

/**
 * Live settings test (Engine lab): the same recording goes through Live's own pipeline once per
 * variant, each transcript is scored, and the best can be saved as the settings Live uses.
 */

/** Live's default settings. Must match ListenTuning's defaults in ListenTuning.kt. */
export const DEFAULT_TUNING: ListenTuning = { beam: true, gain: true, vadThreshold: 0.5, pauseMs: 800, gate: true, words: true, wordsScore: 1.5 };

/** The first release's settings, kept as the baseline the others are measured against. */
export const ORIGINAL_TUNING: ListenTuning = { beam: false, gain: false, vadThreshold: 0.5, pauseMs: 800, gate: true, words: false, wordsScore: 1.5 };

export type TuneVariant = { id: string; name: string; tuning: ListenTuning };

/** Each step adds one change to the one before, so the scores show what each change is worth. */
export const VARIANTS: TuneVariant[] = [
  { id: 'shipped', name: 'Original', tuning: ORIGINAL_TUNING },
  { id: 'beam', name: 'Beam search', tuning: { ...ORIGINAL_TUNING, beam: true } },
  { id: 'beam-gain', name: 'Beam search + volume boost', tuning: { ...DEFAULT_TUNING, words: false } },
  { id: 'beam-gain-words', name: 'Beam + boost + custom words (default)', tuning: DEFAULT_TUNING },
  { id: 'beam-gain-words3', name: 'Beam + boost + custom words, stronger', tuning: { ...DEFAULT_TUNING, wordsScore: 3 } },
  { id: 'beam-gain-words5', name: 'Beam + boost + custom words, strongest', tuning: { ...DEFAULT_TUNING, wordsScore: 5 } },
  {
    id: 'beam-gain-gentle',
    name: 'Beam + boost + gentler voice gate',
    tuning: { ...DEFAULT_TUNING, vadThreshold: 0.35, pauseMs: 1200 },
  },
  { id: 'beam-gain-open', name: 'Beam + boost, no voice gate', tuning: { ...DEFAULT_TUNING, gate: false } },
];

/** One line saying what a setting does, for the results list. */
export function describe(t: ListenTuning): string {
  const parts = [t.beam ? 'beam search' : 'greedy', t.gain ? 'volume boost' : 'no boost'];
  if (t.beam && t.words !== false) parts.push(`custom words ${t.wordsScore ?? 1.5}`);
  parts.push(t.gate ? `voice gate ${t.vadThreshold}, ${(t.pauseMs / 1000).toFixed(1)} s pause` : 'no voice gate');
  return parts.join(' · ');
}

export function sameTuning(a: ListenTuning | null | undefined, b: ListenTuning | null | undefined): boolean {
  if (!a || !b) return false;
  // Builds before custom words leave words out; that reads as the default (on).
  const words = (t: ListenTuning) => t.words ?? true;
  return (
    a.beam === b.beam &&
    a.gain === b.gain &&
    a.gate === b.gate &&
    a.pauseMs === b.pauseMs &&
    words(a) === words(b) &&
    Math.abs((a.wordsScore ?? 1.5) - (b.wordsScore ?? 1.5)) < 1e-6 &&
    Math.abs(a.vadThreshold - b.vadThreshold) < 1e-6
  );
}

/**
 * The variant to recommend: the lowest word error. A variant within one word of the best wins if
 * it runs faster, so a tiny gain does not cost battery on every meeting.
 */
export function pickBest<T extends { wer?: number; rtf?: number; refWords?: number }>(rows: T[]): T | null {
  const ok = rows.filter((r) => r.wer !== undefined);
  if (!ok.length) return null;
  const lowest = Math.min(...ok.map((r) => r.wer!));
  const oneWord = 1 / Math.max(1, ...ok.map((r) => r.refWords ?? 0));
  const near = ok.filter((r) => r.wer! <= lowest + oneWord + 1e-9);
  return near.reduce((a, b) => ((b.rtf ?? Infinity) < (a.rtf ?? Infinity) ? b : a));
}
