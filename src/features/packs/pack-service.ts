import type { NativePackEvent, NativePackFile } from '../../../modules/voxa-engine';
import type { Pack } from './catalogue';
import { canDownload, isRetryable, retryDelayMs, type Conditions, type Verdict } from './rules';

/** The parts of the native module the service uses (modules/voxa-engine, PackStore.kt). */
export type PackNative = {
  installPack(id: string, manifest: string, files: NativePackFile[]): void;
  cancelPack(id: string): void;
  installedPacks(): string[];
  deletePack(id: string): void;
  storageInfo(): { freeBytes: number };
  networkInfo(): { connected: boolean; unmetered: boolean };
  addListener(event: 'onPack', listener: (e: NativePackEvent) => void): { remove(): void };
};

export type InstallHandle = {
  cancel(): void;
  /** Resolves when installed; rejects with the reason when cancelled or failed for good. */
  done: Promise<void>;
};

export const MAX_ATTEMPTS = 4;

export class PackService {
  constructor(
    private readonly native: PackNative,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  installed(): Set<string> {
    return new Set(this.native.installedPacks());
  }

  check(pack: Pack, allowMobileData: boolean): Verdict {
    const { freeBytes } = this.native.storageInfo();
    const { connected, unmetered } = this.native.networkInfo();
    const c: Conditions = { installed: this.installed().has(pack.id), freeBytes, connected, unmetered, allowMobileData };
    return canDownload(pack, c);
  }

  remove(id: string) {
    this.native.deletePack(id);
  }

  /**
   * Downloads and installs a pack. Network failures are retried with back-off (the native side
   * resumes partial files); a failed checksum is not, since the same bytes would fail again.
   */
  install(pack: Pack, onProgress?: (fraction: number) => void): InstallHandle {
    let cancelled = false;
    const done = (async () => {
      for (let attempt = 0; ; attempt++) {
        if (cancelled) throw new Error('Download cancelled');
        const result = await this.once(pack, onProgress);
        if (result.type === 'installed') return;
        if (result.type !== 'error' || cancelled) throw new Error('Download cancelled');
        if (!isRetryable(result.message) || attempt + 1 >= MAX_ATTEMPTS) throw new Error(result.message);
        await this.wait(retryDelayMs(attempt));
      }
    })();
    return {
      cancel: () => {
        cancelled = true;
        this.native.cancelPack(pack.id);
      },
      done,
    };
  }

  private once(pack: Pack, onProgress?: (fraction: number) => void): Promise<Exclude<NativePackEvent, { type: 'progress' }>> {
    return new Promise((resolve) => {
      const sub = this.native.addListener('onPack', (e) => {
        if (e.id !== pack.id) return;
        if (e.type === 'progress') {
          if (e.total > 0) onProgress?.(e.done / e.total);
          return;
        }
        sub.remove();
        resolve(e);
      });
      const manifest = JSON.stringify(pack);
      this.native.installPack(pack.id, manifest, pack.files);
    });
  }
}
