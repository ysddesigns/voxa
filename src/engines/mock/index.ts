import { quickSummary } from '@/features/summary/quick-summary';
import type {
  Engines,
  ListenEvent,
  ListenSession,
  SpeakEvent,
  SpeakHandle,
  TranscriptSegment,
  Voice,
} from '../types';

/** Mock engines: realistic timing and data so every screen can be built before the native module exists. */

const VOICES: Voice[] = [
  { id: 'lily', name: 'Lily', tags: ['Natural', 'Female', 'English US'], sizeMB: 25, variant: 'lite', installed: true },
  { id: 'james', name: 'James', tags: ['Deep', 'Male', 'English UK'], sizeMB: 25, variant: 'lite', installed: true },
  { id: 'sophie', name: 'Sophie', tags: ['Warm', 'Female', 'English AU'], sizeMB: 25, variant: 'lite', installed: true },
  { id: 'noah', name: 'Noah', tags: ['Calm', 'Male'], sizeMB: 78, variant: 'full', installed: false },
];

const SCRIPT: { speaker: number; text: string }[] = [
  { speaker: 0, text: 'Thanks everyone. The Q3 plan locks on Friday, so design starts on Monday.' },
  { speaker: 1, text: 'Budget is still the open question. I will draft the budget numbers by Friday.' },
  { speaker: 2, text: 'Timeline worries me more than cost. Can you share the design brief on Monday?' },
  { speaker: 3, text: "I'll book the client review for next week." },
];

export function createMockEngines(): Engines {
  return {
    voice: {
      async listVoices() {
        return VOICES.map((v) => ({ ...v }));
      },
      speak(text, _options, onEvent?: (e: SpeakEvent) => void): SpeakHandle {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tokens = [...text.matchAll(/\S+/g)];
        const done = new Promise<void>((resolve) => {
          onEvent?.({ type: 'start' });
          let i = 0;
          const next = () => {
            if (stopped || i >= tokens.length) {
              onEvent?.({ type: 'end' });
              resolve();
              return;
            }
            const m = tokens[i];
            const start = m.index ?? 0;
            onEvent?.({ type: 'word', index: i, charStart: start, charEnd: start + m[0].length });
            i++;
            timer = setTimeout(next, 260);
          };
          next();
        });
        return {
          stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
          },
          done,
        };
      },
    },

    speech: {
      async start(onEvent: (e: ListenEvent) => void): Promise<ListenSession> {
        const startedAt = Date.now();
        const segments: TranscriptSegment[] = [];
        let paused = false;
        let line = 0;
        const levelTimer = setInterval(() => {
          if (!paused) onEvent({ type: 'level', rms: 0.2 + Math.random() * 0.6 });
        }, 100);
        const lineTimer = setInterval(() => {
          if (paused || line >= SCRIPT.length) return;
          const { speaker, text } = SCRIPT[line];
          const seg: TranscriptSegment = {
            id: `s${line}`,
            speaker,
            text,
            startMs: Date.now() - startedAt,
            endMs: Date.now() - startedAt + 2500,
            final: true,
          };
          onEvent({ type: 'segment', segment: { ...seg, final: false, text: text.split(' ').slice(0, 4).join(' ') } });
          onEvent({ type: 'segment', segment: seg });
          segments.push(seg);
          line++;
        }, 3000);
        return {
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
            clearInterval(levelTimer);
            clearInterval(lineTimer);
            return segments;
          },
        };
      },
    },

    scan: {
      async recognize() {
        return [
          { text: 'Weekly sync — Agenda', confidence: 0.98, unsureWords: [] },
          { text: '1. Q3 plan and budget numbers', confidence: 0.96, unsureWords: [] },
          { text: '3. Client review moved to Thursdav', confidence: 0.71, unsureWords: ['Thursdav'] },
        ];
      },
    },

    summary: {
      quick: (segments) => quickSummary(segments),
    },
  };
}
