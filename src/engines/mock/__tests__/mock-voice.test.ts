import { createMockEngines } from '../index';
import { matchesVoice } from '@/features/voices/voices-store';
import type { SpeakEvent } from '../../types';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('mock voice engine', () => {
  it('speaks word by word at the requested speed', () => {
    const { voice } = createMockEngines();
    const events: SpeakEvent[] = [];
    voice.speak('one two three', { voiceId: 'lily', rate: 2 }, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(['start', 'word']);
    jest.advanceTimersByTime(187); // 375 ms / 2
    expect(events.filter((e) => e.type === 'word')).toHaveLength(2);
    jest.advanceTimersByTime(400);
    expect(events.at(-1)).toEqual({ type: 'end' });
  });

  it('stops without an end event', () => {
    const { voice } = createMockEngines();
    const events: SpeakEvent[] = [];
    const h = voice.speak('one two three', { voiceId: 'lily' }, (e) => events.push(e));
    h.stop();
    jest.advanceTimersByTime(5000);
    expect(events.some((e) => e.type === 'end')).toBe(false);
  });

  it('downloads a voice with progress, then lists it as installed', async () => {
    const { voice } = createMockEngines();
    const progress: number[] = [];
    const h = voice.downloadVoice('noah', (f) => progress.push(f));
    jest.advanceTimersByTime(4000);
    await h.done;
    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBeGreaterThan(5);
    const noah = (await voice.listVoices()).find((v) => v.id === 'noah');
    expect(noah?.installed).toBe(true);
  });

  it('can cancel a download', async () => {
    const { voice } = createMockEngines();
    const h = voice.downloadVoice('ada');
    jest.advanceTimersByTime(500);
    h.cancel();
    await expect(h.done).rejects.toThrow('cancelled');
    const ada = (await voice.listVoices()).find((v) => v.id === 'ada');
    expect(ada?.installed).toBe(false);
  });
});

describe('matchesVoice', () => {
  const lily = { id: 'lily', name: 'Lily', tags: ['Natural', 'Female'], sizeMB: 25, variant: 'lite' as const, installed: true };
  const noah = { id: 'noah', name: 'Noah', tags: ['Calm', 'Male'], sizeMB: 78, variant: 'full' as const, installed: false };
  it('filters by tag and download state', () => {
    expect(matchesVoice(lily, 'Female', '')).toBe(true);
    expect(matchesVoice(noah, 'Female', '')).toBe(false);
    expect(matchesVoice(noah, 'Downloaded', '')).toBe(false);
    expect(matchesVoice(noah, 'All', '')).toBe(true);
  });
  it('searches name and tags', () => {
    expect(matchesVoice(noah, 'All', 'calm')).toBe(true);
    expect(matchesVoice(lily, 'All', 'calm')).toBe(false);
  });
});
