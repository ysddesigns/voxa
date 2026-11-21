import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEngines } from '@/engines/provider';
import { usePrefs } from '@/features/settings/prefs';
import type { DownloadHandle, SpeakHandle, Voice } from '@/engines/types';

/**
 * Voices: the list, the default voice, favourites, downloads and sample previews.
 * The chosen voice and favourites are saved on the phone (prefs.json).
 */

export const SAMPLE_TEXT = 'Hi, I am your Voxa voice. I can read anything you type, even with no signal.';

type VoicesValue = {
  voices: Voice[];
  loading: boolean;
  defaultId: string;
  setDefault: (id: string) => void;
  favourites: ReadonlySet<string>;
  toggleFavourite: (id: string) => void;
  /** id → 0..1 while downloading */
  downloads: Readonly<Record<string, number>>;
  download: (id: string) => void;
  cancelDownload: (id: string) => void;
  /** id → why the last download failed (not set when the person cancelled). */
  downloadErrors: Readonly<Record<string, string>>;
  previewingId: string | null;
  togglePreview: (id: string) => void;
  byId: (id: string) => Voice | undefined;
};

const VoicesContext = createContext<VoicesValue | null>(null);

export function VoicesProvider({ children }: { children: ReactNode }) {
  const { voice: engine } = useEngines();
  const [voices, setVoices] = useState<Voice[]>([]);
  // Loading until the current engine's voice list has arrived (the engine can switch at runtime).
  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  const loading = loadedFor !== engine;
  // The chosen voice and favourites are saved in prefs. Each engine has its own voices, so the
  // default falls back to the first installed one when the chosen voice is not there.
  const { prefs, update } = usePrefs();
  const chosen = prefs.voiceId;
  const defaultId = useMemo(() => {
    if (voices.some((v) => v.id === chosen && v.installed)) return chosen;
    return voices.find((v) => v.installed)?.id ?? (chosen || 'lily');
  }, [voices, chosen]);
  const setDefault = useCallback((id: string) => update({ voiceId: id }), [update]);
  const favourites = useMemo<ReadonlySet<string>>(() => new Set(prefs.favourites), [prefs.favourites]);
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const handles = useRef<Record<string, DownloadHandle>>({});
  const preview = useRef<SpeakHandle | null>(null);

  const refresh = useCallback(async () => {
    setVoices(await engine.listVoices());
    setLoadedFor(engine);
  }, [engine]);

  useEffect(() => {
    let live = true;
    engine
      .listVoices()
      .then((list) => {
        if (!live) return;
        setVoices(list);
        setLoadedFor(engine);
      })
      .catch(() => {
        if (live) setLoadedFor(engine);
      });
    const downloadsAtMount = handles.current;
    const previewAtMount = preview;
    return () => {
      live = false;
      previewAtMount.current?.stop();
      Object.values(downloadsAtMount).forEach((h) => h.cancel());
    };
  }, [engine]);

  const toggleFavourite = useCallback(
    (id: string) => {
      const next = new Set(prefs.favourites);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      update({ favourites: [...next] });
    },
    [prefs.favourites, update],
  );

  const download = useCallback(
    (id: string) => {
      if (handles.current[id]) return;
      setDownloadErrors(({ [id]: _, ...rest }) => rest);
      setDownloads((d) => ({ ...d, [id]: 0 }));
      const h = engine.downloadVoice(id, (f) => setDownloads((d) => (id in d ? { ...d, [id]: f } : d)));
      handles.current[id] = h;
      const clear = () => {
        delete handles.current[id];
        setDownloads(({ [id]: _, ...rest }) => rest);
      };
      h.done
        .then(
          () => refresh(),
          (e: unknown) => {
            const message = e instanceof Error ? e.message : String(e);
            if (!/cancel/i.test(message)) setDownloadErrors((m) => ({ ...m, [id]: message }));
          },
        )
        .then(clear, clear);
    },
    [engine, refresh],
  );

  const cancelDownload = useCallback((id: string) => handles.current[id]?.cancel(), []);

  const togglePreview = useCallback(
    (id: string) => {
      preview.current?.stop();
      preview.current = null;
      if (previewingId === id) {
        setPreviewingId(null);
        return;
      }
      setPreviewingId(id);
      const h = engine.speak(SAMPLE_TEXT, { voiceId: id }, (e) => {
        if (e.type === 'end' || e.type === 'error') {
          setPreviewingId((cur) => (cur === id ? null : cur));
          if (preview.current === h) preview.current = null;
        }
      });
      preview.current = h;
    },
    [engine, previewingId],
  );

  const value = useMemo<VoicesValue>(
    () => ({
      voices,
      loading,
      defaultId,
      setDefault,
      favourites,
      toggleFavourite,
      downloads,
      download,
      cancelDownload,
      downloadErrors,
      previewingId,
      togglePreview,
      byId: (id) => voices.find((v) => v.id === id),
    }),
    [voices, loading, defaultId, setDefault, favourites, toggleFavourite, downloads, download, cancelDownload, downloadErrors, previewingId, togglePreview],
  );

  return <VoicesContext.Provider value={value}>{children}</VoicesContext.Provider>;
}

export function useVoices(): VoicesValue {
  const v = useContext(VoicesContext);
  if (!v) throw new Error('useVoices must be used inside VoicesProvider');
  return v;
}

/** "Natural · Female · English US" */
export function voiceSubtitle(v: Voice, withSize = false): string {
  return [...v.tags, ...(withSize ? [`${v.sizeMB} MB`] : [])].join(' · ');
}

export const VOICE_FILTERS = ['All', 'Downloaded', 'Female', 'Male', 'Warm'] as const;
export type VoiceFilter = (typeof VOICE_FILTERS)[number];

export function matchesVoice(v: Voice, filter: VoiceFilter, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q && !`${v.name} ${v.tags.join(' ')}`.toLowerCase().includes(q)) return false;
  if (filter === 'All') return true;
  if (filter === 'Downloaded') return v.installed;
  return v.tags.includes(filter);
}
