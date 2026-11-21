import { DEV_CATALOGUE, packBytes, parseCatalogue, runsOn, type Pack } from '../catalogue';
import { canDownload, formatMB, isRetryable, MOBILE_DATA_LIMIT, retryDelayMs, STORAGE_MARGIN, verdictMessage } from '../rules';

const MB = 1024 * 1024;
const file = (over: object = {}) => ({ path: 'model.onnx', url: 'https://cdn.example/model.onnx', sha256: 'a'.repeat(64), bytes: 20 * MB, ...over });
const pack = (over: object = {}) => ({ id: 'amara-low', kind: 'voice', name: 'Amara', tags: ['Female'], minTier: 'lite', licence: 'Voxa', files: [file()], ...over });

describe('pack catalogue', () => {
  it('keeps well-formed packs', () => {
    const c = parseCatalogue({ version: 3, packs: [pack()] });
    expect(c.version).toBe(3);
    expect(c.packs.map((p) => p.id)).toEqual(['amara-low']);
    expect(packBytes(c.packs[0])).toBe(20 * MB);
  });

  it.each([
    ['an unsafe id', pack({ id: '../etc' })],
    ['a path that climbs out of the pack', pack({ files: [file({ path: '../../evil.so' })] })],
    ['an absolute path', pack({ files: [file({ path: '/data/evil' })] })],
    ['plain http', pack({ files: [file({ url: 'http://cdn.example/model.onnx' })] })],
    ['a bad checksum', pack({ files: [file({ sha256: 'xyz' })] })],
    ['a size of zero', pack({ files: [file({ bytes: 0 })] })],
    ['no files', pack({ files: [] })],
    ['the same file twice', pack({ files: [file(), file()] })],
    ['no licence', pack({ licence: ' ' })],
    ['an unknown kind', pack({ kind: 'plugin' })],
  ])('drops a pack with %s', (_, bad) => {
    expect(parseCatalogue({ version: 1, packs: [bad, pack({ id: 'ok' })] }).packs.map((p) => p.id)).toEqual(['ok']);
  });

  it('survives junk and keeps the first of two packs with one id', () => {
    expect(parseCatalogue(null).packs).toEqual([]);
    expect(parseCatalogue({ packs: 'nope' }).packs).toEqual([]);
    const c = parseCatalogue({ packs: [pack({ name: 'First' }), pack({ name: 'Second' })] });
    expect(c.packs.map((p) => p.name)).toEqual(['First']);
  });

  it('matches packs to phone tiers', () => {
    const p = parseCatalogue({ packs: [pack({ minTier: 'standard' })] }).packs[0];
    expect(runsOn(p, 'lite')).toBe(false);
    expect(runsOn(p, 'standard')).toBe(true);
    expect(runsOn(p, 'pro')).toBe(true);
  });

  it('ships a dev catalogue that passes its own checks', () => {
    expect(parseCatalogue(DEV_CATALOGUE)).toEqual(DEV_CATALOGUE);
  });
});

describe('download rules', () => {
  const big = parseCatalogue({ packs: [pack()] }).packs[0] as Pack;
  const small = parseCatalogue({ packs: [pack({ files: [file({ bytes: 2 * MB })] })] }).packs[0] as Pack;
  const ok = { installed: false, freeBytes: 4000 * MB, connected: true, unmetered: true, allowMobileData: false };

  it('allows a download on Wi-Fi with room to spare', () => {
    expect(canDownload(big, ok)).toEqual({ ok: true, bytes: 20 * MB });
  });

  it('refuses when installed, offline or short of space', () => {
    expect(canDownload(big, { ...ok, installed: true })).toEqual({ ok: false, reason: 'installed' });
    expect(canDownload(big, { ...ok, connected: false })).toEqual({ ok: false, reason: 'offline' });
    expect(canDownload(big, { ...ok, freeBytes: 100 * MB })).toEqual({ ok: false, reason: 'storage', needBytes: 20 * MB + STORAGE_MARGIN });
  });

  it('waits for Wi-Fi for big downloads unless mobile data is allowed', () => {
    const mobile = { ...ok, unmetered: false };
    expect(canDownload(big, mobile)).toEqual({ ok: false, reason: 'wifi', bytes: 20 * MB });
    expect(canDownload(big, { ...mobile, allowMobileData: true }).ok).toBe(true);
    expect(packBytes(small)).toBeLessThanOrEqual(MOBILE_DATA_LIMIT);
    expect(canDownload(small, mobile).ok).toBe(true);
  });

  it('explains every refusal in plain words', () => {
    expect(verdictMessage(canDownload(big, { ...ok, freeBytes: 0 }))).toBe('Not enough space. Free up 220 MB and try again.');
    expect(verdictMessage(canDownload(big, { ...ok, unmetered: false }))).toContain('20 MB');
    expect(verdictMessage(canDownload(big, ok))).toBeNull();
    expect(formatMB(2.3 * MB)).toBe('2.3 MB');
  });

  it('backs off between retries and does not retry a bad file', () => {
    expect([0, 1, 2, 10].map(retryDelayMs)).toEqual([2000, 4000, 8000, 60000]);
    expect(isRetryable('Server answered 503 for model.onnx')).toBe(true);
    expect(isRetryable('timeout')).toBe(true);
    expect(isRetryable('model.onnx failed its checksum')).toBe(false);
  });
});
