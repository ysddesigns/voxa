import pkg from '../../../../package.json';
import { LIBRARIES, licenceText, MODELS, needsReview } from '../licences';

const BUILD_ONLY = new Set(['eslint-config-expo', 'expo-build-properties', 'expo-dev-client']);

describe('open-source licences', () => {
  it('lists every runtime dependency (rerun node scripts/make-licences.mjs after changing them)', () => {
    const listed = new Set(LIBRARIES.map((l) => l.name.replace(/ [^ ]+$/, '')));
    const missing = Object.keys(pkg.dependencies).filter((d) => !BUILD_ONLY.has(d) && !listed.has(d));
    expect(missing).toEqual([]);
  });

  it('ships the licence text and a copyright notice for every library', () => {
    for (const l of LIBRARIES) {
      expect(l.text && licenceText(l.text).length).toBeGreaterThan(500);
      expect(l.copyright.length).toBeGreaterThan(0);
    }
    expect(MODELS.every((m) => !m.text || licenceText(m.text).length > 500)).toBe(true);
  });

  it('names what legal must still confirm before launch', () => {
    expect(needsReview()).toEqual(['Piper voice, LJSpeech medium', 'Punctuation and casing model (sherpa-onnx online punct, English)', 'Kroko ASR (English)']);
  });
});
