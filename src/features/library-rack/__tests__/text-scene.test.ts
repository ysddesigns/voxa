import { BANDS, textScene } from '../poster-art';

describe('textScene (the player poster)', () => {
  it('gives the same text the same page every time', () => {
    expect(textScene('Good morning, everyone.')).toEqual(textScene('Good morning, everyone.'));
  });

  it('prints more lines for a longer script', () => {
    const short = textScene('Hello there.');
    const long = textScene(Array.from({ length: 200 }, (_, i) => `word${i}`).join(' '));
    expect(long.lines.length).toBeGreaterThan(short.lines.length);
  });

  it('draws a page even with no text, with a band from the poster set', () => {
    const scene = textScene('   ');
    expect(scene.kind).toBe('page');
    expect(scene.lines.length).toBeGreaterThanOrEqual(4);
    expect(BANDS).toContainEqual(scene.band);
  });
});
