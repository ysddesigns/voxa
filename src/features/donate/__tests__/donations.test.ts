import { memoryFiles } from '@/storage/files';
import { words } from '@/features/asr-compare/compare';
import { DonationStore, nextPrompt, parseTakes, randomSpeaker, takePath, totalMs } from '../donations';
import { PROMPTS } from '../prompts';

const store = (initial: Record<string, string> = {}) => {
  const files = memoryFiles(initial);
  return { files, store: new DonationStore(files, () => 'vx-test') };
};

describe('prompts', () => {
  it('has unique ids and no digits, which the training scripts would drop', () => {
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(PROMPTS.length);
    expect(PROMPTS.filter((p) => /\d/.test(p.text))).toEqual([]);
    expect(PROMPTS.length).toBeGreaterThanOrEqual(120);
  });

  it('keeps every line short enough to read in one breath', () => {
    expect(PROMPTS.filter((p) => words(p.text).length > 14)).toEqual([]);
  });
});

describe('DonationStore', () => {
  it('keeps one random speaker id per phone', async () => {
    const { store: s, files } = store();
    expect(await s.speaker()).toBe('vx-test');
    expect(files.data.get('donate/speaker.txt')).toBe('vx-test');
    expect(randomSpeaker(() => 0.5)).toMatch(/^vx-[0-9a-z]{10}$/);
  });

  it('writes recordings in the training jsonl format and replaces a re-recorded prompt', async () => {
    const { store: s, files } = store();
    await s.save(PROMPTS[0], 3200);
    await s.save(PROMPTS[1], 2100);
    const takes = await s.save(PROMPTS[0], 2900.4);
    expect(takes).toHaveLength(2);
    const lines = files.data.get('donate/recordings.jsonl')!.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toContainEqual({ id: 'vx-test-en-001', audio: 'audio/en-001.wav', text: PROMPTS[0].text, speaker: 'vx-test', language: 'en', recordedMs: 2900 });
    expect(totalMs(takes)).toBe(5000);
  });

  it('discards a recording with its audio, and deletes everything', async () => {
    const { store: s, files } = store({ [takePath('en-001')]: 'wav', [takePath('en-002')]: 'wav' });
    await s.save(PROMPTS[0], 3000);
    await s.save(PROMPTS[1], 3000);
    expect((await s.discard('en-001')).map((t) => t.audio)).toEqual(['audio/en-002.wav']);
    expect(files.data.has(takePath('en-001'))).toBe(false);
    await s.agree(new Date('2026-11-23T10:00:00Z'));
    expect(await s.consent()).toEqual({ version: 1, at: '2026-11-23T10:00:00.000Z' });
    await s.deleteAll();
    expect([...files.data.keys()]).toEqual([]);
    expect(await s.consent()).toBeNull();
  });

  it('skips broken lines and picks the next unrecorded, unskipped prompt', () => {
    const takes = parseTakes('{"audio":"audio/en-001.wav","text":"a","speaker":"s"}\n{"audio":"audio/en-0');
    expect(takes).toHaveLength(1);
    expect(nextPrompt(PROMPTS, takes)?.id).toBe('en-002');
    expect(nextPrompt(PROMPTS, takes, new Set(['en-002']))?.id).toBe('en-003');
    expect(nextPrompt(PROMPTS.slice(0, 1), takes)).toBeNull();
  });
});
