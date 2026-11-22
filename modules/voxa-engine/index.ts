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
  /** The speaking voice's name, and the runner-up voice measured for comparison (Kitten nano). */
  ttsName?: string;
  compareName?: string;
  compareLoadMs?: number;
  compareFirstAudioMs?: number;
  compareRtf?: number;
  compareError?: string;
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

/** Progress and results of pack installs (see PackStore.kt). */
export type NativePackEvent =
  | { id: string; type: 'progress'; done: number; total: number }
  | { id: string; type: 'installed' | 'cancelled' }
  | { id: string; type: 'error'; message: string };

export type NativeScanLine = { text: string; confidence: number; unsureWords: string[]; top: number; left: number; block: number };

/** A button on the Listen notification. */
export type ListenAction = 'pause' | 'resume' | 'mark' | 'stop';

export type NativeSpeakerTurn = { startMs: number; endMs: number; speaker: number };

/** One listening model's run in compareAsr; error instead of the numbers when it could not run. */
export type NativeAsrCompareResult = {
  id: string;
  audioSec: number;
  text?: string;
  rtf?: number;
  loadMs?: number;
  memMb?: number;
  /** Whole-sentence models: how many VAD sentences were decoded. */
  sentences?: number;
  error?: string;
};

export type NativePackFile ={ path: string; url: string; sha256: string; bytes: number };

type VoxaEngineNative = {
  /** voice: "" for the built-in voice or a voice pack id. Does not replace a voice already loaded. */
  loadVoice(voice: string): Promise<{ sampleRate: number; numSpeakers: number; loadMs: number }>;
  /** overrides win over the English lexicon; fallbacks fill words it lacks. Values are space-separated phones. */
  speak(
    id: number,
    text: string,
    sid: number,
    speed: number,
    overrides: Record<string, string>,
    fallbacks: Record<string, string>,
    /** "" for the built-in voice, or an installed voice pack's id. */
    voice: string,
  ): void;
  stopSpeaking(): void;
  /** "room" = loudspeaker, "private" = earbuds or earpiece. Builds from 22 Nov 2026. */
  setOutput?(mode: 'room' | 'private'): void;
  requestMicPermission(): Promise<{ granted: boolean; status: string; canAskAgain?: boolean }>;
  /**
   * audioPath (builds with labelSpeakers): "" or a path inside the app's files folder, where the
   * audio is appended as 16 kHz 16-bit mono PCM. Older builds take no argument.
   */
  startListening(audioPath: string): Promise<{ loadMs: number }>;
  /** Builds with labelSpeakers resolve with the audio this run heard; older ones with null. */
  stopListening(): Promise<{ heardMs: number } | null>;
  /** Loads the listening model ahead of startListening. Builds from 22 Nov 2026. */
  loadListen?(): Promise<{ loadMs: number }>;
  /**
   * The Listen notification (Android's Live Activity): timer, listening or paused, Pause/Resume,
   * Mark and Stop buttons (sent back as onListenAction), and an optional latest sentence that never
   * shows on the lock screen. Builds from 21 Nov 2026.
   */
  showListenNotice?(title: string, paused: boolean, elapsedMs: number, caption: string): void;
  /** The session ended: the notification goes once the microphone is off. */
  endListenNotice?(): void;
  /** Speaker turns for a recording; progress arrives as onLabel events. Builds from 21 Nov 2026. */
  labelSpeakers?(audioPath: string): Promise<NativeSpeakerTurn[]>;
  cancelLabel?(): void;
  benchmark(): Promise<BenchmarkResult>;
  /**
   * Runs listening models on one recording (16 kHz 16-bit PCM inside the app's files folder) and
   * reports each model's text, speed (RTF), load time and added memory. Builds from 22 Nov 2026.
   */
  compareAsr?(
    audioPath: string,
    /** engine: "online" (default), or "moonshine" / "omnilingual" for whole-sentence models (builds from 23 Nov 2026). */
    candidates: { id: string; modelType?: string; engine?: string }[],
  ): Promise<NativeAsrCompareResult[]>;
  /** Scan text (ML Kit, offline). Builds from 22 Nov 2026. */
  recognizeText?(uri: string): Promise<NativeScanLine[]>;
  /** Listens for `minutes` with the screen allowed off; missing in builds made before 21 Nov 2026. */
  startLongTest?(minutes: number): Promise<void>;
  stopLongTest?(): void;
  longTestRunning?(): boolean;
  /** JSON lines, each a LongTestSample. */
  longTestReport?(): string[];
  /** Packs: missing in builds made before 21 Nov 2026. */
  installPack?(id: string, manifest: string, files: NativePackFile[]): void;
  cancelPack?(id: string): void;
  installedPacks?(): string[];
  packManifest?(id: string): string | null;
  deletePack?(id: string): void;
  /** Builds from 22 Nov 2026 also report what Voxa stores (bytes per pack id, sessions, meeting audio). */
  storageInfo?(): { freeBytes: number; packBytes?: Record<string, number>; sessionBytes?: number; audioBytes?: number };
  /** Which engine models are ready (bundled in the app or downloaded as packs). Builds from 22 Nov 2026. */
  modelStatus?(): { listen: boolean; speakers: boolean; bundledListen: boolean; bundledSpeakers: boolean };
  networkInfo?(): { connected: boolean; unmetered: boolean };
  /**
   * Donate your voice: records the microphone to a 16 kHz 16-bit mono WAV at `path` (inside the
   * app's files folder). Loudness arrives as onRecord. Builds from 23 Nov 2026.
   */
  startRecording?(path: string): Promise<void>;
  stopRecording?(): Promise<{ durationMs: number }>;
  /** Zips a folder inside the app's files folder into `dest`. Builds from 23 Nov 2026. */
  zipFolder?(src: string, dest: string): Promise<{ bytes: number }>;
  release(): void;
  addListener(event: 'onRecord', listener: (e: { rms: number }) => void): EventSubscription;
  addListener(event: 'onLabel', listener: (e: { fraction: number }) => void): EventSubscription;
  addListener(event: 'onPack', listener: (e: NativePackEvent) => void): EventSubscription;
  addListener(event: 'onSpeak', listener: (e: NativeSpeakEvent) => void): EventSubscription;
  addListener(event: 'onListen', listener: (e: NativeListenEvent) => void): EventSubscription;
  addListener(event: 'onLongTest', listener: (e: LongTestSample) => void): EventSubscription;
  addListener(event: 'onListenAction', listener: (e: { action: ListenAction }) => void): EventSubscription;
};

/** Null on iOS, web, Jest, and Android builds made before the module was added. */
export const VoxaEngine = requireOptionalNativeModule<VoxaEngineNative>('VoxaEngine');
