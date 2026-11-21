import { hasNigerianMarks, pronunciationHints } from '../hints';

describe('pronunciation hints for the voice', () => {
  it('overrides English for words written with Nigerian letters, under both spellings', () => {
    const { overrides, fallbacks } = pronunciationHints('Ẹ kú àárọ̀, Olúwaṣeun!');
    expect(overrides['olúwaṣeun']).toBe('o l ˈ u w ɑ ʃ e u n');
    expect(overrides['oluwaseun']).toBe('o l ˈ u w ɑ ʃ e u n');
    expect(fallbacks['olúwaṣeun']).toBeUndefined();
  });

  it('only falls back for plain-letter words, so English words keep their English sound', () => {
    const { overrides, fallbacks } = pronunciationHints('Chinedu and Yusuf went to Abuja.');
    expect(Object.keys(overrides)).toHaveLength(0);
    expect(fallbacks['chinedu']).toBe('t ʃ i n ˈ e d u');
    expect(fallbacks['yusuf']).toBe('j ˈ u s u f');
    expect(fallbacks['abuja']).toBe('ɑ b ˈ u d ʒ ɑ');
  });

  it('ignores punctuation, quotes and hyphens around and inside words', () => {
    const { fallbacks } = pronunciationHints('"Ngozi," she said (Nnamdi-Chinedu).');
    expect(fallbacks['ngozi']).toBeDefined();
    expect(fallbacks['nnamdi']).toBeDefined();
    expect(fallbacks['chinedu']).toBeDefined();
  });

  it('sends nothing for words that do not look Nigerian', () => {
    expect(pronunciationHints('The street at night.')).toEqual({
      overrides: {},
      fallbacks: expect.not.objectContaining({ street: expect.anything(), night: expect.anything() }),
    });
  });

  it('spots Nigerian letters and tone marks', () => {
    expect(hasNigerianMarks('Olúwaṣeun')).toBe(true);
    expect(hasNigerianMarks('ƙasa')).toBe(true);
    expect(hasNigerianMarks('Chinedu')).toBe(false);
  });
});
