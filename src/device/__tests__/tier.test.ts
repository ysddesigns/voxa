import { tierFromFacts } from '../tier';

const GB = 1024 ** 3;
const base = { supportedCpuArchitectures: ['arm64-v8a'], platform: 'android' as const };

describe('tierFromFacts', () => {
  it.each([
    [1.8 * GB, 'lite'],
    [3.4 * GB, 'lite'],
    [3.7 * GB, 'standard'],
    [5.6 * GB, 'standard'],
    [7.5 * GB, 'pro'],
  ])('%d bytes -> %s', (mem, tier) => {
    expect(tierFromFacts({ ...base, totalMemoryBytes: mem })).toBe(tier);
  });

  it('puts 32-bit-only phones on Lite', () => {
    expect(
      tierFromFacts({ ...base, supportedCpuArchitectures: ['armeabi-v7a'], totalMemoryBytes: 8 * GB }),
    ).toBe('lite');
  });

  it('moves a slow phone down one tier, never up', () => {
    expect(tierFromFacts({ ...base, totalMemoryBytes: 8 * GB, benchmarkRtf: 0.9 })).toBe('standard');
    expect(tierFromFacts({ ...base, totalMemoryBytes: 2 * GB, benchmarkRtf: 0.1 })).toBe('lite');
  });

  it('treats unknown memory as Lite on Android, Standard on iOS', () => {
    expect(tierFromFacts({ ...base, totalMemoryBytes: null })).toBe('lite');
    expect(tierFromFacts({ ...base, platform: 'ios', totalMemoryBytes: null })).toBe('standard');
  });
});
