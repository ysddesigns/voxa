import { VoxaEngine, type NativeSpeakEvent } from '../../../modules/voxa-engine';
import { pronunciationHints } from '@/features/pronounce/hints';
import { packBytes, type Pack } from '@/features/packs/catalogue';
import { catalogueVoices, packService } from '@/features/packs/packs';
import { verdictMessage } from '@/features/packs/rules';
import { createMockEngines } from '../mock';
import type { Engines, ListenEvent, ListenOptions, SpeakEvent, SpeakHandle, Voice } from '../types';
import { nativeLabelSpeakers, startNativeListen } from './listen';

/**
 * On-device engines backed by modules/voxa-engine (sherpa-onnx). Android only for now:
 * voice = Piper LJSpeech medium (chosen in Phase 0), speech = streaming Zipformer 20M. scan = ML Kit Latin (bundled), summary = quick summary in TypeScript.
 */

const VOICE_PREFIX = 'device-';
/** Ids saved by builds that used the Kitten voice still map to speaker 0. */
const OLD_PREFIX = 'kitten-';
/** Downloaded voices: "pack-<pack id>". */
const PACK_PREFIX = 'pack-';

/** The voice pack a voice id belongs to, or "" for a built-in voice. */
export function packIdOf(voiceId: string): string {
  return voiceId.startsWith(PACK_PREFIX) ? voiceId.slice(PACK_PREFIX.length) : '';
}

export function packVoice(pack: Pack, installed: boolean): Voice {
  return {
    id: `${PACK_PREFIX}${pack.id}`,
    name: pack.name,
    tags: pack.tags,
    sizeMB: Math.round(packBytes(pack) / (1024 * 1024)),
    variant: 'full',
    installed,
  };
}

export { tidyTranscript } from './text';

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
  // Builds from before voice packs (no installPack) take speak/loadVoice without the voice argument.
  const packsBuild = !!native.installPack;
  const speakers = new Map<number, (e: NativeSpeakEvent) => void>();
  native.addListener('onSpeak', (e) => speakers.get(e.id)?.(e));
  let nextId = 1;
  let currentId = 0;

  cached = {
    voice: {
      async listVoices() {
        // Warm up the built-in voice in the background (a few seconds); the list does not wait.
        (packsBuild ? native.loadVoice('') : (native.loadVoice as unknown as () => Promise<unknown>)()).catch(() => {});
        const installed = packService?.installed() ?? new Set<string>();
        const downloadable = packService ? catalogueVoices() : [];
        return [...deviceVoices(1), ...downloadable.map((p) => packVoice(p, installed.has(p.id)))];
      },

      downloadVoice(id, onProgress) {
        const packId = packIdOf(id);
        // Built-in voices ship inside the app.
        if (!packId) return { cancel() {}, done: Promise.resolve() };
        const pack = catalogueVoices().find((p) => p.id === packId);
        if (!pack || !packService) return { cancel() {}, done: Promise.reject(new Error('This voice is not available to download')) };
        const verdict = packService.check(pack, false);
        if (!verdict.ok) return { cancel() {}, done: Promise.reject(new Error(verdictMessage(verdict) ?? 'Cannot download now')) };
        return packService.install(pack, onProgress);
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
        const rate = options.rate ?? 1;
        native.setOutput?.(options.output ?? 'room');
        if (packsBuild) native.speak(id, text, speakerId(options.voiceId), rate, overrides, fallbacks, packIdOf(options.voiceId));
        else (native.speak as unknown as (...a: unknown[]) => void)(id, text, speakerId(options.voiceId), rate, overrides, fallbacks);
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
      start: (onEvent: (e: ListenEvent) => void, options?: ListenOptions) => startNativeListen(native, onEvent, options),
      ...(native.labelSpeakers
        ? { labelSpeakers: (audioPath: string, onProgress?: (f: number) => void) => nativeLabelSpeakers(native, audioPath, onProgress) }
        : {}),
    },

    // Builds from before ML Kit use the mock scanner.
    scan: native.recognizeText
      ? {
          async recognize(uri: string) {
            const lines = await native.recognizeText!(uri);
            return lines.map((l) => ({ text: l.text, confidence: l.confidence, unsureWords: l.unsureWords, paragraph: l.block }));
          },
        }
      : mock.scan,
    summary: mock.summary,
  };
  return cached;
}

export const nativeBenchmark = VoxaEngine ? () => VoxaEngine!.benchmark() : null;
