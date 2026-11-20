import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEngines } from '@/engines/provider';
import type { SpeakHandle } from '@/engines/types';
import { useVoices } from '@/features/voices/voices-store';
import {
  clampIndex,
  durationMs,
  msPerWord,
  nextSpeed,
  tokenize,
  wordAtChar,
  wordAtFraction,
  wordsForSeconds,
  type Word,
} from './playback';

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
  const [wordIndex, setWordIndex] = useState(0);

  const words = useMemo(() => tokenize(text), [text]);
  const handle = useRef<SpeakHandle | null>(null);
  const generation = useRef(0);
  // A picked voice may belong to the other engine (mock vs device); fall back to the default.
  const effectiveVoice = voiceId && byId(voiceId)?.installed ? voiceId : defaultId;

  const halt = useCallback(() => {
    generation.current++;
    handle.current?.stop();
    handle.current = null;
  }, []);

  useEffect(() => halt, [halt]);

  const startAt = useCallback(
    (from: number, atRate = rate, withVoice = effectiveVoice) => {
      halt();
      if (words.length === 0) return;
      const start = clampIndex(from, words.length);
      const offset = words[start].start;
      const gen = generation.current;
      setWordIndex(start);
      setStatus('playing');
      handle.current = engine.speak(text.slice(offset), { voiceId: withVoice, rate: atRate }, (e) => {
        if (gen !== generation.current) return;
        if (e.type === 'word') setWordIndex(wordAtChar(words, e.charStart + offset));
        if (e.type === 'end' || e.type === 'error') {
          handle.current = null;
          setStatus('idle');
          setWordIndex(0);
        }
      });
    },
    [engine, halt, words, text, rate, effectiveVoice],
  );

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

  const total = durationMs(words.length, rate);
  const position = status === 'idle' ? 0 : Math.round(wordIndex * msPerWord(rate));

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
    wordIndex,
    positionMs: position,
    durationMs: total,
    progress: total > 0 ? Math.min(1, position / total) : 0,
    toggle,
    pause,
    stop,
    seekFraction,
    skip,
  };

  return <SpeakContext.Provider value={value}>{children}</SpeakContext.Provider>;
}

export function useSpeakSession(): SpeakValue {
  const v = useContext(SpeakContext);
  if (!v) throw new Error('useSpeakSession must be used inside SpeakSessionProvider');
  return v;
}
