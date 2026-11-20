import type { NativeListenEvent, NativeSpeakEvent } from '../../../modules/voxa-engine';

/**
 * A JavaScript stand-in for modules/voxa-engine that sends the same events, in the same
 * order, as VoxaEngineModule.kt. Used by the engine contract tests.
 */
export function createFakeNative() {
  const speakListeners = new Set<(e: NativeSpeakEvent) => void>();
  const listenListeners = new Set<(e: NativeListenEvent) => void>();
  let gen = 0;
  const emitSpeak = (e: NativeSpeakEvent) => speakListeners.forEach((l) => l(e));
  const emitListen = (e: NativeListenEvent) => listenListeners.forEach((l) => l(e));
  let listenTimers: ReturnType<typeof setTimeout>[] = [];

  return {
    async loadVoice() {
      return { sampleRate: 24000, numSpeakers: 2, loadMs: 1 };
    },
    speak(id: number, text: string) {
      const mine = ++gen;
      const live = () => gen === mine;
      const words = [...text.matchAll(/\S+/g)];
      setTimeout(() => {
        if (!live()) return;
        emitSpeak({ id, type: 'start' });
        words.forEach((m, i) =>
          setTimeout(() => {
            if (live()) emitSpeak({ id, type: 'word', index: i, charStart: m.index!, charEnd: m.index! + m[0].length });
          }, 100 * (i + 1)),
        );
        // Like the Kotlin module: "end" only for natural endings, never after a stop.
        setTimeout(() => live() && emitSpeak({ id, type: 'end' }), 100 * (words.length + 1));
      }, 0);
    },
    stopSpeaking() {
      gen++;
    },
    async requestMicPermission() {
      return { granted: true, status: 'granted' };
    },
    async startListening() {
      const say = (index: number, text: string, at: number) => {
        listenTimers.push(setTimeout(() => emitListen({ type: 'segment', index, text: text.split(' ')[0], startMs: at, endMs: at + 500, final: false }), at));
        listenTimers.push(setTimeout(() => emitListen({ type: 'segment', index, text, startMs: at, endMs: at + 1000, final: true }), at + 1000));
      };
      say(0, 'HELLO THERE', 500);
      say(1, 'I AM LISTENING', 3000);
      return { loadMs: 1 };
    },
    async stopListening() {
      listenTimers.forEach(clearTimeout);
      listenTimers = [];
    },
    async benchmark() {
      throw new Error('not in the fake');
    },
    release() {},
    addListener(event: 'onSpeak' | 'onListen', listener: (e: never) => void) {
      const set = (event === 'onSpeak' ? speakListeners : listenListeners) as Set<(e: unknown) => void>;
      set.add(listener as (e: unknown) => void);
      return { remove: () => set.delete(listener as (e: unknown) => void) };
    },
  };
}
