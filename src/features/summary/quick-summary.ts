import type { ActionItem, Summary, TranscriptSegment } from '@/engines/types';

/**
 * Quick summary: runs on every phone with no model download (PRD SU-1, Lite tier).
 * Key moments: sentences scored by TF-IDF-style word weight, then de-duplicated (MMR-like).
 * Actions: commitment phrases, requests and date expressions, labelled "possible".
 */

const STOP = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have he her his i if in into is it its ' +
    'just like me my no not of on or our so than that the their them then there these they this to too up us was we ' +
    'were what when which who will with would you your yeah okay ok um uh right well also very really get got going'
  ).split(' '),
);

const COMMIT = /\b(i'?ll|i will|we'?ll|we will|i'?m going to|we need to|need to|let'?s|can you|could you|please|follow up|action item|make sure)\b/i;
const DUE = /\b(today|tomorrow|tonight|next week|this week|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|end of (the )?(day|week|month))|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|before (standup|the meeting|lunch))\b/i;

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  a.forEach((w) => {
    if (b.has(w)) n++;
  });
  return n / Math.min(a.size, b.size);
}

type Sentence = { text: string; atMs: number; speaker: number | null; terms: string[] };

export function extractActions(sentences: { text: string; speaker: number | null }[]): ActionItem[] {
  const out: ActionItem[] = [];
  for (const s of sentences) {
    if (!COMMIT.test(s.text)) continue;
    const due = s.text.match(DUE)?.[0] ?? null;
    const selfCommit = /\b(i'?ll|i will|i'?m going to)\b/i.test(s.text);
    out.push({
      text: s.text.replace(/\s+/g, ' ').trim(),
      owner: selfCommit && s.speaker !== null ? `Speaker ${s.speaker + 1}` : null,
      due,
      possible: true,
    });
  }
  return out;
}

export function quickSummary(segments: TranscriptSegment[], maxPoints = 3): Summary {
  const sentences: Sentence[] = [];
  for (const seg of segments) {
    if (!seg.final) continue;
    for (const text of splitSentences(seg.text)) {
      sentences.push({ text, atMs: seg.startMs, speaker: seg.speaker, terms: words(text) });
    }
  }

  // Document frequency across sentences, used as an IDF-style weight.
  const df = new Map<string, number>();
  for (const s of sentences) new Set(s.terms).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
  const tf = new Map<string, number>();
  for (const s of sentences) s.terms.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
  const n = Math.max(1, sentences.length);

  const scored = sentences
    .map((s) => {
      if (s.terms.length < 3) return { s, score: 0 };
      const sum = s.terms.reduce((acc, t) => acc + (tf.get(t) ?? 0) * Math.log(1 + n / (df.get(t) ?? 1)), 0);
      return { s, score: sum / Math.sqrt(s.terms.length) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: Sentence[] = [];
  for (const { s } of scored) {
    if (picked.length >= maxPoints) break;
    const set = new Set(s.terms);
    if (picked.some((p) => overlap(set, new Set(p.terms)) > 0.6)) continue;
    picked.push(s);
  }
  picked.sort((a, b) => a.atMs - b.atMs);

  return {
    kind: 'quick',
    keyPoints: picked.map((p) => ({ text: p.text, atMs: p.atMs, speaker: p.speaker })),
    actions: extractActions(sentences),
  };
}
