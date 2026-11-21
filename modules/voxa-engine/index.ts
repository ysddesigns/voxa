import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/** Raw events from the native module. src/engines/native turns them into the app's engine types. */
export type NativeSpeakEvent =
  | { id: number; type: 'start' | 'end' }
  | { id: number; type: 'word'; index: number; charStart: number; charEnd: number }
  | { id: number; type: 'metrics'; firstAudioMs: number }
  /** Words the voice could not pronounce (not in the lexicon, no rule matched). */
  | { id: number; type: 'skipped'; words: string[] }
  | { id: number; type: 'error'; message: string };

export type NativeListenEvent =
  | { type: 'level'; rms: number }
  | { type: 'segment'; index: number; text: string; startMs: number; endMs: number; final: boolean }
  | { type: 'error'; message: string };

export type BenchmarkResult = {
  device: string;
  android: string;
  abi: string;
  cores: number;
  ttsCold: boolean;
  ttsLoadMs: number;
  ttsVoices: number;
  ttsFirstAudioMs: number;
  ttsGenMs: number;
  ttsAudioSec: number;
  ttsRtf: number;
  asrCold: boolean;
  asrLoadMs: number;
  asrText: string;
  /** asrText after the punctuation model, and how long that took. Builds from 21 Nov 2026. */
  asrPunctuated?: string;
  punctMs?: number;
  asrAudioSec: number;
  asrRtf: number;
  /** Silero VAD over the listen clip. Missing in builds made before 21 Nov 2026. */
  vadLoadMs?: number;
  vadRtf?: number;
  vadSegments?: number;
  vadSpeechSec?: number;
  /** Memory split: the app before any model, then what each model adds (MB). Builds from 21 Nov 2026. */
  basePssMb?: number;
  ttsMemMb?: number;
  asrMemMb?: number;
  diarMemMb?: number;
  ttsThreads?: number;
  /** Piper (Amy low, int8) for comparison with Kitten; benchmark only. */
  piperLoadMs?: number;
  piperFirstAudioMs?: number;
  piperRtf?: number;
  piperError?: string;
  /** Speaker labels on a four-speaker clip, and memory with every model loaded. */
  diarLoadMs?: number;
  diarAudioSec?: number;
  diarRtf?: number;
  diarSpeakers?: number;
  diarTurns?: number;
  peakPssMb?: number;
  pssMb: number;
  nativeHeapMb: number;
};

/** One line of the screen-off test log: a sample each minute, then a last line with done = true. */
export type LongTestSample = {
  min: number;
  battery: number;
  tempC: number;
  charging: boolean;
  screenOffMin: number;
  pssMb: number;
  words: number;
  /** Decode time / audio time over the last minute (0 on the first line). */
  rtf: number;
  /** Share of the last minute the recognizer ran; the rest was silence skipped by the VAD. */
  speechShare?: number;
  minutes?: number;
  done?: boolean;
  reason?: string;
};

type VoxaEngineNative = {
  loadVoice(): Promise<{ sampleRate: number; numSpeakers: number; loadMs: number }>;
  /** overrides win over the English lexicon; fallbacks fill words it lacks. Values are space-separated phones. */
  speak(id: number, text: string, sid: number, speed: number, overrides: Record<string, string>, fallbacks: Record<string, string>): void;
  stopSpeaking(): void;
  requestMicPermission(): Promise<{ granted: boolean; status: string; canAskAgain?: boolean }>;
  startListening(): Promise<{ loadMs: number }>;
  stopListening(): Promise<void>;
  benchmark(): Promise<BenchmarkResult>;
  /** Listens for `minutes` with the screen allowed off; missing in builds made before 21 Nov 2026. */
  startLongTest?(minutes: number): Promise<void>;
  stopLongTest?(): void;
  longTestRunning?(): boolean;
  /** JSON lines, each a LongTestSample. */
  longTestReport?(): string[];
  release(): void;
  addListener(event: 'onSpeak', listener: (e: NativeSpeakEvent) => void): EventSubscription;
  addListener(event: 'onListen', listener: (e: NativeListenEvent) => void): EventSubscription;
  addListener(event: 'onLongTest', listener: (e: LongTestSample) => void): EventSubscription;
};

/** Null on iOS, web, Jest, and Android builds made before the module was added. */
export const VoxaEngine = requireOptionalNativeModule<VoxaEngineNative>('VoxaEngine');
