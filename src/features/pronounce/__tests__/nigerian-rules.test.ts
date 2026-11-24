import { detectLanguage, ENGLISH_PHONES, lexiconKeys, pronounce, toLexiconLines } from '../nigerian-rules';

const say = (word: string) => pronounce(word)?.phones.join(' ');

describe('language detection', () => {
  it.each([
    ['Olúwaṣeun', 'yoruba'],
    ['Ẹ̀kọ́', 'yoruba'],
    ['Adebayo', 'yoruba'],
    ['Gbenga', 'yoruba'],
    ['Chinedu', 'igbo'],
    ['Nnamdi', 'igbo'],
    ['Ngozi', 'igbo'],
    ['Ọbịọma', 'igbo'],
    ['Kpakpando', 'igbo'],
    ['Nwankwo', 'igbo'],
    ['Yusuf', 'hausa'],
    ['Abdullahi', 'hausa'],
    ['ƙasa', 'hausa'],
    ['Ɗanjuma', 'hausa'],
    ["Ta'a", 'hausa'],
    ['Babajide', 'yoruba'],
    ['Kelechi', 'igbo'],
    ['Mustapha', 'hausa'],
  ])('%s is %s', (word, language) => {
    expect(detectLanguage(word)?.language).toBe(language);
  });

  it('treats Nigerian-looking words with no clear signs as general Nigerian', () => {
    expect(detectLanguage('Okafor')).toEqual({ language: 'nigerian', confident: false });
  });

  it.each(['street', 'strength', 'WhatsApp2', 'quiz', 'Xbox', 'rhythm', 'night', ''])('rejects %p', (word) => {
    expect(detectLanguage(word)).toBeNull();
    expect(pronounce(word)).toBeNull();
  });
});

describe('pronunciation', () => {
  it.each([
    // Yoruba: ṣ = sh, ẹ/ọ are open vowels, a high tone takes the stress, p is kp
    ['Olúwaṣeun', 'o l ˈ u w ɑ ʃ e u n'],
    ['Ẹ̀kọ́', 'ɛ k ˈ ɔ'],
    ['Pẹ́lú', 'k p ˈ ɛ l u'],
    ['Adebayo', 'ɑ d e b ˈ ɑ j o'],
    ['Gbenga', 'ɡ b ˈ e n ɡ ɑ'],
    // Igbo: ch, nw, kp, ị/ụ, initial ng, doubled consonants said once
    ['Chinedu', 't ʃ i n ˈ e d u'],
    ['Nnamdi', 'n ˈ ɑ m d i'],
    ['Ngozi', 'ŋ ɡ ˈ o z i'],
    ['Ọbịọma', 'ɔ b ɪ ˈ ɔ m ɑ'],
    ['Nwankwo', 'ŋ w ˈ ɑ n k w o'],
    ['Kpakpando', 'k p ɑ k p ˈ ɑ n d o'],
    // Hausa: ƙ ɗ have no English sound, so k d; silent final h; apostrophe is a glottal stop
    ['Yusuf', 'j ˈ u s u f'],
    ['ƙasa', 'k ˈ ɑ s ɑ'],
    ['Ɗanjuma', 'd ɑ n d ʒ ˈ u m ɑ'],
    ['Fatimah', 'f ɑ t ˈ i m ɑ'],
    ["Ta'a", 't ˈ ɑ ʔ ɑ'],
    ['Abuja', 'ɑ b ˈ u d ʒ ɑ'],
    ['Maiduguri', 'm ɑ i d u ɡ ˈ u ɾ i'],
  ])('%s → %s', (word, phones) => {
    expect(say(word)).toBe(phones);
  });

  it('reads a doubled vowel as one long vowel', () => {
    expect(pronounce('Daada', 'hausa')?.phones).toEqual(['d', 'ˈ', 'ɑ', 'ː', 'd', 'ɑ']);
  });

  it('can be forced to a language when the caller knows it', () => {
    expect(pronounce('Ope', 'yoruba')?.phones.join(' ')).toBe('ˈ o k p e');
    expect(pronounce('Ope', 'igbo')?.phones.join(' ')).toBe('ˈ o p e');
  });

  it('only uses sounds the English-trained voice knows', () => {
    const words = ['Olúwaṣeun', 'Ẹ̀kọ́', 'Chinedu', 'Ngozi', 'Ọbịọma', 'Nwankwo', 'Yusuf', 'ƙasa', 'Ɗanjuma', "Ta'a", 'Ƴar', 'Ṅ'];
    for (const w of words) {
      for (const p of pronounce(w, 'nigerian')?.phones ?? []) expect(ENGLISH_PHONES).toContain(p);
    }
  });

  it('puts exactly one stress mark before a vowel', () => {
    for (const w of ['Olúwaṣeun', 'Chinedu', 'Yusuf', 'Abuja', 'Eko']) {
      const p = pronounce(w)!.phones;
      expect(p.filter((x) => x === 'ˈ')).toHaveLength(1);
      expect('ɑeɛiɪoɔuʊ').toContain(p[p.indexOf('ˈ') + 1]);
    }
  });
});

describe('lexicon output', () => {
  it('writes the word as typed and without accents', () => {
    expect(lexiconKeys('Olúwaṣeun')).toEqual(['olúwaṣeun', 'oluwaseun']);
    expect(lexiconKeys('Chinedu')).toEqual(['chinedu']);
    expect(lexiconKeys('Ɗanjuma')).toEqual(['ɗanjuma', 'danjuma']);
  });

  it('uses the sherpa-onnx "word || phones" format', () => {
    expect(toLexiconLines(pronounce('Yusuf')!)).toEqual(['yusuf || j ˈ u s u f']);
  });
});
