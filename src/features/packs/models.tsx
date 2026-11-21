import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { VoxaEngine } from '../../../modules/voxa-engine';
import { announce } from '@/design/a11y';
import { useEngineMode } from '@/engines/provider';
import { usePrefs } from '@/features/settings/prefs';
import { LISTEN_PACK, packBytes, SPEAKERS_PACK, type Pack } from './catalogue';
import { catalogue, packService } from './packs';
import { verdictMessage } from './rules';

/**
 * Engine models that come as packs: listening (speech recognition + voice detection) and
 * speaker labels. Ready when bundled in this build or downloaded. With the mock engines
 * (Expo Go, tests, the Engine lab's mock switch) everything counts as ready.
 */

export type ModelId = 'listen' | 'speakers';

const PACK_OF: Record<ModelId, string> = { listen: LISTEN_PACK, speakers: SPEAKERS_PACK };

type Download = { fraction: number; cancel: () => void };

type ModelsValue = {
  ready: Record<ModelId, boolean>;
  /** Part of this build, so it cannot be removed. */
  bundled: Record<ModelId, boolean>;
  downloads: Partial<Record<ModelId, Download>>;
  errors: Partial<Record<ModelId, string>>;
  pack: (id: ModelId) => Pack | undefined;
  bytes: (id: ModelId) => number;
  download: (id: ModelId) => void;
  cancel: (id: ModelId) => void;
  remove: (id: ModelId) => void;
  refresh: () => void;
};

const ModelsContext = createContext<ModelsValue | null>(null);

type Status = { ready: Record<ModelId, boolean>; bundled: Record<ModelId, boolean> };

function readStatus(): Status {
  const s = VoxaEngine?.modelStatus?.();
  // Builds from before packs bundle every model.
  if (!s) return { ready: { listen: true, speakers: true }, bundled: { listen: true, speakers: true } };
  return { ready: { listen: s.listen, speakers: s.speakers }, bundled: { listen: s.bundledListen, speakers: s.bundledSpeakers } };
}

export function ModelsProvider({ children }: { children: ReactNode }) {
  const { mode } = useEngineMode();
  const { prefs } = usePrefs();
  const [status, setStatus] = useState<Status>(readStatus);
  const [downloads, setDownloads] = useState<Partial<Record<ModelId, Download>>>({});
  const [errors, setErrors] = useState<Partial<Record<ModelId, string>>>({});
  const active = useRef(new Set<ModelId>());

  const refresh = useCallback(() => setStatus(readStatus()), []);
  useEffect(() => {
    // Status can change outside this provider (Engine lab, a pack removed in Settings).
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh, mode]);

  const pack = useCallback((id: ModelId) => catalogue().packs.find((p) => p.id === PACK_OF[id]), []);

  const download = useCallback(
    (id: ModelId) => {
      const p = pack(id);
      if (!p || !packService || active.current.has(id)) return;
      const verdict = packService.check(p, prefs.allowMobileData);
      if (!verdict.ok) {
        if (verdict.reason === 'installed') refresh();
        else setErrors((e) => ({ ...e, [id]: verdictMessage(verdict) ?? 'Cannot download now' }));
        return;
      }
      active.current.add(id);
      setErrors((e) => ({ ...e, [id]: undefined }));
      const handle = packService.install(p, (fraction) => setDownloads((d) => (d[id] ? { ...d, [id]: { ...d[id]!, fraction } } : d)));
      setDownloads((d) => ({ ...d, [id]: { fraction: 0, cancel: handle.cancel } }));
      handle.done
        .then(() => {
          refresh();
          announce(`${p.name} downloaded`);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Download failed';
          if (/cancel/i.test(message)) return;
          setErrors((e) => ({ ...e, [id]: `Download failed: ${message}` }));
          announce(`Download failed: ${message}`);
        })
        .finally(() => {
          active.current.delete(id);
          setDownloads((d) => {
            const next = { ...d };
            delete next[id];
            return next;
          });
        });
    },
    [pack, prefs.allowMobileData, refresh],
  );

  const value = useMemo<ModelsValue>(() => {
    const mock = mode === 'mock';
    return {
      ready: mock ? { listen: true, speakers: true } : status.ready,
      bundled: mock ? { listen: true, speakers: true } : status.bundled,
      downloads,
      errors,
      pack,
      bytes: (id) => {
        const p = pack(id);
        return p ? packBytes(p) : 0;
      },
      download,
      cancel: (id) => downloads[id]?.cancel(),
      remove: (id) => {
        packService?.remove(PACK_OF[id]);
        refresh();
      },
      refresh,
    };
  }, [mode, status, downloads, errors, pack, download, refresh]);

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
}

export function useModels(): ModelsValue {
  const v = useContext(ModelsContext);
  if (!v) throw new Error('useModels must be used inside ModelsProvider');
  return v;
}
