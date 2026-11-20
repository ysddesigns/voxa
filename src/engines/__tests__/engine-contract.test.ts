import { createMockEngines } from '../mock';
import { getNativeEngines } from '../native';
import type { Engines, SpeakEvent } from '../types';

/**
 * Engine contract (ADR 0001): every implementation must behave the same through
 * src/engines/types.ts. The native engines run against a fake of the Kotlin module.
 */

jest.mock('../../../modules/voxa-engine', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  VoxaEngine: require('../testing/fake-native').createFakeNative(),
}));

const TEXT = 'Hello there. How are you today?';
const TOKENS = [...TEXT.matchAll(/\S+/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));

const implementations: [string, () => Engines][] = [
  ['mock', () => createMockEngines()],
  ['native', () => getNativeEngines()!],
];

describe.each(implementations)('%s engines', (_name, make) => {
  let engines: Engines;

  beforeEach(() => {
    jest.useFakeTimers();
    engines = make();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = (ms: number) => jest.advanceTimersByTimeAsync(ms);

  describe('voice', () => {
    it('lists installed voices with unique ids', async () => {
      const voices = await engines.voice.listVoices();
      const installed = voices.filter((v) => v.installed);
      expect(installed.length).toBeGreaterThan(0);
      expect(new Set(voices.map((v) => v.id)).size).toBe(voices.length);
    });

    it('speaks: start, every word in order with its characters, then end', async () => {
      const [voice] = (await engines.voice.listVoices()).filter((v) => v.installed);
      const events: SpeakEvent[] = [];
      const handle = engines.voice.speak(TEXT, { voiceId: voice.id }, (e) => events.push(e));
      await run(10_000);
      await handle.done;

      expect(events[0]).toEqual({ type: 'start' });
      expect(events[events.length - 1]).toEqual({ type: 'end' });
      const words = events.filter((e) => e.type === 'word');
      expect(words.map((w) => w.index)).toEqual(TOKENS.map((_, i) => i));
      words.forEach((w, i) => {
        expect(TEXT.slice(w.charStart, w.charEnd)).toBe(TEXT.slice(TOKENS[i].start, TOKENS[i].end));
      });
    });

    it('stop ends the handle and no more words arrive', async () => {
      const [voice] = (await engines.voice.listVoices()).filter((v) => v.installed);
      const events: SpeakEvent[] = [];
      const handle = engines.voice.speak(TEXT, { voiceId: voice.id }, (e) => events.push(e));
      await run(150);
      handle.stop();
      const count = events.filter((e) => e.type === 'word').length;
      await run(10_000);
      await expect(handle.done).resolves.toBeUndefined();
      expect(events.filter((e) => e.type === 'word').length).toBe(count);
      expect(count).toBeLessThan(TOKENS.length);
    });

    it('a new speech is not cut off by stopping an older one', async () => {
      const [voice] = (await engines.voice.listVoices()).filter((v) => v.installed);
      const old = engines.voice.speak(TEXT, { voiceId: voice.id });
      const events: SpeakEvent[] = [];
      const current = engines.voice.speak(TEXT, { voiceId: voice.id }, (e) => events.push(e));
      old.stop();
      await run(10_000);
      await current.done;
      expect(events.filter((e) => e.type === 'word')).toHaveLength(TOKENS.length);
    });
  });

  describe('speech', () => {
    it('streams segments and returns the final ones, in order, on stop', async () => {
      const seen: boolean[] = [];
      const session = await engines.speech.start((e) => {
        if (e.type === 'segment') seen.push(e.segment.final);
      });
      await run(7_000);
      const segments = await session.stop();

      expect(seen).toContain(false);
      expect(seen).toContain(true);
      expect(segments.length).toBeGreaterThan(0);
      expect(segments.every((s) => s.final && s.text.trim().length > 0)).toBe(true);
      const starts = segments.map((s) => s.startMs);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });
  });
});
