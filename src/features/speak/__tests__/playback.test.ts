import {
  clampIndex,
  durationMs,
  formatSpeed,
  formatTime,
  msPerWord,
  nextSpeed,
  tokenize,
  wordAtChar,
  wordAtFraction,
  wordsForSeconds,
} from '../playback';
import { makeTitle } from '../speak-session';

describe('tokenize', () => {
  it('returns each word with its character range', () => {
    expect(tokenize('Hi  there, Ada')).toEqual([
      { index: 0, start: 0, end: 2 },
      { index: 1, start: 4, end: 10 },
      { index: 2, start: 11, end: 14 },
    ]);
  });
  it('handles empty text', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('timing', () => {
  it('speaks 160 words a minute at 1x', () => {
    expect(msPerWord(1)).toBe(375);
    expect(durationMs(160, 1)).toBe(60000);
  });
  it('gets faster with speed', () => {
    expect(durationMs(160, 2)).toBe(30000);
  });
  it('formats as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(14_400)).toBe('0:14');
    expect(formatTime(75_000)).toBe('1:15');
    expect(formatTime(-5)).toBe('0:00');
  });
  it('covers 40 words in a 15 s skip at 1x', () => {
    expect(wordsForSeconds(15, 1)).toBe(40);
  });
});

describe('positions', () => {
  const words = tokenize('one two three four');
  it('maps a waveform tap to a word', () => {
    expect(wordAtFraction(0, 4)).toBe(0);
    expect(wordAtFraction(0.5, 4)).toBe(2);
    expect(wordAtFraction(1, 4)).toBe(3);
  });
  it('maps a character to its word', () => {
    expect(wordAtChar(words, 0)).toBe(0);
    expect(wordAtChar(words, 5)).toBe(1);
    expect(wordAtChar(words, 99)).toBe(3);
  });
  it('clamps indexes', () => {
    expect(clampIndex(-3, 4)).toBe(0);
    expect(clampIndex(9, 4)).toBe(3);
    expect(clampIndex(2, 0)).toBe(0);
  });
});

describe('speed', () => {
  it('cycles through the speeds', () => {
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(2)).toBe(0.75);
  });
  it('labels speeds like the canvas', () => {
    expect(formatSpeed(1)).toBe('1.0×');
    expect(formatSpeed(0.75)).toBe('0.75×');
    expect(formatSpeed(1.5)).toBe('1.5×');
    expect(formatSpeed(2)).toBe('2.0×');
  });
});

describe('makeTitle', () => {
  it('uses the first four words', () => {
    expect(makeTitle('Meet Voxa, the voice studio')).toBe('Meet Voxa, the voice…');
    expect(makeTitle('Hello there')).toBe('Hello there');
    expect(makeTitle('  ')).toBe('New script');
  });
});
