import { MAX_LENGTH, MAX_WORDS, addWords, cleanWords, splitWords } from '../custom-words';

jest.mock('../../../../modules/voxa-engine', () => ({ VoxaEngine: null }));

describe('splitWords', () => {
  it('splits on commas, semicolons and new lines but keeps two-word names', () => {
    expect(splitWords('Lagos, Port Harcourt;Chinedu\nAisha')).toEqual(['Lagos', ' Port Harcourt', 'Chinedu', 'Aisha']);
  });
});

describe('cleanWords', () => {
  it('tidies spaces, drops empties and repeats ignoring case', () => {
    expect(cleanWords(['  Lagos ', 'lagos', '', 'Port   Harcourt', ' '])).toEqual(['Lagos', 'Port Harcourt']);
  });

  it('takes out the characters sherpa-onnx gives a meaning to', () => {
    expect(cleanWords(['Abuja/Kano', 'Emeka :2'])).toEqual(['Abuja Kano', 'Emeka 2']);
  });

  it('caps length and count', () => {
    expect(cleanWords(['x'.repeat(100)])[0]).toHaveLength(MAX_LENGTH);
    const many = Array.from({ length: MAX_WORDS + 20 }, (_, i) => `w${i}`);
    expect(cleanWords(many)).toHaveLength(MAX_WORDS);
  });
});

describe('addWords', () => {
  it('puts new words first and skips ones already saved', () => {
    expect(addWords(['Lagos'], 'Chinedu, lagos')).toEqual(['Chinedu', 'Lagos']);
  });
});
