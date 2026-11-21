import { VoxaEngine } from '../../../modules/voxa-engine';
import type { SessionStore } from '@/storage/sessions';

export type StorageUse = {
  freeBytes: number | null;
  /** Downloaded packs, by pack id. */
  packBytes: Record<string, number>;
  sessionBytes: number | null;
  /** Meeting audio kept until speakers are labelled. */
  audioBytes: number | null;
};

/** What the phone has free and what Voxa keeps. Nulls when this build cannot tell. */
export function readStorage(): StorageUse {
  const s = VoxaEngine?.storageInfo?.();
  return {
    freeBytes: s?.freeBytes ?? null,
    packBytes: s?.packBytes ?? {},
    sessionBytes: s?.sessionBytes ?? null,
    audioBytes: s?.audioBytes ?? null,
  };
}

export const totalBytes = (u: StorageUse) =>
  Object.values(u.packBytes).reduce((a, b) => a + b, 0) + (u.sessionBytes ?? 0) + (u.audioBytes ?? 0);

/** Deletes meeting audio still waiting for speaker labels. Returns how many sessions it touched. */
export async function deleteWaitingAudio(store: SessionStore): Promise<number> {
  const waiting = (await store.list()).filter((s) => s.hasAudio);
  for (const s of waiting) await store.removeAudio(s.id);
  return waiting.length;
}

/** Deletes every saved session (transcripts, scans, summaries, audio). */
export async function deleteAllSessions(store: SessionStore): Promise<number> {
  const all = await store.list();
  for (const s of all) await store.remove(s.id);
  return all.length;
}
