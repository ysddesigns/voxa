import type { NativePackEvent } from '../../../../modules/voxa-engine';
import { parseCatalogue } from '../catalogue';
import { MAX_ATTEMPTS, PackService, type PackNative } from '../pack-service';

const MB = 1024 * 1024;
const pack = parseCatalogue({
  packs: [{ id: 'amara-low', kind: 'voice', name: 'Amara', licence: 'Voxa', files: [{ path: 'model.onnx', url: 'https://cdn.example/m', sha256: 'b'.repeat(64), bytes: 20 * MB }] }],
}).packs[0];

/** A fake native module: each installPack call plays the next script of events. */
function fakeNative(scripts: NativePackEvent['type'][][], extra: Partial<PackNative> = {}) {
  const listeners = new Set<(e: NativePackEvent) => void>();
  const installed: string[] = [];
  const calls: string[] = [];
  const native: PackNative = {
    installPack(id) {
      calls.push(`install ${id}`);
      const script = scripts.shift() ?? [];
      queueMicrotask(() => {
        for (const type of script) {
          const e =
            type === 'progress'
              ? { id, type, done: 10 * MB, total: 20 * MB }
              : type === 'error'
                ? { id, type, message: script.includes('installed') ? '' : 'Server answered 503 for model.onnx' }
                : { id, type };
          if (type === 'installed') installed.push(id);
          listeners.forEach((l) => l(e as NativePackEvent));
        }
      });
    },
    cancelPack: (id) => calls.push(`cancel ${id}`),
    installedPacks: () => installed,
    deletePack: (id) => calls.push(`delete ${id}`),
    storageInfo: () => ({ freeBytes: 4000 * MB }),
    networkInfo: () => ({ connected: true, unmetered: true }),
    addListener: (_e, l) => {
      listeners.add(l);
      return { remove: () => listeners.delete(l) };
    },
    ...extra,
  };
  return { native, calls, installed };
}

const noWait = () => Promise.resolve();

describe('pack service', () => {
  it('installs and reports progress', async () => {
    const { native } = fakeNative([['progress', 'installed']]);
    const svc = new PackService(native, noWait);
    const seen: number[] = [];
    await svc.install(pack, (f) => seen.push(f)).done;
    expect(seen).toEqual([0.5]);
    expect(svc.installed().has('amara-low')).toBe(true);
    expect(svc.check(pack, false)).toEqual({ ok: false, reason: 'installed' });
  });

  it('retries a dropped connection, then succeeds', async () => {
    const { native, calls } = fakeNative([['progress', 'error'], ['error'], ['installed']]);
    await new PackService(native, noWait).install(pack).done;
    expect(calls.filter((c) => c.startsWith('install'))).toHaveLength(3);
  });

  it('gives up after a few tries', async () => {
    const { native, calls } = fakeNative(Array.from({ length: 10 }, () => ['error']));
    await expect(new PackService(native, noWait).install(pack).done).rejects.toThrow('503');
    expect(calls.filter((c) => c.startsWith('install'))).toHaveLength(MAX_ATTEMPTS);
  });

  it('does not retry a file that failed its checksum', async () => {
    const listeners = new Set<(e: NativePackEvent) => void>();
    const { native, calls } = fakeNative([], {
      installPack: (id) => {
        calls.push(`install ${id}`);
        queueMicrotask(() => listeners.forEach((l) => l({ id, type: 'error', message: 'model.onnx failed its checksum' })));
      },
      addListener: (_e, l) => {
        listeners.add(l);
        return { remove: () => listeners.delete(l) };
      },
    });
    await expect(new PackService(native, noWait).install(pack).done).rejects.toThrow('checksum');
    expect(calls).toEqual(['install amara-low']);
  });

  it('stops when cancelled', async () => {
    const { native, calls } = fakeNative([['cancelled']]);
    const h = new PackService(native, noWait).install(pack);
    h.cancel();
    await expect(h.done).rejects.toThrow('cancelled');
    expect(calls).toContain('cancel amara-low');
  });

  it('checks space and network before downloading', () => {
    const { native } = fakeNative([], { storageInfo: () => ({ freeBytes: 50 * MB }) });
    expect(new PackService(native, noWait).check(pack, false)).toMatchObject({ ok: false, reason: 'storage' });
    const { native: mobile } = fakeNative([], { networkInfo: () => ({ connected: true, unmetered: false }) });
    expect(new PackService(mobile, noWait).check(pack, false)).toMatchObject({ ok: false, reason: 'wifi' });
    expect(new PackService(mobile, noWait).check(pack, true)).toMatchObject({ ok: true });
  });
});
