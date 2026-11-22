import type { ListenTuning } from '../../../modules/voxa-engine';

/**
 * Live settings test (Engine lab): the same recording goes through Live's own pipeline once per
 * variant, each transcript is scored, and the best can be saved as the settings Live uses.
 */

/** What Voxa shipped with. Must match ListenTuning's defaults in ListenTuning.kt. */
export const DEFAULT_TUNING: ListenTuning = { beam: false, gain: false, vadThreshold: 0.5, pauseMs: 800, gate: true };

export type TuneVariant = { id: string; name: string; tuning: ListenTuning };

/** Each step adds one change to the one before, so the scores show what each change is worth. */
export const VARIANTS: TuneVariant[] = [
  { id: 'shipped', name: 'As shipped', tuning: DEFAULT_TUNING },
  { id: 'beam', name: 'Beam search', tuning: { ...DEFAULT_TUNING, beam: true } },
  { id: 'beam-gain', name: 'Beam search + volume boost', tuning: { ...DEFAULT_TUNING, beam: true, gain: true } },
  {
    id: 'beam-gain-gentle',
    name: 'Beam + boost + gentler voice gate',
    tuning: { ...DEFAULT_TUNING, beam: true, gain: true, vadThreshold: 0.35, pauseMs: 1200 },
  },
  { id: 'beam-gain-open', name: 'Beam + boost, no voice gate', tuning: { ...DEFAULT_TUNING, beam: true, gain: true, gate: false } },
];

/** One line saying what a setting does, for the results list. */
export function describe(t: ListenTuning): string {
  const parts = [t.beam ? 'beam search' : 'greedy', t.gain ? 'volume boost' : 'no boost'];
  parts.push(t.gate ? `voice gate ${t.vadThreshold}, ${(t.pauseMs / 1000).toFixed(1)} s pause` : 'no voice gate');
  return parts.join(' · ');
}

export function sameTuning(a: ListenTuning | null | undefined, b: ListenTuning | null | undefined): boolean {
  if (!a || !b) return false;
  return a.beam === b.beam && a.gain === b.gain && a.gate === b.gate && a.pauseMs === b.pauseMs && Math.abs(a.vadThreshold - b.vadThreshold) < 1e-6;
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
