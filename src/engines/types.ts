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
  /** How to read each stretch of the text: style, emphasis and pauses (features/speak/script.ts). */
  pieces?: SpeakPiece[];
};

export type SpeakPiece = { start: number; end: number; speed: number; gain: number; pauseMs: number; gapMs: number };

export type SpeakEvent =
  | { type: 'start' }
  | { type: 'word'; index: number; charStart: number; charEnd: number }
  | { type: 'end' }
  | { type: 'error'; message: string };

export interface SpeakHandle {
  stop(): void;
  done: Promise<void>;
}

export interface DownloadHandle {
  cancel(): void;
  /** Resolves when the voice is installed; rejects if cancelled or failed. */
  done: Promise<void>;
}

export interface VoiceEngine {
  listVoices(): Promise<Voice[]>;
  speak(text: string, options: SpeakOptions, onEvent?: (e: SpeakEvent) => void): SpeakHandle;
  /** Downloads and installs a voice pack. onProgress gets 0..1. */
  downloadVoice(id: string, onProgress?: (fraction: number) => void): DownloadHandle;
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
  | { type: 'error'; message: string }
  /** A button on the Listen notification; the recorder carries it out. */
  | { type: 'action'; action: 'pause' | 'resume' | 'mark' | 'stop' };

export interface ListenSession {
  /** Stops the microphone; listened time stops counting until resume. */
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Listened time so far (pauses left out): the clock segments and marks use. */
  elapsedMs(): number;
  mark(label?: string): { atMs: number };
  stop(): Promise<TranscriptSegment[]>;
}

export type ListenOptions = {
  /**
   * Keep the audio here (relative to the app's documents folder) for speaker labels after the
   * meeting. Ignored by engines that cannot label speakers.
   */
  audioPath?: string;
  /** Shown on the Listen notification (Android). */
  title?: string;
  /** Put the latest sentence in the notification (never on the lock screen). */
  noticeCaptions?: boolean;
};

export type SpeakerTurn = { startMs: number; endMs: number; speaker: number };

export interface SpeechEngine {
  start(onEvent: (e: ListenEvent) => void, options?: ListenOptions): Promise<ListenSession>;
  /** Loads the listening model in the background so start() is quick. Errors are ignored: start() reports them. */
  warmUp?(): void;
  /** Present when this engine can find who spoke when in a recording made with audioPath. */
  labelSpeakers?(audioPath: string, onProgress?: (fraction: number) => void): { cancel(): void; done: Promise<SpeakerTurn[]> };
}

export type ScanLine = {
  text: string;
  confidence: number;
  unsureWords: string[];
  /** Lines with the same number belong to one paragraph (text block). */
  paragraph?: number;
};

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
