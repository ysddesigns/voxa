import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEngines } from '@/engines/provider';
import type { SessionMeta, SessionStore } from '@/storage/sessions';
import { labelSession } from './label';
import { IDLE, ListenRecorder, type RecorderState } from './recorder';

/**
 * The Listen session shared by every screen (it keeps running while the user moves between tabs),
 * speaker labelling after a meeting, and sessions recovered after a crash.
 */

export type Labelling = { id: string; fraction: number; error: string | null; done: boolean };

type ListenValue = RecorderState & {
  elapsedMs: () => number;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  mark: (label?: string) => void;
  /** Resolves with the saved session's id (null when nothing was heard). */
  stop: () => Promise<string | null>;
  clearError: () => void;
  canLabel: boolean;
  labelling: Labelling | null;
  label: (id: string) => void;
  cancelLabel: () => void;
  /** Sessions found unfinished at start-up (the app was closed or crashed while listening). */
  recovered: SessionMeta[];
  dismissRecovered: () => void;
  /** Bumped whenever saved sessions change, so lists can reload. */
  version: number;
  bump: () => void;
};

const ListenContext = createContext<ListenValue | null>(null);

export function ListenSessionProvider({ children, store }: { children: ReactNode; store: SessionStore }) {
  const { speech, summary } = useEngines();
  const [state, setState] = useState<RecorderState>(IDLE);
  const [labelling, setLabelling] = useState<Labelling | null>(null);
  const [recovered, setRecovered] = useState<SessionMeta[]>([]);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const labelJob = useRef<{ cancel(): void } | null>(null);

  // The recorder belongs to one engine; a new one is made if the engine changes (Engine lab switch).
  const recorder = useMemo(() => new ListenRecorder(speech, store, setState, (s) => summary.quick(s)), [speech, store, summary]);

  useEffect(() => {
    let live = true;
    store
      .recoverUnfinished(recorder.current.sessionId ?? undefined)
      .then((found) => {
        if (!live || found.length === 0) return;
        setRecovered(found);
        setVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [store, recorder]);

  const label = useCallback(
    (id: string) => {
      if (labelJob.current) return;
      setLabelling({ id, fraction: 0, error: null, done: false });
      const job = labelSession(speech, store, id, (s) => summary.quick(s), (fraction) =>
        setLabelling((l) => (l && l.id === id ? { ...l, fraction } : l)),
      );
      labelJob.current = job;
      job.done
        .then(() => setLabelling({ id, fraction: 1, error: null, done: true }))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Could not find the speakers';
          setLabelling({ id, fraction: 0, error: /cancel/i.test(message) ? null : message, done: true });
        })
        .finally(() => {
          labelJob.current = null;
          setVersion((v) => v + 1);
        });
    },
    [speech, store, summary],
  );

  const stop = useCallback(async () => {
    const id = await recorder.stop();
    setVersion((v) => v + 1);
    // Speaker labels run straight after the meeting, while the phone is otherwise idle.
    if (id && speech.labelSpeakers) label(id);
    return id;
  }, [recorder, speech, label]);

  const value = useMemo<ListenValue>(
    () => ({
      ...state,
      elapsedMs: () => recorder.elapsedMs(),
      start: () => recorder.start(),
      pause: () => recorder.pause(),
      resume: () => recorder.resume(),
      mark: (l?: string) => {
        recorder.mark(l);
      },
      stop,
      clearError: () => setState((s) => ({ ...s, error: null })),
      canLabel: !!speech.labelSpeakers,
      labelling,
      label,
      cancelLabel: () => labelJob.current?.cancel(),
      recovered,
      dismissRecovered: () => setRecovered([]),
      version,
      bump,
    }),
    [state, recorder, stop, speech, labelling, label, recovered, version, bump],
  );

  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>;
}

export function useListen(): ListenValue {
  const value = useContext(ListenContext);
  if (!value) throw new Error('useListen must be used inside ListenSessionProvider');
  return value;
}
