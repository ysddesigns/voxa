import type { LongTestSample } from '../../../modules/voxa-engine';

/** What the Phase 0 gate needs from the 60-minute screen-off test. */
export type LongTestSummary = {
  minutes: number;
  screenOffMinutes: number;
  batteryUsed: number;
  /** Battery % per hour, scaled from the time the test ran. Null under 5 minutes (too noisy). */
  batteryPerHour: number | null;
  maxTempC: number;
  peakMemoryMb: number;
  /** Mean decode speed over the minute samples (lower is faster). */
  avgRtf: number | null;
  worstRtf: number | null;
  words: number;
  /** Charging at any point makes the battery figures meaningless. */
  charged: boolean;
  done: boolean;
  reason: string | null;
};

export function parseLongTest(lines: string[]): LongTestSample[] {
  const out: LongTestSample[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as LongTestSample);
    } catch {
      // A line cut short by the app being killed: skip it.
    }
  }
  return out;
}

export function summarizeLongTest(samples: LongTestSample[]): LongTestSummary | null {
  if (samples.length === 0) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const rtfs = samples.filter((s) => !s.done && s.rtf > 0).map((s) => s.rtf);
  const batteryUsed = Math.max(0, first.battery - last.battery);
  return {
    minutes: last.min,
    screenOffMinutes: last.screenOffMin,
    batteryUsed,
    batteryPerHour: last.min >= 5 ? (batteryUsed / last.min) * 60 : null,
    maxTempC: Math.max(...samples.map((s) => s.tempC)),
    peakMemoryMb: Math.max(...samples.map((s) => s.pssMb)),
    avgRtf: rtfs.length ? rtfs.reduce((a, b) => a + b, 0) / rtfs.length : null,
    worstRtf: rtfs.length ? Math.max(...rtfs) : null,
    words: last.words,
    charged: samples.some((s) => s.charging),
    done: !!last.done,
    reason: last.reason ?? null,
  };
}
