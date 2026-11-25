import { BANDS, voiceScene, voiceWaves } from '../poster-art';

const ada = { id: 'ada', tags: ['Bright', 'Female'] };
const noah = { id: 'noah', tags: ['Calm', 'Male'] };

describe('voiceScene (a voice sleeve in the shop window)', () => {
  it('gives a voice the same sleeve every time', () => {
    expect(voiceScene(ada)).toEqual(voiceScene({ ...ada }));
  });

  it('rolls quicker waves for a bright voice than a calm one', () => {
    expect(voiceWaves(ada.tags)).toBeGreaterThan(voiceWaves(noah.tags));
    expect(voiceWaves(['Female'])).toBe(2);
  });

  it('sets the light by tone, with the moon out for a deep voice', () => {
    expect(voiceScene(ada).time).toBe('dawn');
    expect(voiceScene(noah).time).toBe('dusk');
    const deep = voiceScene({ id: 'james', tags: ['Deep', 'Male'] });
    expect(deep.time).toBe('night');
    expect(deep.sun.moon).toBe(true);
  });

  it('draws three wave hills and a band from the poster set', () => {
    const s = voiceScene(ada);
    expect(s.hills).toHaveLength(3);
    for (const h of s.hills) expect(h.d).toMatch(/^M0,100 L.* L100,100 Z$/);
    expect(BANDS).toContainEqual(s.band);
  });
});
