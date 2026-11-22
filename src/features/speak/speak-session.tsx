import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEngines } from '@/engines/provider';
import type { ExportHandle, SpeakHandle } from '@/engines/types';
import { usePrefs } from '@/features/settings/prefs';
import { useVoices } from '@/features/voices/voices-store';
import {
  clampIndex,
  durationMs,
  msPerWord,
  nextSpeed,
  wordAtChar,
  wordAtFraction,
  wordsForSeconds,
  type Word,
} from './playback';
import { File, Paths } from 'expo-file-system';
import { sayAsStore } from '@/storage';
import { deviceFiles } from '@/storage/device-files';
import { exportName } from './export-import';
import { parseScript, planFrom, scriptWords, styleSpeed, STYLES, type SayAs, type Style } from './script';

/**
 * One "Speak for me" script shared by the Editor and the Player: its text,
 * voice, speed and playback position. Pause keeps the position; changing the
 * speed or seeking while playing restarts from the current word.
 */

export type PlayStatus = 'idle' | 'playing' | 'paused';

type SpeakValue = {
  text: string;
  setText: (t: string) => void;
  title: string;
  words: Word[];
  voiceId: string;
  setVoiceId: (id: string) => void;
  rate: number;
  cycleRate: () => void;
  status: PlayStatus;
  /** Why the last play failed, shown under the script. Cleared on the next play. */
  error: string | null;
  /** Word being spoken, or where playback will resume. */
  wordIndex: number;
  positionMs: number;
  durationMs: number;
  progress: number;
  toggle: () => void;
  pause: () => void;
  stop: () => void;
  seekFraction: (f: number) => void;
  skip: (seconds: number) => void;
  /** Speaks a quick phrase now, stopping the script if it is playing. Tapping the same phrase again stops it. */
  say: (text: string) => void;
  /** The quick phrase being spoken. */
  saying: string | null;
  /** Discreet mode: earbuds or earpiece, never the loudspeaker. */
  output: 'room' | 'private';
  /** Reading style for the whole script (PRD ED-2). */
  style: Style;
  cycleStyle: () => void;
  /** "Say as" dictionary (PRD ED-3), saved on the phone. */
  sayAs: SayAs;
  /** Sets how a word is said; an empty sound removes it. */
  setSayAs: (word: string, sound: string) => Promise<void>;
  /** Speaks a word as the dictionary entry would, for trying a "Say as" sound. */
  trySound: (sound: string) => void;
  /** The voice engine can save the script as an audio file (PRD PL-2). */
  canExport: boolean;
  /** Saves the whole script as an .m4a; done resolves with the file's uri. Replaces the last export. */
  startExport: (onProgress: (fraction: number) => void) => { cancel: () => void; done: Promise<string> };
};

const SpeakContext = createContext<SpeakValue | null>(null);

export function makeTitle(text: string): string {
  const firstLine = text.trim().split(/\n/)[0] ?? '';
  const words = firstLine.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'New script';
  const t = words.slice(0, 4).join(' ');
  return words.length > 4 ? `${t}…` : t;
}

export function SpeakSessionProvider({ children }: { children: ReactNode }) {
  const { voice: engine } = useEngines();
  const { defaultId, byId } = useVoices();
  const [text, setTextState] = useState('');
  const [voiceId, setVoiceIdState] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [status, setStatus] = useState<PlayStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [saying, setSaying] = useState<string | null>(null);
  const { prefs } = usePrefs();
  const output = prefs.discreet ? 'private' : 'room';

  const [style, setStyle] = useState<Style>('neutral');
  const [sayAs, setSayAsState] = useState<SayAs>({});
  useEffect(() => {
    let alive = true;
    sayAsStore
      .load()
      .then((d) => alive && setSayAsState(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const parsed = useMemo(() => parseScript(text, style, sayAs), [text, style, sayAs]);
  const words = useMemo(() => scriptWords(text, parsed.markers), [text, parsed.markers]);
  const handle = useRef<SpeakHandle | null>(null);
  const generation = useRef(0);
  // A picked voice may belong to the other engine (mock vs device); fall back to the default.
  const effectiveVoice = voiceId && byId(voiceId)?.installed ? voiceId : defaultId;

  const halt = useCallback(() => {
    generation.current++;
    handle.current?.stop();
    handle.current = null;
    setSaying(null);
  }, []);

  useEffect(() => halt, [halt]);

  const startAt = useCallback(
    (from: number, atRate = rate, withVoice = effectiveVoice) => {
      halt();
      if (words.length === 0) return;
      const start = clampIndex(from, words.length);
      const plan = planFrom(parsed, start === 0 ? 0 : words[start].start);
      const gen = generation.current;
      setWordIndex(start);
      setError(null);
      setStatus('playing');
      handle.current = engine.speak(plan.spoken, { voiceId: withVoice, rate: atRate, output, pieces: plan.pieces }, (e) => {
        if (gen !== generation.current) return;
        if (e.type === 'word') setWordIndex(wordAtChar(words, plan.toOriginal(e.charStart)));
        if (e.type === 'error') {
          console.warn('Voxa speak failed:', e.message);
          setError(e.message);
        }
        if (e.type === 'end' || e.type === 'error') {
          handle.current = null;
          setStatus('idle');
          setWordIndex(0);
        }
      });
    },
    [engine, halt, words, parsed, rate, effectiveVoice, output],
  );

  const say = useCallback(
    (phrase: string) => {
      const same = saying === phrase;
      halt();
      if (status !== 'idle') setStatus('paused');
      if (same || !phrase.trim()) return;
      const gen = generation.current;
      setError(null);
      setSaying(phrase);
      const p = parseScript(phrase, 'neutral', sayAs);
      handle.current = engine.speak(p.spoken, { voiceId: effectiveVoice, rate, output, pieces: p.pieces }, (e) => {
        if (gen !== generation.current) return;
        if (e.type === 'error') setError(e.message);
        if (e.type === 'end' || e.type === 'error') {
          handle.current = null;
          setSaying(null);
        }
      });
    },
    [engine, halt, saying, status, effectiveVoice, rate, output, sayAs],
  );

  const trySound = useCallback(
    (sound: string) => {
      halt();
      if (status !== 'idle') setStatus('paused');
      if (!sound.trim()) return;
      handle.current = engine.speak(sound, { voiceId: effectiveVoice, rate, output }, () => {});
    },
    [engine, halt, status, effectiveVoice, rate, output],
  );

  const setSayAs = useCallback(async (word: string, sound: string) => {
    setSayAsState(await sayAsStore.set(word, sound));
  }, []);

  const pause = useCallback(() => {
    if (status !== 'playing') return;
    halt();
    setStatus('paused');
  }, [status, halt]);

  const stop = useCallback(() => {
    halt();
    setStatus('idle');
    setWordIndex(0);
  }, [halt]);

  const toggle = useCallback(() => {
    if (status === 'playing') pause();
    else startAt(status === 'paused' ? wordIndex : 0);
  }, [status, pause, startAt, wordIndex]);

  const seekFraction = useCallback(
    (f: number) => {
      const i = wordAtFraction(f, words.length);
      if (status === 'playing') startAt(i);
      else {
        setWordIndex(i);
        if (status === 'idle' && i > 0) setStatus('paused');
      }
    },
    [words.length, status, startAt],
  );

  const skip = useCallback(
    (seconds: number) => {
      const delta = wordsForSeconds(Math.abs(seconds), rate) * Math.sign(seconds);
      const i = clampIndex(wordIndex + delta, words.length);
      if (status === 'playing') startAt(i);
      else {
        setWordIndex(i);
        if (status === 'idle' && i > 0) setStatus('paused');
      }
    },
    [rate, wordIndex, words.length, status, startAt],
  );

  const cycleRate = useCallback(() => {
    const r = nextSpeed(rate);
    setRate(r);
    if (status === 'playing') startAt(wordIndex, r);
  }, [rate, status, startAt, wordIndex]);

  const setVoiceId = useCallback(
    (id: string) => {
      setVoiceIdState(id);
      if (status === 'playing') startAt(wordIndex, rate, id);
    },
    [status, startAt, wordIndex, rate],
  );

  const setText = useCallback(
    (t: string) => {
      if (status !== 'idle') stop();
      setTextState(t);
    },
    [status, stop],
  );

  const startExport = useCallback(
    (onProgress: (fraction: number) => void) => {
      const plan = planFrom(parsed, 0);
      const name = exportName(makeTitle(text));
      let handle: ExportHandle | null = null;
      let cancelled = false;
      const done = (async () => {
        if (!engine.exportAudio) throw new Error('This version of Voxa cannot save audio files');
        // Only the newest export is kept, so old files do not fill the phone.
        await deviceFiles.remove('exports');
        if (cancelled) throw new Error('Cancelled');
        handle = engine.exportAudio(plan.spoken, { voiceId: effectiveVoice, rate, pieces: plan.pieces }, `exports/${name}`, onProgress);
        await handle.done;
        return new File(Paths.document, 'voxa', 'exports', name).uri;
      })();
      return {
        cancel: () => {
          cancelled = true;
          handle?.cancel();
        },
        done,
      };
    },
    [engine, parsed, text, effectiveVoice, rate],
  );

  const cycleStyle = useCallback(() => {
    if (status !== 'idle') stop();
    setStyle((s) => STYLES[(STYLES.indexOf(s) + 1) % STYLES.length]);
  }, [status, stop]);

  const pace = rate * styleSpeed(style);
  const total = durationMs(words.length, pace) + parsed.pauseMs;
  const position = status === 'idle' ? 0 : Math.min(total, Math.round(wordIndex * msPerWord(pace) + parsed.pauseMs * (wordIndex / Math.max(1, words.length))));

  const value: SpeakValue = {
    text,
    setText,
    title: makeTitle(text),
    words,
    voiceId: effectiveVoice,
    setVoiceId,
    rate,
    cycleRate,
    status,
    error,
    wordIndex,
    positionMs: position,
    durationMs: total,
    progress: total > 0 ? Math.min(1, position / total) : 0,
    toggle,
    pause,
    stop,
    seekFraction,
    skip,
    say,
    saying,
    output,
    style,
    cycleStyle,
    sayAs,
    setSayAs,
    trySound,
    canExport: !!engine.exportAudio,
    startExport,
  };

  return <SpeakContext.Provider value={value}>{children}</SpeakContext.Provider>;
}

export function useSpeakSession(): SpeakValue {
  const v = useContext(SpeakContext);
  if (!v) throw new Error('useSpeakSession must be used inside SpeakSessionProvider');
  return v;
}
