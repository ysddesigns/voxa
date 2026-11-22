import { CANDIDATES, PASSAGE, PASSAGE_NAMES, PASSAGES, score, words } from '../compare';
import { DEV_CATALOGUE, LISTEN_PACK } from '@/features/packs/catalogue';
import shared from '../../../../training/asr/normalize_cases.json';

describe('words', () => {
  it('matches the training scripts on the shared cases (training/asr/normalize_cases.json)', () => {
    for (const c of shared.cases) expect(words(c.text)).toEqual(c.words);
  });

  it('lower-cases and drops punctuation', () => {
    expect(words('Good morning, everyone. I’m Yusuf!')).toEqual(['good', 'morning', 'everyone', "i'm", 'yusuf']);
  });

  it('drops tone marks and dots under letters, and keeps Hausa hooked letters as plain ones', () => {
    expect(words('Ẹ káàárọ̀ gbogbo yín')).toEqual(['e', 'kaaaro', 'gbogbo', 'yin']);
    expect(words('ɗari ƙarfe')).toEqual(['dari', 'karfe']);
    expect(words('n’izu')).toEqual(["n'izu"]);
  });

  it('splits hyphens and ignores empty text', () => {
    expect(words('follow-up')).toEqual(['follow', 'up']);
    expect(words('  ... ')).toEqual([]);
  });
});

describe('score', () => {
  it('is zero for a perfect transcript, whatever the case and punctuation', () => {
    expect(score('Good morning everyone.', 'GOOD MORNING EVERYONE').wer).toBe(0);
  });

  it('counts substitutions, deletions and insertions', () => {
    // 4 reference words: "morning" substituted, "everyone" deleted, "now" inserted = 3 errors.
    const s = score('good morning everyone today', 'good evening today now');
    expect(s.errors).toBe(3);
    expect(s.refWords).toBe(4);
    expect(s.wer).toBeCloseTo(0.75);
  });

  it('scores everything wrong when nothing was heard', () => {
    expect(score('one two three', '').wer).toBe(1);
  });

  it('keeps name errors out of the without-names rate', () => {
    // "Chinedu" misheard, everything else right.
    const s = score('Chinedu will share the report', 'she knew do will share the report', ['chinedu']);
    expect(s.werWithoutNames).toBe(0);
    expect(s.wer).toBeGreaterThan(0);
  });

  it('does not let a garbled stretch next to a name hide its ordinary-word errors', () => {
    // "chinedu will share" all wrong: the name is excused, "will" and "share" are not.
    const s = score('Chinedu will share the report', 'ulus touch in a doub the report', ['chinedu']);
    expect(s.werWithoutNames).toBeCloseTo(2 / 4);
  });

  it('counts ordinary-word errors in the without-names rate', () => {
    const s = score('Chinedu will share the report', 'Chinedu will send the report', ['chinedu']);
    expect(s.werWithoutNames).toBeCloseTo(1 / 4);
  });
});

describe('the passage and candidates', () => {
  it('contains every name it scores apart, in every language', () => {
    expect(PASSAGES[0].text).toBe(PASSAGE);
    for (const p of PASSAGES) {
      const w = words(p.text);
      for (const name of PASSAGE_NAMES) expect(w).toContain(name);
    }
  });

  it('starts with the model in use and lists only catalogue packs', () => {
    expect(CANDIDATES[0].id).toBe(LISTEN_PACK);
    const ids = new Set(DEV_CATALOGUE.packs.map((p) => p.id));
    for (const c of CANDIDATES) expect(ids.has(c.id)).toBe(true);
    for (const c of CANDIDATES.slice(1)) expect(DEV_CATALOGUE.packs.find((p) => p.id === c.id)?.kind).toBe('lab');
  });
});
