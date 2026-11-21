import type { Files } from '@/storage/files';

/**
 * Quick phrases: things said often, spoken with one tap (Speak for me).
 * Saved in phrases.json; the list starts with a few useful ones the person can edit or delete.
 */

export type Phrase = { id: string; text: string };

export const MAX_PHRASE = 300;

export const DEFAULT_PHRASES: Phrase[] = [
  { id: 'd1', text: 'Please give me a moment to type.' },
  { id: 'd2', text: 'I use this app to speak.' },
  { id: 'd3', text: 'Yes.' },
  { id: 'd4', text: 'No.' },
  { id: 'd5', text: 'Thank you.' },
  { id: 'd6', text: 'Can you say that again, please?' },
  { id: 'd7', text: 'Please speak slowly.' },
  { id: 'd8', text: 'Please write it down for me.' },
  { id: 'd9', text: 'I need help, please.' },
];

const PATH = 'phrases.json';

export function cleanPhrase(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_PHRASE);
}

export function parsePhrases(text: string | null): Phrase[] | null {
  if (text === null) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return null;
    const seen = new Set<string>();
    const out: Phrase[] = [];
    for (const p of v) {
      if (!p || typeof p !== 'object') continue;
      const { id, text: t } = p as Record<string, unknown>;
      if (typeof id !== 'string' || typeof t !== 'string' || seen.has(id)) continue;
      const clean = cleanPhrase(t);
      if (!clean) continue;
      seen.add(id);
      out.push({ id, text: clean });
    }
    return out;
  } catch {
    return null;
  }
}

export class PhraseStore {
  constructor(
    private readonly files: Files,
    private readonly newId: () => string = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  ) {}

  /** The saved list, or the starter list on first use (or if the file is unreadable). */
  async list(): Promise<Phrase[]> {
    return parsePhrases(await this.files.read(PATH)) ?? DEFAULT_PHRASES;
  }

  private async save(list: Phrase[]) {
    await this.files.write(PATH, JSON.stringify(list));
    return list;
  }

  /** New phrases go first. Adding text already in the list moves it to the top instead. */
  async add(text: string): Promise<Phrase[]> {
    const clean = cleanPhrase(text);
    const list = await this.list();
    if (!clean) return list;
    const existing = list.find((p) => p.text.toLowerCase() === clean.toLowerCase());
    const rest = list.filter((p) => p !== existing);
    return this.save([existing ?? { id: this.newId(), text: clean }, ...rest]);
  }

  async update(id: string, text: string): Promise<Phrase[]> {
    const clean = cleanPhrase(text);
    const list = await this.list();
    if (!clean) return this.remove(id);
    return this.save(list.map((p) => (p.id === id ? { ...p, text: clean } : p)));
  }

  async remove(id: string): Promise<Phrase[]> {
    return this.save((await this.list()).filter((p) => p.id !== id));
  }

  /** Moves a phrase up (-1) or down (+1). */
  async move(id: string, by: -1 | 1): Promise<Phrase[]> {
    const list = [...(await this.list())];
    const i = list.findIndex((p) => p.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return list;
    [list[i], list[j]] = [list[j], list[i]];
    return this.save(list);
  }

  async reset(): Promise<Phrase[]> {
    return this.save(DEFAULT_PHRASES);
  }
}
