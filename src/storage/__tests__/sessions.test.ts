import { memoryFiles } from '../files';
import { parseSegments, SessionStore } from '../sessions';

const seg = (id: string, startMs: number, text = `Sentence ${id}.`) => ({ id, speaker: null, text, startMs, endMs: startMs + 1000, final: true });

describe('SessionStore', () => {
  it('saves a session as it goes and loads it back in order', async () => {
    const files = memoryFiles();
    const store = new SessionStore(files);
    await store.create({ id: 'a1', kind: 'listen', title: 'Weekly sync', startedAt: 1000 });
    await store.appendSegment('a1', seg('n0-1', 5000));
    await store.appendSegment('a1', seg('n0-0', 1000));
    await store.appendSegment('a1', { ...seg('p', 9000), final: false }); // partials are not saved
    await store.updateMeta('a1', { marks: [{ atMs: 3000 }] });

    const s = await store.load('a1');
    expect(s?.status).toBe('recording');
    expect(s?.segments.map((x) => x.id)).toEqual(['n0-0', 'n0-1']);
    expect(s?.marks).toEqual([{ atMs: 3000 }]);
  });

  it('skips a half-written last line after a crash', () => {
    const good = JSON.stringify(seg('n0-0', 0));
    expect(parseSegments(`${good}\n{"id":"n0-1","tex`)).toHaveLength(1);
  });

  it('recovers sessions left recording, but not the one running now', async () => {
    const store = new SessionStore(memoryFiles());
    await store.create({ id: 'old', kind: 'listen', title: 'Old', startedAt: 1 });
    await store.appendSegment('old', seg('n0-0', 60_000));
    await store.create({ id: 'now', kind: 'listen', title: 'Now', startedAt: 2 });
    await store.create({ id: 'done', kind: 'listen', title: 'Done', startedAt: 3, status: 'saved' });

    const found = await store.recoverUnfinished('now');
    expect(found.map((m) => m.id)).toEqual(['old']);
    expect(found[0]).toMatchObject({ status: 'recovered', durationMs: 61_000 });
    expect((await store.load('now'))?.status).toBe('recording');
  });

  it('lists newest first, applies speaker labels, and removes sessions', async () => {
    const files = memoryFiles();
    const store = new SessionStore(files);
    await store.create({ id: 'a', kind: 'listen', title: 'A', startedAt: 1 });
    await store.create({ id: 'b', kind: 'listen', title: 'B', startedAt: 2 });
    await store.appendSegment('a', seg('x', 0));
    await store.setSpeakers('a', { x: 1 }, 2);
    expect((await store.list()).map((m) => m.id)).toEqual(['b', 'a']);
    const a = await store.load('a');
    expect(a?.speakers).toBe(2);
    expect(a?.segments[0].speaker).toBe(1);

    await store.remove('a');
    expect((await store.list()).map((m) => m.id)).toEqual(['b']);
    expect([...files.data.keys()].some((k) => k.includes('/a/'))).toBe(false);
  });

  it('refuses ids that could leave the sessions folder', async () => {
    const store = new SessionStore(memoryFiles());
    await expect(store.create({ id: '../x', kind: 'listen', title: 'X', startedAt: 1 })).rejects.toThrow();
    expect(await store.load('../x')).toBeNull();
  });

  it('gives native code a path relative to the documents folder', () => {
    expect(new SessionStore(memoryFiles(), 'voxa').audioPath('a1')).toBe('voxa/sessions/a1/audio.pcm');
  });
});
