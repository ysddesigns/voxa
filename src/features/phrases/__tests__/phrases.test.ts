import { memoryFiles } from '@/storage/files';
import { parsePrefs, PrefsStore } from '@/storage/prefs';
import { DEFAULT_PHRASES, parsePhrases, PhraseStore } from '../phrases';

function store(initial: Record<string, string> = {}) {
  let n = 0;
  return new PhraseStore(memoryFiles(initial), () => `p${++n}`);
}

describe('PhraseStore', () => {
  it('starts with the starter phrases', async () => {
    expect(await store().list()).toEqual(DEFAULT_PHRASES);
  });

  it('adds new phrases first, tidied, and moves a repeat to the top instead of duplicating it', async () => {
    const s = store();
    await s.add('  Where is   the toilet? ');
    expect((await s.list())[0]).toEqual({ id: 'p1', text: 'Where is the toilet?' });
    const list = await s.add('thank you.');
    expect(list[0].text).toBe('Thank you.');
    expect(list.filter((p) => p.text === 'Thank you.')).toHaveLength(1);
    expect(list).toHaveLength(DEFAULT_PHRASES.length + 1);
  });

  it('ignores empty text, edits, removes when edited to nothing, and moves', async () => {
    const s = store();
    expect(await s.add('   ')).toEqual(DEFAULT_PHRASES);
    expect((await s.update('d3', 'Yes, please.')).find((p) => p.id === 'd3')?.text).toBe('Yes, please.');
    expect((await s.update('d4', ' ')).some((p) => p.id === 'd4')).toBe(false);
    const moved = await s.move('d2', -1);
    expect(moved.slice(0, 2).map((p) => p.id)).toEqual(['d2', 'd1']);
    expect(await s.move('d2', -1)).toEqual(moved); // already first
    expect((await s.remove('d1')).some((p) => p.id === 'd1')).toBe(false);
    expect(await s.reset()).toEqual(DEFAULT_PHRASES);
  });

  it('keeps an emptied list empty rather than bringing the starters back', async () => {
    const s = store({ 'phrases.json': '[]' });
    expect(await s.list()).toEqual([]);
  });

  it('drops bad entries and survives a corrupt file', () => {
    expect(parsePhrases('[{"id":"a","text":"Hi"},{"id":"a","text":"dup"},{"id":1},null,{"id":"b","text":"  "}]')).toEqual([{ id: 'a', text: 'Hi' }]);
    expect(parsePhrases('{oops')).toBeNull();
  });
});

describe('prefs', () => {
  it('falls back to defaults for missing or bad values', () => {
    expect(parsePrefs(null)).toEqual({ discreet: false });
    expect(parsePrefs('{"discreet":"yes"}')).toEqual({ discreet: false });
    expect(parsePrefs('not json')).toEqual({ discreet: false });
  });

  it('saves and loads', async () => {
    const s = new PrefsStore(memoryFiles());
    await s.save({ discreet: true });
    expect(await s.load()).toEqual({ discreet: true });
  });
});
