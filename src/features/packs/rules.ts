import { packBytes, type Pack } from './catalogue';

/**
 * Whether a pack may be downloaded now. The PRD rules:
 *  - never fill the phone: keep room for the download plus a safety margin;
 *  - large downloads wait for Wi-Fi unless the person allows mobile data;
 *  - nothing to do offline, or when the pack is already installed.
 */

export type Conditions = {
  installed: boolean;
  freeBytes: number;
  connected: boolean;
  /** On Wi-Fi or another network not charged by the megabyte. */
  unmetered: boolean;
  /** Setting: allow big downloads on mobile data. */
  allowMobileData: boolean;
};

export type Verdict =
  | { ok: true; bytes: number }
  | { ok: false; reason: 'installed' | 'offline' }
  | { ok: false; reason: 'storage'; needBytes: number }
  | { ok: false; reason: 'wifi'; bytes: number };

const MB = 1024 * 1024;
/** Packs this small download on mobile data without asking. */
export const MOBILE_DATA_LIMIT = 10 * MB;
/** Always leave this much free after a download. */
export const STORAGE_MARGIN = 200 * MB;

export function canDownload(pack: Pack, c: Conditions): Verdict {
  const bytes = packBytes(pack);
  if (c.installed) return { ok: false, reason: 'installed' };
  if (!c.connected) return { ok: false, reason: 'offline' };
  // The download is written once (.part) and renamed, so it needs its own size in free space.
  const needBytes = bytes + STORAGE_MARGIN;
  if (c.freeBytes < needBytes) return { ok: false, reason: 'storage', needBytes };
  if (!c.unmetered && !c.allowMobileData && bytes > MOBILE_DATA_LIMIT) return { ok: false, reason: 'wifi', bytes };
  return { ok: true, bytes };
}

export function verdictMessage(v: Verdict): string | null {
  if (v.ok) return null;
  switch (v.reason) {
    case 'installed':
      return 'Already on this phone.';
    case 'offline':
      return 'No internet connection. Voxa will be ready to download when you are back online.';
    case 'storage':
      return `Not enough space. Free up ${formatMB(v.needBytes)} and try again.`;
    case 'wifi':
      return `This download is ${formatMB(v.bytes)}. Connect to Wi-Fi, or allow downloads on mobile data in Settings.`;
  }
}

export function formatMB(bytes: number): string {
  const mb = bytes / MB;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/** Waits before retry n (0-based) after a failed download: 2 s, 4 s, 8 s… up to a minute. */
export function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 2000 * 2 ** attempt);
}

/** Network drops and server errors are worth retrying; a bad checksum or a bad catalogue is not. */
export function isRetryable(message: string): boolean {
  return !/checksum|larger than the catalogue|Bad pack id|Bad file path|must use https/i.test(message);
}
