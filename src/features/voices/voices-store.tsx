import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEngines } from '@/engines/provider';
import type { DownloadHandle, SpeakHandle, Voice } from '@/engines/types';

/**
 * Voices: the list, the default voice, favourites, downloads and sample previews.
 * Kept in memory for now; saved to the phone with the Library work (phase 1, weeks 13–16).
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
  previewingId: string | null;
  togglePreview: (id: string) => void;
  byId: (id: string) => Voice | undefined;
};

const VoicesContext = createContext<VoicesValue | null>(null);

export function VoicesProvider({ children }: { children: ReactNode }) {
  const { voice: engine } = useEngines();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultId, setDefault] = useState('lily');
  const [favourites, setFavourites] = useState<ReadonlySet<string>>(new Set(['lily']));
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const handles = useRef<Record<string, DownloadHandle>>({});
  const preview = useRef<SpeakHandle | null>(null);

  const refresh = useCallback(async () => {
    setVoices(await engine.listVoices());
    setLoading(false);
  }, [engine]);

  useEffect(() => {
    let live = true;
    engine.listVoices().then((list) => {
      if (!live) return;
      setVoices(list);
      setLoading(false);
    });
    const downloadsAtMount = handles.current;
    const previewAtMount = preview;
    return () => {
      live = false;
      previewAtMount.current?.stop();
      Object.values(downloadsAtMount).forEach((h) => h.cancel());
    };
  }, [engine]);

  const toggleFavourite = useCallback((id: string) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const download = useCallback(
    (id: string) => {
      if (handles.current[id]) return;
      setDownloads((d) => ({ ...d, [id]: 0 }));
      const h = engine.downloadVoice(id, (f) => setDownloads((d) => (id in d ? { ...d, [id]: f } : d)));
      handles.current[id] = h;
      const clear = () => {
        delete handles.current[id];
        setDownloads(({ [id]: _, ...rest }) => rest);
      };
      h.done.then(() => refresh()).then(clear, clear);
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
      previewingId,
      togglePreview,
      byId: (id) => voices.find((v) => v.id === id),
    }),
    [voices, loading, defaultId, favourites, toggleFavourite, downloads, download, cancelDownload, previewingId, togglePreview],
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
