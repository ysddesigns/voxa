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
  marks: Mark[];
  error: string | null;
};

/** Native errors name a missing pack as "NEEDS_PACK:<id>"; say what to do instead. */
export function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/NEEDS_PACK/.test(message)) return 'Listening needs a one-time download first.';
  return message || 'Could not start listening';
}

export const IDLE: RecorderState = { status: 'idle', sessionId: null, title: '', segments: [], partial: '', marks: [], error: null };

const SAVE_EVERY_MS = 5000;

export class ListenRecorder {
  private state: RecorderState = IDLE;
  private session: ListenSession | null = null;
  private writes: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null = null;
  /**
   * Mic level listeners. Level arrives with every audio buffer, many times a second, so it is
   * not part of the state: putting it there would redraw every screen that reads the session.
   */
  private levelListeners = new Set<(rms: number) => void>();
  /** Runs after every stop, from the app or the notification's Stop button (speaker labels, list reload). */
  private afterStop: ((id: string | null) => void) | null = null;

  onStopped(fn: ((id: string | null) => void) | null) {
    this.afterStop = fn;
  }

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

  /** Calls fn with each mic level (0 while paused or stopped); returns the unsubscribe. */
  onLevel(fn: (rms: number) => void): () => void {
    this.levelListeners.add(fn);
    return () => {
      this.levelListeners.delete(fn);
    };
  }

  private level(rms: number) {
    for (const fn of this.levelListeners) fn(rms);
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

  /** noticeCaptions: put the latest sentence in the Listen notification. */
  async start(options: { noticeCaptions?: boolean } = {}): Promise<void> {
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
            this.level(e.rms);
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
            this.set({ status: 'paused' });
            this.level(0);
            break;
          case 'resumed':
            this.set({ status: 'listening' });
            break;
          case 'error':
            this.set({ error: e.message });
            break;
          case 'action':
            // A notification button, pressed with the app in the background or on the lock screen.
            if (e.action === 'pause') void this.pause();
            else if (e.action === 'resume') void this.resume();
            else if (e.action === 'mark') this.mark();
            else if (e.action === 'stop') void this.stop();
            break;
        }
      }, { audioPath: this.store.audioPath(id), title, noticeCaptions: options.noticeCaptions });
    } catch (err) {
      await this.store.remove(id).catch(() => {});
      this.set({ ...IDLE, error: friendlyError(err) });
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
    this.set({ status: 'stopping' });
    this.level(0);
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
    this.afterStop?.(savedId);
    return savedId;
  }
}
