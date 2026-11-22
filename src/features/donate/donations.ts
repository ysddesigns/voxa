import type { Files } from '@/storage/files';
import type { Prompt } from './prompts';

/**
 * Donated recordings, kept on this phone until the volunteer shares them. The folder is laid out
 * as the training scripts read it (training/asr, "jsonl" source):
 *
 *   donate/recordings.jsonl   one line per recording: {id, audio, text, speaker, language, recordedMs}
 *   donate/audio/<prompt>.wav 16 kHz 16-bit mono
 *   donate/consent.json       what the volunteer agreed to, and when
 *
 * The speaker id is random and holds no name, so recordings from one phone stay together (which
 * keeps test speakers out of training) without saying who recorded them.
 */
export const DONATE_DIR = 'donate';
export const SHARE_DIR = 'donate-share';
const MANIFEST = `${DONATE_DIR}/recordings.jsonl`;
const SPEAKER = `${DONATE_DIR}/speaker.txt`;
const CONSENT = `${DONATE_DIR}/consent.json`;

/** Recordings shorter than this are almost always a mis-tap. */
export const MIN_TAKE_MS = 1000;
/** About twenty minutes of reading. */
export const GOAL_MS = 20 * 60 * 1000;
/** Version of the consent wording; bump it when the wording changes. */
export const CONSENT_VERSION = 1;

export type Take = {
  id: string;
  /** Relative to the recordings.jsonl file. */
  audio: string;
  text: string;
  speaker: string;
  language: 'en';
  recordedMs: number;
};

export type Consent = { version: number; at: string };

/** Path of a prompt's recording, as the Files layer names it. */
export const takePath = (promptId: string) => `${DONATE_DIR}/audio/${promptId}.wav`;
/** The same path as the native module names it (inside the app's files folder). */
export const nativePath = (path: string) => `voxa/${path}`;
export const shareName = (speaker: string) => `voxa-voice-${speaker}.zip`;

export function parseTakes(text: string | null): Take[] {
  if (!text) return [];
  const byAudio = new Map<string, Take>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as Partial<Take>;
      if (typeof row.audio === 'string' && typeof row.text === 'string' && typeof row.speaker === 'string') {
        byAudio.set(row.audio, {
          id: String(row.id ?? row.audio),
          audio: row.audio,
          text: row.text,
          speaker: row.speaker,
          language: 'en',
          recordedMs: Number(row.recordedMs) || 0,
        });
      }
    } catch {
      // A line cut short by a crash: skip it.
    }
  }
  return [...byAudio.values()];
}

/** The prompt id a take was recorded for ("audio/en-007.wav" → "en-007"). */
export const promptOf = (take: Take) => take.audio.replace(/^audio\//, '').replace(/\.wav$/, '');

/** First prompt not yet recorded or skipped, in order; null when all are done. */
export function nextPrompt(prompts: Prompt[], takes: Take[], skipped: ReadonlySet<string> = new Set()): Prompt | null {
  const done = new Set(takes.map(promptOf));
  return prompts.find((p) => !done.has(p.id) && !skipped.has(p.id)) ?? null;
}

export const totalMs = (takes: Take[]) => takes.reduce((sum, t) => sum + t.recordedMs, 0);

export function randomSpeaker(random: () => number = Math.random) {
  let s = '';
  while (s.length < 10) s += Math.floor(random() * 36).toString(36);
  return `vx-${s}`;
}

export class DonationStore {
  constructor(
    private readonly files: Files,
    private readonly newSpeaker: () => string = randomSpeaker,
  ) {}

  async speaker(): Promise<string> {
    const saved = (await this.files.read(SPEAKER))?.trim();
    if (saved) return saved;
    const id = this.newSpeaker();
    await this.files.write(SPEAKER, id);
    return id;
  }

  async consent(): Promise<Consent | null> {
    try {
      const c = JSON.parse((await this.files.read(CONSENT)) ?? 'null') as Consent | null;
      return c && c.version === CONSENT_VERSION ? c : null;
    } catch {
      return null;
    }
  }

  async agree(now = new Date()): Promise<Consent> {
    const c: Consent = { version: CONSENT_VERSION, at: now.toISOString() };
    await this.files.write(CONSENT, JSON.stringify(c));
    return c;
  }

  async takes(): Promise<Take[]> {
    return parseTakes(await this.files.read(MANIFEST));
  }

  /** Saves (or replaces) the recording for a prompt; its audio is already at takePath(prompt.id). */
  async save(prompt: Prompt, recordedMs: number): Promise<Take[]> {
    const speaker = await this.speaker();
    const take: Take = {
      id: `${speaker}-${prompt.id}`,
      audio: `audio/${prompt.id}.wav`,
      text: prompt.text,
      speaker,
      language: 'en',
      recordedMs: Math.round(recordedMs),
    };
    const takes = (await this.takes()).filter((t) => t.audio !== take.audio);
    takes.push(take);
    await this.writeAll(takes);
    return takes;
  }

  /** Removes a prompt's recording and its line. */
  async discard(promptId: string): Promise<Take[]> {
    await this.files.remove(takePath(promptId));
    const takes = (await this.takes()).filter((t) => promptOf(t) !== promptId);
    await this.writeAll(takes);
    return takes;
  }

  /** Deletes every recording, the shared zip and the speaker id. Consent is asked again next time. */
  async deleteAll(): Promise<void> {
    await this.files.remove(DONATE_DIR);
    await this.files.remove(SHARE_DIR);
  }

  private async writeAll(takes: Take[]) {
    await this.files.write(MANIFEST, takes.map((t) => JSON.stringify(t)).join('\n') + (takes.length ? '\n' : ''));
  }
}
