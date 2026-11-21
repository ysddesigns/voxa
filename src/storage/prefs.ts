import type { Files } from './files';

/** Small settings saved on the phone (prefs.json). Unknown or bad values fall back to the defaults. */
export type Prefs = {
  /** Speak for me plays through earbuds or the earpiece, never the loudspeaker. */
  discreet: boolean;
};

export const DEFAULT_PREFS: Prefs = { discreet: false };

const PATH = 'prefs.json';

export function parsePrefs(text: string | null): Prefs {
  let raw: Record<string, unknown> = {};
  try {
    const v: unknown = text ? JSON.parse(text) : {};
    if (v && typeof v === 'object') raw = v as Record<string, unknown>;
  } catch {
    raw = {};
  }
  return { discreet: typeof raw.discreet === 'boolean' ? raw.discreet : DEFAULT_PREFS.discreet };
}

export class PrefsStore {
  constructor(private readonly files: Files) {}

  async load(): Promise<Prefs> {
    return parsePrefs(await this.files.read(PATH));
  }

  async save(prefs: Prefs): Promise<void> {
    await this.files.write(PATH, JSON.stringify(prefs));
  }
}
