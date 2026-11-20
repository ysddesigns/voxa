import type { Tier } from '@/engines/types';

/**
 * Device tier (PRD "Models by device tier"). The phone reports less RAM than
 * advertised, so cut-offs sit at 3.5 GB and 6.5 GB. A first-run speed test can
 * move a phone down a tier (never up). Cut-offs are proposals to confirm in phase 0.
 */

const GB = 1024 * 1024 * 1024;
export const LITE_MAX_BYTES = 3.5 * GB;
export const STANDARD_MAX_BYTES = 6.5 * GB;

export type DeviceFacts = {
  totalMemoryBytes: number | null;
  /** CPU architectures the OS supports, e.g. ["arm64-v8a", "armeabi-v7a"]. */
  supportedCpuArchitectures: string[] | null;
  platform: 'ios' | 'android' | 'web' | 'other';
  /** Real-time factor from the first-run speech benchmark (lower is faster). */
  benchmarkRtf?: number | null;
};

/** A Lite-tier phone must transcribe at least twice as fast as real time. */
export const MAX_RTF_FOR_STANDARD = 0.5;

export function has64Bit(archs: string[] | null): boolean {
  if (!archs || archs.length === 0) return true; // unknown: don't punish (iOS is always 64-bit)
  return archs.some((a) => /arm64|aarch64|x86_64/i.test(a));
}

export function tierFromFacts(facts: DeviceFacts): Tier {
  const { totalMemoryBytes: mem, supportedCpuArchitectures, benchmarkRtf } = facts;
  let tier: Tier;
  if (!has64Bit(supportedCpuArchitectures)) tier = 'lite';
  else if (mem === null) tier = facts.platform === 'ios' ? 'standard' : 'lite';
  else if (mem < LITE_MAX_BYTES) tier = 'lite';
  else if (mem < STANDARD_MAX_BYTES) tier = 'standard';
  else tier = 'pro';

  if (benchmarkRtf != null && benchmarkRtf > MAX_RTF_FOR_STANDARD && tier !== 'lite') {
    tier = tier === 'pro' ? 'standard' : 'lite';
  }
  return tier;
}

export const TIER_LABEL: Record<Tier, string> = { lite: 'Lite', standard: 'Standard', pro: 'Pro' };
