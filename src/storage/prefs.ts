import type { Files } from './files';

/** Small settings saved on the phone (prefs.json). Unknown or bad values fall back to the defaults. */
export type ThemePref = 'system' | 'light' | 'dark';

export type Prefs = {
  /** Speak for me plays through earbuds or the earpiece, never the loudspeaker. */
  discreet: boolean;
  theme: ThemePref;
  /** The chosen voice; empty until the person picks one (the app then uses its default). */
  voiceId: string;
  favourites: string[];
  /** Allow downloads over 10 MB on mobile data. */
  allowMobileData: boolean;
  /** Finished (or skipped) the first-run setup. */
  onboarded: boolean;
  /** With TalkBack or VoiceOver on, read each new caption sentence aloud on the Live screen. */
  readCaptions: boolean;
};

export const DEFAULT_PREFS: Prefs = { discreet: false, theme: 'system', voiceId: '', favourites: [], allowMobileData: false, onboarded: false, readCaptions: false };

const PATH = 'prefs.json';
const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];

export function parsePrefs(text: string | null): Prefs {
  let raw: Record<string, unknown> = {};
  try {
    const v: unknown = text ? JSON.parse(text) : {};
    if (v && typeof v === 'object' && !Array.isArray(v)) raw = v as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const bool = (k: keyof Prefs) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : (DEFAULT_PREFS[k] as boolean));
  return {
    discreet: bool('discreet'),
    theme: THEMES.includes(raw.theme as ThemePref) ? (raw.theme as ThemePref) : DEFAULT_PREFS.theme,
    voiceId: typeof raw.voiceId === 'string' ? raw.voiceId : '',
    favourites: Array.isArray(raw.favourites) ? raw.favourites.filter((f): f is string => typeof f === 'string') : [],
    allowMobileData: bool('allowMobileData'),
    onboarded: bool('onboarded'),
    readCaptions: bool('readCaptions'),
  };
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
