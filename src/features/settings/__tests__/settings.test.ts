import { DEV_CATALOGUE, LISTEN_PACK, packBytes, parseCatalogue, SPEAKERS_PACK } from '@/features/packs/catalogue';
import { canDownload } from '@/features/packs/rules';
import { friendlyError } from '@/features/listen/recorder';
import { memoryFiles } from '@/storage/files';
import { SessionStore } from '@/storage/sessions';
import { deleteAllSessions, deleteWaitingAudio, totalBytes } from '../storage';

describe('storage clean-up', () => {
  it('deletes only the audio waiting for speaker labels, keeping transcripts', async () => {
    const files = memoryFiles();
    const store = new SessionStore(files);
    await store.create({ id: 'a', kind: 'listen', title: 'A', startedAt: 1, hasAudio: true });
    await store.create({ id: 'b', kind: 'listen', title: 'B', startedAt: 2 });
    files.data.set('sessions/a/audio.pcm', 'pcm');
    await store.appendSegment('a', { id: 'x', speaker: null, text: 'Hi.', startMs: 0, endMs: 1, final: true });

    expect(await deleteWaitingAudio(store)).toBe(1);
    expect(files.data.has('sessions/a/audio.pcm')).toBe(false);
    expect((await store.load('a'))?.segments).toHaveLength(1);
    expect((await store.load('a'))?.hasAudio).toBe(false);

    expect(await deleteAllSessions(store)).toBe(2);
    expect(await store.list()).toEqual([]);
  });

  it('adds up what Voxa stores', () => {
    expect(totalBytes({ freeBytes: 9, packBytes: { a: 10, b: 5 }, sessionBytes: 3, audioBytes: null })).toBe(18);
  });
});

describe('model packs', () => {
  it('are valid catalogue entries, so the app keeps them', () => {
    const ids = parseCatalogue(JSON.parse(JSON.stringify(DEV_CATALOGUE))).packs.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([LISTEN_PACK, SPEAKERS_PACK]));
  });

  it('wait for Wi-Fi unless mobile data is allowed (they are tens of MB)', () => {
    const listen = DEV_CATALOGUE.packs.find((p) => p.id === LISTEN_PACK)!;
    expect(packBytes(listen)).toBeGreaterThan(40 * 1024 * 1024);
    const base = { installed: false, freeBytes: 10 * 1024 ** 3, connected: true, unmetered: false };
    expect(canDownload(listen, { ...base, allowMobileData: false })).toMatchObject({ ok: false, reason: 'wifi' });
    expect(canDownload(listen, { ...base, allowMobileData: true }).ok).toBe(true);
  });

  it('turn a missing-pack error into words', () => {
    expect(friendlyError(new Error('NEEDS_PACK:listen-en'))).toBe('Listening needs a one-time download first.');
    expect(friendlyError(new Error('The microphone is busy'))).toBe('The microphone is busy');
  });
});
