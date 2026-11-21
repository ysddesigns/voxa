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
  asrAudioSec: number;
  asrRtf: number;
  pssMb: number;
  nativeHeapMb: number;
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
  release(): void;
  addListener(event: 'onSpeak', listener: (e: NativeSpeakEvent) => void): EventSubscription;
  addListener(event: 'onListen', listener: (e: NativeListenEvent) => void): EventSubscription;
};

/** Null on iOS, web, Jest, and Android builds made before the module was added. */
export const VoxaEngine = requireOptionalNativeModule<VoxaEngineNative>('VoxaEngine');
