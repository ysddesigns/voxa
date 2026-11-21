import type { ListenAction, NativeListenEvent, NativeSpeakerTurn } from '../../../modules/voxa-engine';
import type { ListenEvent, ListenOptions, ListenSession, SpeakerTurn, TranscriptSegment } from '../types';
import { tidyTranscript } from './text';

/** The parts of the native module a listening session uses. */
export type ListenNative = {
  requestMicPermission(): Promise<{ granted: boolean }>;
  startListening(audioPath: string): Promise<unknown>;
  stopListening(): Promise<{ heardMs: number } | null | void>;
  labelSpeakers?(audioPath: string): Promise<NativeSpeakerTurn[]>;
  cancelLabel?(): void;
  showListenNotice?(title: string, paused: boolean, elapsedMs: number, caption: string): void;
  endListenNotice?(): void;
  addListener(event: 'onListen', listener: (e: NativeListenEvent) => void): { remove(): void };
  addListener(event: 'onListenAction', listener: (e: { action: ListenAction }) => void): { remove(): void };
  addListener(event: 'onLabel', listener: (e: { fraction: number }) => void): { remove(): void };
};

/**
 * One Listen session over the native recognizer.
 *
 * Pause really stops the microphone (and the "listening" notice); resume starts a new native run.
 * Each run's times start at zero, so segments are shifted by the audio heard in earlier runs, and
 * get ids "n<run>-<index>" so they stay unique across pauses.
 *
 * The Listen notification (builds with showListenNotice) follows the session: it shows listening or
 * paused with the time, and its buttons arrive as "action" events for the recorder to carry out.
 */
export async function startNativeListen(
  native: ListenNative,
  onEvent: (e: ListenEvent) => void,
  options: ListenOptions = {},
  now: () => number = Date.now,
): Promise<ListenSession> {
  const perm = await native.requestMicPermission();
  if (!perm.granted) throw new Error('Voxa needs the microphone to listen.');

  // Builds from before speaker labels take no argument and cannot record.
  const canRecord = !!native.labelSpeakers;
  const audioPath = canRecord ? (options.audioPath ?? '') : '';
  const begin = () => (canRecord ? native.startListening(audioPath) : (native.startListening as unknown as () => Promise<unknown>)());

  const finals = new Map<string, TranscriptSegment>();
  let run = 0;
  let offsetMs = 0;
  let runStartedAt = now();
  let paused = false;
  let stopped = false;
  let busy: Promise<void> = Promise.resolve();
  let caption = '';
  const title = options.title || 'Voxa is listening';

  const notice = () => {
    try {
      native.showListenNotice?.(title, paused, elapsedMs(), options.noticeCaptions ? caption : '');
    } catch {
      // The notification is a convenience; listening goes on without it.
    }
  };
  const endNotice = () => {
    try {
      native.endListenNotice?.();
    } catch {
      // As above.
    }
  };
  const actions = native.showListenNotice ? native.addListener('onListenAction', (e) => onEvent({ type: 'action', action: e.action })) : null;

  const sub = native.addListener('onListen', (e: NativeListenEvent) => {
    if (e.type === 'level') {
      if (!paused) onEvent({ type: 'level', rms: e.rms });
    } else if (e.type === 'error') {
      onEvent({ type: 'error', message: e.message });
    } else {
      const segment: TranscriptSegment = {
        id: `n${run}-${e.index}`,
        speaker: null,
        text: tidyTranscript(e.text),
        startMs: offsetMs + e.startMs,
        endMs: offsetMs + e.endMs,
        final: e.final,
      };
      if (e.final) finals.set(segment.id, segment);
      onEvent({ type: 'segment', segment });
      if (e.final && options.noticeCaptions && segment.text.trim() && !paused) {
        caption = segment.text;
        notice();
      }
    }
  });

  try {
    await begin();
  } catch (err) {
    sub.remove();
    actions?.remove();
    endNotice();
    throw err;
  }

  /** Ends the current run; its last sentence arrives before this resolves. */
  const endRun = async () => {
    const heard = await native.stopListening();
    // Old builds do not report what they heard: fall back to the clock.
    offsetMs += heard && typeof heard.heardMs === 'number' ? heard.heardMs : now() - runStartedAt;
  };

  // Pause, resume and stop run one after another, even when tapped quickly.
  const queue = (step: () => Promise<void>) => {
    busy = busy.then(step, step);
    return busy;
  };

  const elapsedMs = () => (paused || stopped ? offsetMs : offsetMs + (now() - runStartedAt));
  notice();

  return {
    pause: () =>
      queue(async () => {
        if (paused || stopped) return;
        paused = true;
        await endRun();
        caption = '';
        notice();
        onEvent({ type: 'paused', reason: 'user' });
      }),
    resume: () =>
      queue(async () => {
        if (!paused || stopped) return;
        run++;
        runStartedAt = now();
        await begin();
        paused = false;
        notice();
        onEvent({ type: 'resumed' });
      }),
    elapsedMs,
    mark: () => ({ atMs: elapsedMs() }),
    async stop() {
      await queue(async () => {
        if (stopped) return;
        const wasPaused = paused;
        paused = true;
        if (!wasPaused) await endRun();
        stopped = true;
      });
      sub.remove();
      actions?.remove();
      endNotice();
      return [...finals.values()].sort((a, b) => a.startMs - b.startMs);
    },
  };
}

export function nativeLabelSpeakers(native: ListenNative, audioPath: string, onProgress?: (fraction: number) => void) {
  const label = native.labelSpeakers;
  if (!label) return { cancel() {}, done: Promise.reject<SpeakerTurn[]>(new Error('This build cannot label speakers')) };
  const sub = native.addListener('onLabel', (e) => onProgress?.(e.fraction));
  const done = label.call(native, audioPath).finally(() => sub.remove());
  return { cancel: () => native.cancelLabel?.(), done };
}
