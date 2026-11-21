import type { Summary, TranscriptSegment } from '@/engines/types';
import type { Files } from './files';

/**
 * Saved Listen sessions (and later Scan results) on the phone.
 *
 * Each session is a folder: meta.json (rewritten whole, swapped in safely) and segments.jsonl,
 * which is only ever appended to, one finished sentence per line. A crash loses at most the line
 * being written; a session still marked "recording" on start-up is recovered from what is there.
 */

export type Mark = { atMs: number; label?: string };

export type SessionStatus = 'recording' | 'saved' | 'recovered';

export type SessionMeta = {
  id: string;
  kind: 'listen';
  title: string;
  /** Epoch ms. */
  startedAt: number;
  /** Audio time listened, pauses left out. */
  durationMs: number;
  status: SessionStatus;
  marks: Mark[];
  /** Number of speakers found after the meeting, when labelled. */
  speakers?: number;
  /** The audio is still on the phone, waiting for speaker labels. */
  hasAudio?: boolean;
  summary?: Summary;
};

export type Session = SessionMeta & { segments: TranscriptSegment[] };

const DIR = 'sessions';
const metaPath = (id: string) => `${DIR}/${id}/meta.json`;
const segPath = (id: string) => `${DIR}/${id}/segments.jsonl`;
const labelsPath = (id: string) => `${DIR}/${id}/speakers.json`;

const SAFE_ID = /^[a-z0-9-]{1,64}$/;

export function newSessionId(now = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** "Meeting, Tue 21 Nov, 14:05": a title the user can change later. */
export function defaultTitle(at: number): string {
  const d = new Date(at);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `Meeting, ${day}, ${time}`;
}

function parseMeta(text: string | null): SessionMeta | null {
  if (!text) return null;
  try {
    const m = JSON.parse(text) as SessionMeta;
    if (!m || typeof m.id !== 'string' || typeof m.startedAt !== 'number') return null;
    return { ...m, marks: Array.isArray(m.marks) ? m.marks : [] };
  } catch {
    return null;
  }
}

/** Reads the append-only log; a half-written last line (from a crash) is skipped. */
export function parseSegments(text: string | null): TranscriptSegment[] {
  if (!text) return [];
  const out: TranscriptSegment[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const s = JSON.parse(line) as TranscriptSegment;
      if (s && typeof s.text === 'string' && typeof s.startMs === 'number') out.push({ ...s, final: true });
    } catch {
      // Torn line: ignore.
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

export class SessionStore {
  /** root: the folder `files` works in, relative to the documents folder (for paths given to native code). */
  constructor(
    private readonly files: Files,
    private readonly root = 'voxa',
  ) {}

  async create(meta: Omit<SessionMeta, 'status' | 'marks' | 'durationMs'> & Partial<SessionMeta>): Promise<SessionMeta> {
    if (!SAFE_ID.test(meta.id)) throw new Error('Bad session id');
    const full: SessionMeta = { status: 'recording', marks: [], durationMs: 0, ...meta };
    await this.files.write(metaPath(full.id), JSON.stringify(full));
    return full;
  }

  async appendSegment(id: string, segment: TranscriptSegment): Promise<void> {
    if (!segment.final || !segment.text.trim()) return;
    await this.files.append(segPath(id), `${JSON.stringify(segment)}\n`);
  }

  async updateMeta(id: string, change: Partial<SessionMeta>): Promise<SessionMeta | null> {
    const meta = parseMeta(await this.files.read(metaPath(id)));
    if (!meta) return null;
    const next = { ...meta, ...change, id };
    await this.files.write(metaPath(id), JSON.stringify(next));
    return next;
  }

  /** Speaker numbers by segment id, saved after the meeting (kept apart so the log stays append-only). */
  async setSpeakers(id: string, bySegment: Record<string, number>, count: number): Promise<void> {
    await this.files.write(labelsPath(id), JSON.stringify(bySegment));
    await this.updateMeta(id, { speakers: count });
  }

  /** Newest first. */
  async list(): Promise<SessionMeta[]> {
    const ids = await this.files.list(DIR);
    const metas = await Promise.all(ids.filter((id) => SAFE_ID.test(id)).map(async (id) => parseMeta(await this.files.read(metaPath(id)))));
    return metas.filter((m): m is SessionMeta => !!m).sort((a, b) => b.startedAt - a.startedAt);
  }

  async load(id: string): Promise<Session | null> {
    if (!SAFE_ID.test(id)) return null;
    const meta = parseMeta(await this.files.read(metaPath(id)));
    if (!meta) return null;
    const segments = parseSegments(await this.files.read(segPath(id)));
    let labels: Record<string, number> = {};
    try {
      labels = JSON.parse((await this.files.read(labelsPath(id))) ?? '{}') as Record<string, number>;
    } catch {
      labels = {};
    }
    return { ...meta, segments: segments.map((s) => (s.id in labels ? { ...s, speaker: labels[s.id] } : s)) };
  }

  /** Where Listen keeps the meeting's audio until speakers are labelled (relative to the documents folder). */
  audioPath(id: string): string {
    return `${this.root}/${DIR}/${id}/audio.pcm`;
  }

  /** The audio is only kept for speaker labels: dropped once they are found, or when asked. */
  async removeAudio(id: string): Promise<void> {
    if (!SAFE_ID.test(id)) return;
    await this.files.remove(`${DIR}/${id}/audio.pcm`);
    await this.updateMeta(id, { hasAudio: false });
  }

  async remove(id: string): Promise<void> {
    if (!SAFE_ID.test(id)) return;
    await this.files.remove(`${DIR}/${id}`);
  }

  /**
   * Sessions left "recording" (the app was killed or crashed): mark them recovered, with the
   * duration taken from the last saved sentence. `activeId` is a session running right now.
   */
  async recoverUnfinished(activeId?: string): Promise<SessionMeta[]> {
    const recovered: SessionMeta[] = [];
    for (const meta of await this.list()) {
      if (meta.status !== 'recording' || meta.id === activeId) continue;
      const segments = parseSegments(await this.files.read(segPath(meta.id)));
      const lastEnd = segments.reduce((n, s) => Math.max(n, s.endMs), 0);
      const next = await this.updateMeta(meta.id, { status: 'recovered', durationMs: Math.max(meta.durationMs, lastEnd) });
      if (next) recovered.push(next);
    }
    return recovered;
  }
}
