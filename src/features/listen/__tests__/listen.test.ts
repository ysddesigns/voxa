import type { NativeListenEvent } from '../../../../modules/voxa-engine';
import { startNativeListen, type ListenNative } from '@/engines/native/listen';
import type { ListenEvent, SpeechEngine } from '@/engines/types';
import { quickSummary } from '@/features/summary/quick-summary';
import { memoryFiles } from '@/storage/files';
import { SessionStore } from '@/storage/sessions';
import { labelSession } from '../label';
import { ListenRecorder } from '../recorder';
import { assignSpeakers } from '../speakers';

const seg = (id: string, startMs: number, endMs: number) => ({ id, speaker: null, text: `S ${id}.`, startMs, endMs, final: true });

describe('assignSpeakers', () => {
  it('picks the speaker who talked most in each sentence, numbered by first appearance', () => {
    const segments = [seg('a', 0, 2000), seg('b', 2000, 4000), seg('c', 9000, 9500)];
    const turns = [
      { startMs: 0, endMs: 1800, speaker: 4 },
      { startMs: 1800, endMs: 4000, speaker: 2 },
      { startMs: 9800, endMs: 12000, speaker: 4 }, // 300 ms after "c": nearest
    ];
    expect(assignSpeakers(segments, turns)).toEqual({ bySegment: { a: 0, b: 1, c: 0 }, count: 2 });
  });

  it('leaves a sentence unlabelled when no turn is near', () => {
    expect(assignSpeakers([seg('a', 0, 1000)], [{ startMs: 5000, endMs: 6000, speaker: 0 }]).bySegment).toEqual({});
  });
});

function fakeNative(heardMs: number | null) {
  const listeners = new Set<(e: NativeListenEvent) => void>();
  const calls: string[] = [];
  const native = {
    requestMicPermission: async () => ({ granted: true }),
    startListening: jest.fn(async (path: string) => {
      calls.push(`start:${path}`);
    }),
    stopListening: jest.fn(async () => {
      calls.push('stop');
      return heardMs === null ? null : { heardMs };
    }),
    labelSpeakers: jest.fn(async () => [{ startMs: 0, endMs: 10_000, speaker: 3 }]),
    cancelLabel: jest.fn(),
    addListener: (event: string, l: (e: never) => void) => {
      if (event !== 'onListen') return { remove() {} };
      listeners.add(l as (e: NativeListenEvent) => void);
      return { remove: () => listeners.delete(l as (e: NativeListenEvent) => void) };
    },
  };
  const emit = (e: NativeListenEvent) => listeners.forEach((l) => l(e));
  return { native: native as unknown as ListenNative, emit, calls, listeners };
}

describe('native listen session', () => {
  it('really stops the mic on pause and shifts later sentences by the audio heard before', async () => {
    const { native, emit, calls } = fakeNative(4000);
    const events: ListenEvent[] = [];
    let t = 0;
    const s = await startNativeListen(native, (e) => events.push(e), { audioPath: 'voxa/sessions/x/audio.pcm' }, () => t);
    emit({ type: 'segment', index: 0, text: 'HELLO', startMs: 0, endMs: 900, final: true });
    t = 5000;
    await s.pause();
    expect(s.elapsedMs()).toBe(4000); // from the audio, not the clock
    t = 60_000;
    expect(s.mark().atMs).toBe(4000); // the clock stops while paused
    await s.resume();
    emit({ type: 'segment', index: 0, text: 'Again.', startMs: 100, endMs: 800, final: true });
    const segments = await s.stop();

    expect(calls).toEqual(['start:voxa/sessions/x/audio.pcm', 'stop', 'start:voxa/sessions/x/audio.pcm', 'stop']);
    expect(segments.map((x) => [x.id, x.text, x.startMs])).toEqual([
      ['n0-0', 'Hello', 0],
      ['n1-0', 'Again.', 4100],
    ]);
    expect(events.filter((e) => e.type === 'paused' || e.type === 'resumed').map((e) => e.type)).toEqual(['paused', 'resumed']);
  });

  it('falls back to the clock on builds that do not report audio heard', async () => {
    const { native } = fakeNative(null);
    let t = 0;
    const s = await startNativeListen(native, () => {}, {}, () => t);
    t = 2500;
    await s.pause();
    expect(s.elapsedMs()).toBe(2500);
  });

  it('stops only once when stop is tapped twice', async () => {
    const { native, calls } = fakeNative(1000);
    const s = await startNativeListen(native, () => {});
    await Promise.all([s.stop(), s.stop()]);
    expect(calls.filter((c) => c === 'stop')).toHaveLength(1);
  });
});

describe('Listen notification', () => {
  function noticeNative() {
    const base = fakeNative(3000);
    let action: ((e: { action: 'pause' | 'resume' | 'mark' | 'stop' }) => void) | null = null;
    const n = base.native as unknown as Record<string, unknown>;
    const add = n.addListener as (event: string, l: (e: never) => void) => { remove(): void };
    n.addListener = (event: string, l: (e: never) => void) => {
      if (event !== 'onListenAction') return add(event, l);
      action = l as typeof action;
      return { remove: () => (action = null) };
    };
    n.showListenNotice = jest.fn();
    n.endListenNotice = jest.fn();
    return { ...base, show: n.showListenNotice as jest.Mock, end: n.endListenNotice as jest.Mock, press: (a: 'pause' | 'resume' | 'mark' | 'stop') => action?.({ action: a }), hasAction: () => action !== null };
  }

  it('follows the session: listening, paused with the time heard, then gone', async () => {
    const { native, show, end, emit } = noticeNative();
    let t = 0;
    const s = await startNativeListen(native, () => {}, { title: 'Standup', noticeCaptions: false }, () => t);
    expect(show).toHaveBeenLastCalledWith('Standup', false, 0, '');
    emit({ type: 'segment', index: 0, text: 'secret plans', startMs: 0, endMs: 900, final: true });
    expect(show).toHaveBeenCalledTimes(1); // no captions unless asked for
    t = 5000;
    await s.pause();
    expect(show).toHaveBeenLastCalledWith('Standup', true, 3000, '');
    await s.resume();
    expect(show).toHaveBeenLastCalledWith('Standup', false, 3000, '');
    await s.stop();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('shows the latest sentence only when asked', async () => {
    const { native, show, emit } = noticeNative();
    await startNativeListen(native, () => {}, { noticeCaptions: true }, () => 0);
    emit({ type: 'segment', index: 0, text: 'hello there', startMs: 0, endMs: 900, final: true });
    expect(show).toHaveBeenLastCalledWith('Voxa is listening', false, 0, 'hello there');
  });

  it('passes the buttons on as actions, until the session stops', async () => {
    const { native, press, hasAction } = noticeNative();
    const events: ListenEvent[] = [];
    const s = await startNativeListen(native, (e) => events.push(e), {}, () => 0);
    press('mark');
    expect(events).toContainEqual({ type: 'action', action: 'mark' });
    await s.stop();
    expect(hasAction()).toBe(false);
  });

  it('removes the notification when listening cannot start', async () => {
    const { native, end } = noticeNative();
    (native.startListening as jest.Mock).mockRejectedValueOnce(new Error('The microphone is busy'));
    await expect(startNativeListen(native, () => {}, {}, () => 0)).rejects.toThrow('busy');
    expect(end).toHaveBeenCalled();
  });
});

describe('ListenRecorder', () => {
  function setup() {
    const files = memoryFiles();
    const store = new SessionStore(files);
    let push: (e: ListenEvent) => void = () => {};
    let elapsed = 0;
    const engine: SpeechEngine = {
      async start(onEvent) {
        push = onEvent;
        return {
          pause: async () => onEvent({ type: 'paused', reason: 'user' }),
          resume: async () => onEvent({ type: 'resumed' }),
          elapsedMs: () => elapsed,
          mark: () => ({ atMs: elapsed }),
          stop: async () => [seg('n0-0', 0, 1000)],
        };
      },
      labelSpeakers: () => ({ cancel() {}, done: Promise.resolve([{ startMs: 0, endMs: 1000, speaker: 7 }]) }),
    };
    const states: string[] = [];
    const rec = new ListenRecorder(engine, store, (s) => states.push(s.status), quickSummary, () => 1_700_000_000_000);
    return { rec, store, files, engine, emit: (e: ListenEvent) => push(e), setElapsed: (ms: number) => (elapsed = ms), states };
  }

  it('carries out the notification buttons, and stopping from there runs the after-stop work', async () => {
    const { rec, emit } = setup();
    const stopped: (string | null)[] = [];
    rec.onStopped((id) => stopped.push(id));
    await rec.start();
    const id = rec.current.sessionId;
    emit({ type: 'action', action: 'mark' });
    expect(rec.current.marks).toHaveLength(1);
    emit({ type: 'action', action: 'stop' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(stopped).toEqual([id]);
    expect(rec.current.status).toBe('idle');
  });

  it('sends mic levels to subscribers without changing the shared state', async () => {
    const { rec, emit, states } = setup();
    await rec.start();
    const levels: number[] = [];
    const off = rec.onLevel((rms) => levels.push(rms));
    const before = states.length;
    emit({ type: 'level', rms: 0.2 });
    emit({ type: 'level', rms: 0.3 });
    expect(levels).toEqual([0.2, 0.3]);
    // No state change, so no screen reading the session redraws for a level.
    expect(states.length).toBe(before);
    emit({ type: 'paused', reason: 'user' });
    expect(levels[levels.length - 1]).toBe(0);
    off();
    emit({ type: 'level', rms: 0.5 });
    expect(levels).not.toContain(0.5);
  });

  it('saves each sentence and mark as it happens, then the summary on stop', async () => {
    const { rec, store, emit, setElapsed } = setup();
    await rec.start();
    const id = rec.current.sessionId!;
    emit({ type: 'segment', segment: { ...seg('n0-0', 0, 1000), final: false, text: 'We' } });
    expect(rec.current.partial).toBe('We');
    emit({ type: 'segment', segment: seg('n0-0', 0, 1000) });
    setElapsed(1500);
    rec.mark();
    await new Promise((r) => setTimeout(r, 0));

    // Saved before stop: this is what survives a crash.
    const mid = await store.load(id);
    expect(mid?.status).toBe('recording');
    expect(mid?.segments).toHaveLength(1);
    expect(mid?.marks).toEqual([{ atMs: 1500 }]);

    expect(await rec.stop()).toBe(id);
    const saved = await store.load(id);
    expect(saved).toMatchObject({ status: 'saved', durationMs: 1500, hasAudio: true });
    expect(saved?.summary?.kind).toBe('quick');
    expect(rec.current.status).toBe('idle');
  });

  it('does not keep a session in which nothing was heard', async () => {
    const { rec, store, engine } = setup();
    engine.start = async () => ({ pause: async () => {}, resume: async () => {}, elapsedMs: () => 0, mark: () => ({ atMs: 0 }), stop: async () => [] });
    await rec.start();
    expect(await rec.stop()).toBeNull();
    expect(await store.list()).toEqual([]);
    expect(rec.current.error).toMatch(/Nothing was heard/);
  });

  it('labels speakers after the meeting and then deletes the audio', async () => {
    const { rec, store, files, engine } = setup();
    await rec.start();
    const id = rec.current.sessionId!;
    files.data.set(`sessions/${id}/audio.pcm`, 'pcm');
    await rec.stop();
    const count = await labelSession(engine, store, id, quickSummary).done;
    expect(count).toBe(1);
    const s = await store.load(id);
    expect(s?.segments[0].speaker).toBe(0);
    expect(s?.hasAudio).toBe(false);
    expect(files.data.has(`sessions/${id}/audio.pcm`)).toBe(false);
  });
});
