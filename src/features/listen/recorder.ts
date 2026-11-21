import type { ListenSession, SpeechEngine, Summary, TranscriptSegment } from '@/engines/types';
import { defaultTitle, newSessionId, type Mark, type SessionStore } from '@/storage/sessions';

/**
 * One Listen session at a time, saved as it goes: every finished sentence is appended to the
 * session's log the moment it arrives, marks are saved when made, and the listened time every
 * few seconds. If the app dies, the next start recovers the session (SessionStore.recoverUnfinished).
 */

export type ListenStatus = 'idle' | 'starting' | 'listening' | 'paused' | 'stopping';

export type RecorderState = {
  status: ListenStatus;
  sessionId: string | null;
  title: string;
  /** Finished sentences, oldest first. */
  segments: TranscriptSegment[];
  /** The sentence still being heard. */
  partial: string;
  level: number;
  marks: Mark[];
  error: string | null;
};

export const IDLE: RecorderState = { status: 'idle', sessionId: null, title: '', segments: [], partial: '', level: 0, marks: [], error: null };

const SAVE_EVERY_MS = 5000;

export class ListenRecorder {
  private state: RecorderState = IDLE;
  private session: ListenSession | null = null;
  private writes: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly engine: SpeechEngine,
    private readonly store: SessionStore,
    private readonly onChange: (s: RecorderState) => void,
    private readonly summarize: (segments: TranscriptSegment[]) => Summary,
    private readonly now: () => number = Date.now,
  ) {}

  get current() {
    return this.state;
  }

  elapsedMs() {
    return this.session?.elapsedMs() ?? 0;
  }

  private set(change: Partial<RecorderState>) {
    this.state = { ...this.state, ...change };
    this.onChange(this.state);
  }

  /** Saves in order; a failed write is reported but does not stop listening. */
  private save(step: () => Promise<unknown>) {
    this.writes = this.writes.then(step).then(
      () => undefined,
      (err: unknown) => {
        if (__DEV__) console.warn('Voxa could not save the session', err);
        this.set({ error: 'Could not save to the phone. Check free space.' });
      },
    );
    return this.writes;
  }

  async start(): Promise<void> {
    if (this.state.status !== 'idle') return;
    const startedAt = this.now();
    const id = newSessionId(startedAt);
    const title = defaultTitle(startedAt);
    this.set({ ...IDLE, status: 'starting', sessionId: id, title });
    try {
      await this.store.create({ id, kind: 'listen', title, startedAt, hasAudio: !!this.engine.labelSpeakers });
      this.session = await this.engine.start((e) => {
        switch (e.type) {
          case 'level':
            this.set({ level: e.rms });
            break;
          case 'segment':
            if (e.segment.final) {
              if (!e.segment.text.trim()) {
                this.set({ partial: '' });
                break;
              }
              this.set({ segments: [...this.state.segments, e.segment], partial: '' });
              const seg = e.segment;
              this.save(() => this.store.appendSegment(id, seg));
            } else {
              this.set({ partial: e.segment.text });
            }
            break;
          case 'paused':
            this.set({ status: 'paused', level: 0 });
            break;
          case 'resumed':
            this.set({ status: 'listening' });
            break;
          case 'error':
            this.set({ error: e.message });
            break;
        }
      }, { audioPath: this.store.audioPath(id) });
    } catch (err) {
      await this.store.remove(id).catch(() => {});
      this.set({ ...IDLE, error: err instanceof Error ? err.message : 'Could not start listening' });
      return;
    }
    this.set({ status: 'listening' });
    this.timer = setInterval(() => {
      const durationMs = this.elapsedMs();
      this.save(() => this.store.updateMeta(id, { durationMs }));
    }, SAVE_EVERY_MS);
  }

  async pause() {
    if (this.state.status === 'listening') await this.session?.pause();
  }

  async resume() {
    if (this.state.status === 'paused') await this.session?.resume();
  }

  mark(label?: string): Mark | null {
    const id = this.state.sessionId;
    if (!this.session || !id || (this.state.status !== 'listening' && this.state.status !== 'paused')) return null;
    const m: Mark = { atMs: this.session.mark(label).atMs, ...(label ? { label } : {}) };
    const marks = [...this.state.marks, m];
    this.set({ marks });
    this.save(() => this.store.updateMeta(id, { marks }));
    return m;
  }

  /** Stops and saves. Returns the saved session's id, or null when nothing was heard. */
  async stop(): Promise<string | null> {
    const id = this.state.sessionId;
    const session = this.session;
    if (!id || !session || this.state.status === 'stopping') return null;
    this.set({ status: 'stopping', level: 0 });
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    let segments: TranscriptSegment[] = this.state.segments;
    try {
      segments = await session.stop();
    } catch {
      // Keep what was already heard.
    }
    this.session = null;
    const durationMs = Math.max(session.elapsedMs(), ...segments.map((s) => s.endMs));
    await this.writes;
    // Sentences that arrived as events are saved already; save any the engine returned without one.
    const saved = new Set(this.state.segments.map((s) => s.id));
    for (const s of segments) if (!saved.has(s.id)) this.save(() => this.store.appendSegment(id, s));
    let savedId: string | null = id;
    if (segments.length === 0 && this.state.marks.length === 0) {
      await this.store.remove(id).catch(() => {});
      savedId = null;
    } else {
      await this.save(() =>
        this.store.updateMeta(id, { status: 'saved', durationMs, marks: this.state.marks, summary: this.summarize(segments) }),
      );
    }
    this.set({ ...IDLE, error: savedId ? this.state.error : 'Nothing was heard, so nothing was saved.' });
    return savedId;
  }
}
