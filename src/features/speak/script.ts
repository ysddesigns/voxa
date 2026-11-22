/**
 * Script refinements for Speak for me (PRD ED-2, ED-3). People write them in the script as plain
 * text, so they survive copy and paste:
 *
 *   [pause]  [long pause]  [pause 2s]   silence there (0.6 s, 1.5 s, or the seconds given)
 *   *really*                            emphasis, as in WhatsApp: a little slower and louder,
 *                                       with a short breath either side
 *
 * plus a style for the whole script and a "Say as" dictionary (word → how it should sound).
 *
 * parseScript turns the script into the text the voice reads (markers removed, "Say as" words
 * replaced) and pieces telling the engine how to read each stretch. `toOriginal` maps a position
 * in the spoken text back to the script, for word highlighting.
 *
 * The voice model (Piper) has one fixed tone, so styles and emphasis change pace, loudness and
 * pauses, not the voice itself.
 */
import type { SpeakPiece } from '@/engines/types';
import type { Word } from './playback';

export type Style = 'neutral' | 'warm' | 'upbeat' | 'slow';
export const STYLES: Style[] = ['neutral', 'warm', 'upbeat', 'slow'];
export const STYLE_LABEL: Record<Style, string> = { neutral: 'Neutral', warm: 'Warm', upbeat: 'Upbeat', slow: 'Slow' };

const STYLE_SETTINGS: Record<Style, { speed: number; gain: number; gapMs: number }> = {
  neutral: { speed: 1, gain: 1, gapMs: 0 },
  warm: { speed: 0.93, gain: 0.92, gapMs: 150 },
  upbeat: { speed: 1.1, gain: 1.05, gapMs: 0 },
  slow: { speed: 0.82, gain: 1, gapMs: 300 },
};

/** How much faster (above 1) or slower a style reads, for length estimates. */
export const styleSpeed = (style: Style) => STYLE_SETTINGS[style].speed;

export const PAUSE_MS = 600;
export const LONG_PAUSE_MS = 1500;
const MAX_PAUSE_MS = 5000;
const EMPHASIS = { speed: 0.86, gain: 1.25, breathMs: 150 };

/** How the engine reads one stretch of the spoken text. speed multiplies the chosen playback speed. */
export type { SpeakPiece };

export type SayAs = Record<string, string>;

export type ParsedScript = {
  spoken: string;
  pieces: SpeakPiece[];
  /** Script position of each spoken character. */
  map: number[];
  pauseMs: number;
  /** Script ranges that are markers, not words: no highlighting, not counted. */
  markers: { start: number; end: number }[];
};

// A pause marker, or *emphasis* (asterisks hugging the text, no line break inside).
const TOKEN = /\[(long\s+)?pause(?:\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?)?\]|\*(?=\S)([^*\n]*?\S)\*/gi;
const WORD = /[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*/gu;

export const sayAsKey = (word: string) => word.normalize('NFC').toLowerCase().replace(/’/g, "'");

export function parseScript(text: string, style: Style = 'neutral', sayAs: SayAs = {}): ParsedScript {
  const st = STYLE_SETTINGS[style];
  let spoken = '';
  const map: number[] = [];
  const pieces: SpeakPiece[] = [];
  const markers: { start: number; end: number }[] = [];
  let pauseTotal = 0;
  let piece: SpeakPiece = { start: 0, end: 0, speed: st.speed, gain: st.gain, pauseMs: 0, gapMs: st.gapMs };

  const close = () => {
    piece.end = spoken.length;
    if (piece.end > piece.start || piece.pauseMs > 0) pieces.push(piece);
  };
  const open = (speed: number, gain: number) => {
    piece = { start: spoken.length, end: spoken.length, speed, gain, pauseMs: 0, gapMs: st.gapMs };
  };
  const addPause = (ms: number) => {
    piece.pauseMs += ms;
    pauseTotal += ms;
    close();
    open(piece.speed, piece.gain);
  };
  const append = (from: number, chunk: string) => {
    let last = 0;
    for (const m of chunk.matchAll(WORD)) {
      const replacement = sayAs[sayAsKey(m[0])];
      if (!replacement) continue;
      for (let i = last; i < m.index; i++) push(chunk[i], from + i);
      for (const ch of replacement) push(ch, from + m.index);
      last = m.index + m[0].length;
    }
    for (let i = last; i < chunk.length; i++) push(chunk[i], from + i);
  };
  const push = (ch: string, at: number) => {
    spoken += ch;
    map.push(at);
  };

  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    append(at, text.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[3] === undefined) {
      markers.push({ start: m.index, end: at });
      const seconds = m[2] ? Number(m[2]) : null;
      addPause(Math.min(MAX_PAUSE_MS, seconds !== null ? Math.round(seconds * 1000) : m[1] ? LONG_PAUSE_MS : PAUSE_MS));
      // Keep words on either side of a marker apart.
      if (spoken && !/\s$/.test(spoken)) push(' ', m.index);
    } else {
      const base = { speed: piece.speed, gain: piece.gain };
      addPause(EMPHASIS.breathMs);
      piece.speed = st.speed * EMPHASIS.speed;
      piece.gain = st.gain * EMPHASIS.gain;
      append(m.index + 1, m[3]);
      addPause(EMPHASIS.breathMs);
      piece.speed = base.speed;
      piece.gain = base.gain;
    }
  }
  append(at, text.slice(at));
  close();
  return { spoken, pieces: mergeTouching(pieces), map, pauseMs: pauseTotal, markers };
}

/** Joins neighbours read the same way with no pause between them. */
function mergeTouching(pieces: SpeakPiece[]): SpeakPiece[] {
  const out: SpeakPiece[] = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    if (prev && prev.pauseMs === 0 && prev.end === p.start && prev.speed === p.speed && prev.gain === p.gain) prev.end = p.end;
    else out.push({ ...p });
  }
  return out;
}

/** The spoken text and pieces from a script position on (play from a word, resume after pause). */
export function planFrom(parsed: ParsedScript, scriptOffset: number) {
  let k = parsed.map.findIndex((orig) => orig >= scriptOffset);
  if (k < 0) k = parsed.spoken.length;
  const pieces = parsed.pieces
    // From the start, a pause before the first word still counts; when resuming, it is behind us.
    .filter((p) => p.end > k || (k === 0 && p.end === 0))
    .map((p) => ({ ...p, start: Math.max(0, p.start - k), end: p.end - k }));
  return {
    spoken: parsed.spoken.slice(k),
    pieces,
    toOriginal: (i: number) => (k + i < parsed.map.length ? parsed.map[k + i] : parsed.map.length ? parsed.map[parsed.map.length - 1] + 1 : 0),
  };
}

/** The script's words for counting and highlighting, without the markers. */
export function scriptWords(text: string, markers: ParsedScript['markers']): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index;
    const end = start + m[0].length;
    if (markers.some((r) => start < r.end && end > r.start)) continue;
    out.push({ index: out.length, start, end });
  }
  return out;
}

// --- Editing helpers for the toolbar ----------------------------------------------------------

export type Selection = { start: number; end: number };
export type Edit = { text: string; selection: Selection };

/** Inserts a pause marker at the cursor (replacing any selection), with spaces around it. */
export function insertPause(text: string, sel: Selection, long = false): Edit {
  const marker = long ? '[long pause]' : '[pause]';
  const before = text.slice(0, sel.start);
  const after = text.slice(sel.end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^\s/.test(after) ? ' ' : '';
  const next = `${before}${lead}${marker}${trail}${after}`;
  const cursor = before.length + lead.length + marker.length + trail.length;
  return { text: next, selection: { start: cursor, end: cursor } };
}

/** The word around the cursor, or the selection trimmed of spaces. */
export function wordAt(text: string, sel: Selection): Selection | null {
  if (sel.end > sel.start) {
    let { start, end } = sel;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    return end > start ? { start, end } : null;
  }
  let start = sel.start;
  let end = sel.start;
  while (start > 0 && /[^\s*]/.test(text[start - 1])) start--;
  while (end < text.length && /[^\s*]/.test(text[end])) end++;
  // Leave trailing punctuation outside the emphasis: "*now*." not "*now.*"
  while (end > start && /[.,;:!?)"”’]/.test(text[end - 1])) end--;
  return end > start ? { start, end } : null;
}

/** Wraps the selection (or the word at the cursor) in *…*, or removes the emphasis if already there. */
export function toggleEmphasis(text: string, sel: Selection): Edit | null {
  const r = wordAt(text, sel);
  if (!r) return null;
  if (text[r.start - 1] === '*' && text[r.end] === '*') {
    const next = text.slice(0, r.start - 1) + text.slice(r.start, r.end) + text.slice(r.end + 1);
    return { text: next, selection: { start: r.start - 1, end: r.end - 1 } };
  }
  if (text[r.start] === '*' && text[r.end - 1] === '*' && r.end - r.start > 2) {
    const next = text.slice(0, r.start) + text.slice(r.start + 1, r.end - 1) + text.slice(r.end);
    return { text: next, selection: { start: r.start, end: r.end - 2 } };
  }
  const next = `${text.slice(0, r.start)}*${text.slice(r.start, r.end)}*${text.slice(r.end)}`;
  return { text: next, selection: { start: r.start + 1, end: r.end + 1 } };
}

/** The plain word at the cursor for "Say as": letters only, no markers or punctuation. */
export function sayAsWordAt(text: string, sel: Selection): string | null {
  const r = wordAt(text, sel);
  if (!r) return null;
  const m = text.slice(r.start, r.end).match(WORD);
  return m ? m[0] : null;
}
