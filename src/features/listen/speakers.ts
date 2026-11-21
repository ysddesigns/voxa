import type { SpeakerTurn, TranscriptSegment } from '@/engines/types';

/**
 * Gives each sentence the speaker who talked most during it (by overlap with the speaker turns).
 * Sentences no turn overlaps get the nearest turn within 1.5 s, else stay unlabelled.
 * Speakers are renumbered 0, 1, 2... in the order they first speak in the transcript.
 */
export function assignSpeakers(segments: TranscriptSegment[], turns: SpeakerTurn[]): { bySegment: Record<string, number>; count: number } {
  const raw: Record<string, number> = {};
  for (const seg of segments) {
    const talk = new Map<number, number>();
    for (const t of turns) {
      const overlap = Math.min(seg.endMs, t.endMs) - Math.max(seg.startMs, t.startMs);
      if (overlap > 0) talk.set(t.speaker, (talk.get(t.speaker) ?? 0) + overlap);
    }
    let best: number | null = null;
    let most = 0;
    talk.forEach((ms, speaker) => {
      if (ms > most) {
        most = ms;
        best = speaker;
      }
    });
    if (best === null) best = nearest(seg, turns);
    if (best !== null) raw[seg.id] = best;
  }

  const order = new Map<number, number>();
  const bySegment: Record<string, number> = {};
  for (const seg of [...segments].sort((a, b) => a.startMs - b.startMs)) {
    if (!(seg.id in raw)) continue;
    const s = raw[seg.id];
    if (!order.has(s)) order.set(s, order.size);
    bySegment[seg.id] = order.get(s)!;
  }
  return { bySegment, count: order.size };
}

const NEAR_MS = 1500;

function nearest(seg: TranscriptSegment, turns: SpeakerTurn[]): number | null {
  let best: number | null = null;
  let gap = NEAR_MS;
  for (const t of turns) {
    const d = t.endMs < seg.startMs ? seg.startMs - t.endMs : t.startMs > seg.endMs ? t.startMs - seg.endMs : 0;
    if (d <= gap) {
      gap = d;
      best = t.speaker;
    }
  }
  return best;
}

export const speakerName = (speaker: number | null) => (speaker === null ? null : `Speaker ${speaker + 1}`);
