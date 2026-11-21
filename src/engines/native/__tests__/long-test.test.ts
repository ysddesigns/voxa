import { parseLongTest, summarizeLongTest } from '../long-test';

const row = (min: number, battery: number, extra: object = {}) =>
  JSON.stringify({ min, battery, tempC: 30 + min / 10, charging: false, screenOffMin: Math.max(0, min - 1), pssMb: 250 + min, words: min * 10, rtf: min === 0 ? 0 : 0.2, ...extra });

describe('screen-off test summary', () => {
  it('turns the minute samples into battery per hour, peak memory and speed', () => {
    const lines = [row(0, 90, { minutes: 60 }), row(1, 90), row(30, 86, { rtf: 0.4 }), row(60, 82), row(60, 82, { done: true, reason: 'finished' })];
    const s = summarizeLongTest(parseLongTest(lines))!;
    expect(s.minutes).toBe(60);
    expect(s.batteryUsed).toBe(8);
    expect(s.batteryPerHour).toBeCloseTo(8);
    expect(s.peakMemoryMb).toBe(310);
    expect(s.maxTempC).toBe(36);
    expect(s.avgRtf).toBeCloseTo((0.2 + 0.4 + 0.2) / 3);
    expect(s.worstRtf).toBe(0.4);
    expect(s.words).toBe(600);
    expect(s.charged).toBe(false);
    expect(s.done).toBe(true);
    expect(s.reason).toBe('finished');
  });

  it('scales a stopped test to an hour, but not a very short one', () => {
    expect(summarizeLongTest(parseLongTest([row(0, 80), row(20, 78)]))!.batteryPerHour).toBeCloseTo(6);
    expect(summarizeLongTest(parseLongTest([row(0, 80), row(2, 80)]))!.batteryPerHour).toBeNull();
  });

  it('flags charging and skips lines cut short', () => {
    const s = summarizeLongTest(parseLongTest([row(0, 50), '{"min": 1, "batt', row(10, 55, { charging: true })]))!;
    expect(s.charged).toBe(true);
    expect(s.batteryUsed).toBe(0);
    expect(s.done).toBe(false);
  });

  it('has nothing to say before the test starts', () => {
    expect(summarizeLongTest([])).toBeNull();
  });
});
