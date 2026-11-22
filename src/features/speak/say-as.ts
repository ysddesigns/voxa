import type { Files } from '@/storage/files';
import { sayAsKey, type SayAs } from './script';

/**
 * "Say as" dictionary (PRD ED-3): how Voxa should say a word, written the way it sounds
 * ("Nnamdi" → "Nahm-dee", "NEPA" → "nee-pah"). Used for every script and quick phrase.
 * Saved in say-as.json on the phone.
 */
const PATH = 'say-as.json';
export const MAX_SOUND = 60;

export function parseSayAs(text: string | null): SayAs {
  try {
    const v: unknown = text ? JSON.parse(text) : {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: SayAs = {};
    for (const [k, s] of Object.entries(v as Record<string, unknown>)) {
      if (typeof s === 'string' && s.trim() && k.trim()) out[sayAsKey(k)] = s.trim().slice(0, MAX_SOUND);
    }
    return out;
  } catch {
    return {};
  }
}

export class SayAsStore {
  constructor(private readonly files: Files) {}

  async load(): Promise<SayAs> {
    return parseSayAs(await this.files.read(PATH));
  }

  /** Sets how a word is said; an empty sound removes it. Returns the new dictionary. */
  async set(word: string, sound: string): Promise<SayAs> {
    const all = await this.load();
    const key = sayAsKey(word.trim());
    const clean = sound.replace(/\s+/g, ' ').trim().slice(0, MAX_SOUND);
    if (!key) return all;
    if (clean && sayAsKey(clean) !== key) all[key] = clean;
    else delete all[key];
    await this.files.write(PATH, JSON.stringify(all));
    return all;
  }
}
