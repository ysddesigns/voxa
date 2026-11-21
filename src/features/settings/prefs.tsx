import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PREFS, type Prefs, type PrefsStore } from '@/storage/prefs';

type PrefsValue = { prefs: Prefs; update: (change: Partial<Prefs>) => void; loaded: boolean };

const PrefsContext = createContext<PrefsValue | null>(null);

/** Settings, loaded once from the phone and saved on every change. */
export function PrefsProvider({ children, store }: { children: ReactNode; store: PrefsStore }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    store
      .load()
      .then((p) => live && setPrefs(p))
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [store]);

  const update = useCallback(
    (change: Partial<Prefs>) =>
      setPrefs((p) => {
        const next = { ...p, ...change };
        store.save(next).catch(() => {});
        return next;
      }),
    [store],
  );

  const value = useMemo(() => ({ prefs, update, loaded }), [prefs, update, loaded]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs must be used inside PrefsProvider');
  return value;
}
