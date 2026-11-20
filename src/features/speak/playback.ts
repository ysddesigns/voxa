/**
 * Pure playback maths shared by the editor preview, the player and the mock voice.
 * Timing is estimated from words until the native engine reports real audio positions.
 */

export type Word = { index: number; start: number; end: number };

/** Average speaking rate at 1.0x. */
export const WORDS_PER_MINUTE = 160;

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export function tokenize(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index ?? 0;
    out.push({ index: out.length, start, end: start + m[0].length });
  }
  return out;
}

export function msPerWord(rate: number): number {
  return 60000 / (WORDS_PER_MINUTE * rate);
}

export function durationMs(wordCount: number, rate: number): number {
  return Math.round(wordCount * msPerWord(rate));
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(0, Math.round(index)), count - 1);
}

/** Word to start from when the user taps a point (0..1) on the waveform. */
export function wordAtFraction(fraction: number, count: number): number {
  return clampIndex(Math.floor(fraction * count), count);
}

/** How many words a 15-second skip covers at this speed. */
export function wordsForSeconds(seconds: number, rate: number): number {
  return Math.max(1, Math.round((seconds * 1000) / msPerWord(rate)));
}

/** Word whose characters contain charIndex (or the next one after it). */
export function wordAtChar(words: Word[], charIndex: number): number {
  for (const w of words) if (charIndex < w.end) return w.index;
  return Math.max(0, words.length - 1);
}

export function nextSpeed(rate: number): number {
  const i = SPEEDS.findIndex((s) => s === rate);
  return SPEEDS[(i + 1) % SPEEDS.length];
}

export function formatSpeed(rate: number): string {
  return `${rate % 1 === 0 ? rate.toFixed(1) : String(rate)}×`;
}
