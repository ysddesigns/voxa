/**
 * Engine interfaces. Screens only talk to these. Each has a TypeScript mock
 * (src/engines/mock) used for UI work and tests, and later a native
 * implementation in modules/voxa-engine (sherpa-onnx, ML Kit / Apple Vision, llama.rn).
 */

export type Tier = 'lite' | 'standard' | 'pro';

export type Voice = {
  id: string;
  name: string;
  tags: string[];
  /** Size on disk of the installed variant, in MB. */
  sizeMB: number;
  variant: 'lite' | 'full';
  installed: boolean;
};

export type SpeakOptions = {
  voiceId: string;
  rate?: number;
  /** "room" = phone speaker, "private" = earbuds (PRD LV-1). */
  output?: 'room' | 'private';
};

export type SpeakEvent =
  | { type: 'start' }
  | { type: 'word'; index: number; charStart: number; charEnd: number }
  | { type: 'end' }
  | { type: 'error'; message: string };

export interface SpeakHandle {
  stop(): void;
  done: Promise<void>;
}

export interface VoiceEngine {
  listVoices(): Promise<Voice[]>;
  speak(text: string, options: SpeakOptions, onEvent?: (e: SpeakEvent) => void): SpeakHandle;
}

export type TranscriptSegment = {
  id: string;
  speaker: number | null;
  text: string;
  startMs: number;
  endMs: number;
  /** Partial text is still being recognised and may change. */
  final: boolean;
};

export type ListenEvent =
  | { type: 'segment'; segment: TranscriptSegment }
  | { type: 'level'; rms: number }
  | { type: 'paused'; reason: 'user' | 'call' | 'interruption' }
  | { type: 'resumed' }
  | { type: 'error'; message: string };

export interface ListenSession {
  pause(): void;
  resume(): void;
  mark(label?: string): { atMs: number };
  stop(): Promise<TranscriptSegment[]>;
}

export interface SpeechEngine {
  start(onEvent: (e: ListenEvent) => void): Promise<ListenSession>;
}

export type ScanLine = { text: string; confidence: number; unsureWords: string[] };

export interface ScanEngine {
  recognize(imageUri: string): Promise<ScanLine[]>;
}

export type ActionItem = { text: string; owner: string | null; due: string | null; possible: boolean };

export type Summary = {
  kind: 'quick' | 'smart';
  keyPoints: { text: string; atMs: number | null; speaker: number | null }[];
  actions: ActionItem[];
};

export interface SummaryEngine {
  quick(segments: TranscriptSegment[]): Summary;
  /** Present only on tiers that can run the on-device language model. */
  smart?(segments: TranscriptSegment[]): Promise<Summary>;
}

export type Engines = {
  voice: VoiceEngine;
  speech: SpeechEngine;
  scan: ScanEngine;
  summary: SummaryEngine;
};
