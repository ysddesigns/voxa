import { VoxaEngine, type NativeListenEvent, type NativeSpeakEvent } from '../../../modules/voxa-engine';
import { pronunciationHints } from '@/features/pronounce/hints';
import { createMockEngines } from '../mock';
import type { Engines, ListenEvent, ListenSession, SpeakEvent, SpeakHandle, TranscriptSegment, Voice } from '../types';

/**
 * On-device engines backed by modules/voxa-engine (sherpa-onnx). Android only for now:
 * voice = Piper LJSpeech medium (chosen in Phase 0), speech = streaming Zipformer 20M. Scan and summary still use the mocks.
 */

const VOICE_PREFIX = 'device-';
/** Ids saved by builds that used the Kitten voice still map to speaker 0. */
const OLD_PREFIX = 'kitten-';

/**
 * The Zipformer model writes in capitals ("HELLO THERE"); make it read like a sentence.
 * Finished sentences already come punctuated and cased by the native module: leave those alone.
 */
export function tidyTranscript(text: string): string {
  if (text !== text.toUpperCase()) return text;
  const lower = text.toLowerCase().replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|ve|d)\b/g, "I'$1");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** The voices built into the app: one per speaker in the on-device model. */
export function deviceVoices(count: number): Voice[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${VOICE_PREFIX}${i}`,
    name: count === 1 ? 'Standard' : `Standard ${i + 1}`,
    tags: ['Built-in', 'English US'],
    sizeMB: 19,
    variant: 'lite' as const,
    installed: true,
  }));
}

export function speakerId(voiceId: string): number {
  const prefix = [VOICE_PREFIX, OLD_PREFIX].find((p) => voiceId.startsWith(p));
  const n = Number(prefix ? voiceId.slice(prefix.length) : NaN);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

let cached: Engines | null | undefined;

/** Returns the on-device engines, or null when the native module is not in this build. */
export function getNativeEngines(): Engines | null {
  if (cached !== undefined) return cached;
  const native = VoxaEngine;
  if (!native) return (cached = null);

  const mock = createMockEngines();
  const speakers = new Map<number, (e: NativeSpeakEvent) => void>();
  native.addListener('onSpeak', (e) => speakers.get(e.id)?.(e));
  let nextId = 1;
  let currentId = 0;

  cached = {
    voice: {
      async listVoices() {
        const { numSpeakers } = await native.loadVoice();
        return deviceVoices(numSpeakers);
      },

      downloadVoice(id) {
        // Built-in voices ship inside the app; real voice packs come with the download service.
        const done = id.startsWith(VOICE_PREFIX) || id.startsWith(OLD_PREFIX) ? Promise.resolve() : Promise.reject(new Error('Voice packs are not available yet'));
        return { cancel() {}, done };
      },

      speak(text, options, onEvent?: (e: SpeakEvent) => void): SpeakHandle {
        const id = nextId++;
        currentId = id;
        let resolve: () => void = () => {};
        const done = new Promise<void>((r) => (resolve = r));
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          speakers.delete(id);
          resolve();
        };
        speakers.set(id, (e) => {
          switch (e.type) {
            case 'start':
              onEvent?.({ type: 'start' });
              break;
            case 'word':
              onEvent?.({ type: 'word', index: e.index, charStart: e.charStart, charEnd: e.charEnd });
              break;
            case 'end':
              onEvent?.({ type: 'end' });
              finish();
              break;
            case 'error':
              onEvent?.({ type: 'error', message: e.message });
              finish();
              break;
            case 'skipped':
              if (__DEV__) console.info('Voxa voice skipped words it cannot pronounce:', e.words.join(', '));
              break;
          }
        });
        // Yoruba, Igbo and Hausa words get pronunciations from the spelling rules.
        const { overrides, fallbacks } = pronunciationHints(text);
        native.speak(id, text, speakerId(options.voiceId), options.rate ?? 1, overrides, fallbacks);
        return {
          stop() {
            if (finished) return;
            // Only stop the audio if this is still the newest speech.
            if (currentId === id) native.stopSpeaking();
            finish();
          },
          done,
        };
      },
    },

    speech: {
      async start(onEvent: (e: ListenEvent) => void): Promise<ListenSession> {
        const perm = await native.requestMicPermission();
        if (!perm.granted) throw new Error('Voxa needs the microphone to listen.');
        const startedAt = Date.now();
        const finals = new Map<number, TranscriptSegment>();
        let paused = false;
        const sub = native.addListener('onListen', (e: NativeListenEvent) => {
          if (paused) return;
          if (e.type === 'level') onEvent({ type: 'level', rms: e.rms });
          else if (e.type === 'error') onEvent({ type: 'error', message: e.message });
          else {
            const segment: TranscriptSegment = {
              id: `n${e.index}`,
              speaker: null,
              text: tidyTranscript(e.text),
              startMs: e.startMs,
              endMs: e.endMs,
              final: e.final,
            };
            if (e.final) finals.set(e.index, segment);
            onEvent({ type: 'segment', segment });
          }
        });
        try {
          await native.startListening();
        } catch (err) {
          sub.remove();
          throw err;
        }
        return {
          // Spike: pause drops results but keeps the mic open. Real pause/resume comes with the Live screen.
          pause() {
            paused = true;
            onEvent({ type: 'paused', reason: 'user' });
          },
          resume() {
            paused = false;
            onEvent({ type: 'resumed' });
          },
          mark() {
            return { atMs: Date.now() - startedAt };
          },
          async stop() {
            await native.stopListening();
            sub.remove();
            return [...finals.values()].sort((a, b) => a.startMs - b.startMs);
          },
        };
      },
    },

    scan: mock.scan,
    summary: mock.summary,
  };
  return cached;
}

export const nativeBenchmark = VoxaEngine ? () => VoxaEngine!.benchmark() : null;
