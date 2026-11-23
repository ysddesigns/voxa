import { DEFAULT_TUNING, ORIGINAL_TUNING, VARIANTS, describe as describeTuning, pickBest, sameTuning } from '../tuning';

describe('VARIANTS', () => {
  it('starts with the original settings, includes the default, and has unique ids', () => {
    expect(VARIANTS[0].tuning).toEqual(ORIGINAL_TUNING);
    expect(VARIANTS.some((v) => sameTuning(v.tuning, DEFAULT_TUNING))).toBe(true);
    expect(new Set(VARIANTS.map((v) => v.id)).size).toBe(VARIANTS.length);
  });

  it('keeps every value inside what the native side accepts', () => {
    for (const v of VARIANTS) {
      expect(v.tuning.vadThreshold).toBeGreaterThanOrEqual(0.1);
      expect(v.tuning.vadThreshold).toBeLessThanOrEqual(0.9);
      expect(v.tuning.pauseMs).toBeGreaterThanOrEqual(300);
      expect(v.tuning.pauseMs).toBeLessThanOrEqual(3000);
    }
  });
});

describe('describe', () => {
  it('says what each setting does', () => {
    expect(describeTuning(ORIGINAL_TUNING)).toBe('greedy · no boost · voice gate 0.5, 0.8 s pause');
    expect(describeTuning({ ...DEFAULT_TUNING, gate: false })).toBe('beam search · volume boost · custom words · no voice gate');
    expect(describeTuning({ ...DEFAULT_TUNING, words: false, gate: false })).toBe('beam search · volume boost · no voice gate');
  });
});

describe('sameTuning', () => {
  it('compares every field', () => {
    expect(sameTuning(DEFAULT_TUNING, { ...DEFAULT_TUNING })).toBe(true);
    expect(sameTuning(DEFAULT_TUNING, { ...DEFAULT_TUNING, pauseMs: 1200 })).toBe(false);
    expect(sameTuning(DEFAULT_TUNING, null)).toBe(false);
    expect(sameTuning(DEFAULT_TUNING, { ...DEFAULT_TUNING, words: false })).toBe(false);
    expect(sameTuning(DEFAULT_TUNING, { ...DEFAULT_TUNING, words: undefined })).toBe(true);
  });
});

describe('pickBest', () => {
  it('picks the lowest word error', () => {
    const rows = [
      { id: 'a', wer: 0.3, rtf: 0.1, refWords: 50 },
      { id: 'b', wer: 0.2, rtf: 0.2, refWords: 50 },
    ];
    expect(pickBest(rows)?.id).toBe('b');
  });

  it('prefers the faster one when two are within one word', () => {
    const rows = [
      { id: 'slow', wer: 0.2, rtf: 0.3, refWords: 50 },
      { id: 'fast', wer: 0.22, rtf: 0.1, refWords: 50 },
    ];
    expect(pickBest(rows)?.id).toBe('fast');
  });

  it('ignores failed runs and returns null when nothing ran', () => {
    expect(pickBest<{ id: string; wer?: number; rtf?: number; refWords?: number }>([{ id: 'x' }, { id: 'y', wer: 0.5, rtf: 0.1, refWords: 10 }])).toMatchObject({ id: 'y' });
    expect(pickBest<{ id: string; wer?: number }>([{ id: 'x' }])).toBeNull();
  });
});
