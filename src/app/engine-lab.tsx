import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { nativeBenchmark } from '@/engines/native';
import { useEngineMode, useEngines } from '@/engines/provider';
import type { ListenSession, SpeakHandle, TranscriptSegment } from '@/engines/types';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { useVoices } from '@/features/voices/voices-store';
import type { BenchmarkResult } from '../../modules/voxa-engine';

/**
 * Engine lab (internal): switch between the on-device engines and the mocks, run the
 * engine benchmark, and try speaking and listening. Opened from the Home avatar.
 */

const SAMPLE = 'Good morning. This voice runs on your phone, with no internet. Every word lights up as it is spoken.';

// Spike targets for a 2 GB phone. Tune once the closed beta has real devices.
const TARGETS = { rtf: 0.5, firstAudioMs: 1000, pssMb: 400 };

type Row = { label: string; value: string; ok?: boolean };

function rows(r: BenchmarkResult): Row[] {
  const ms = (n: number) => `${Math.round(n)} ms`;
  return [
    { label: 'Phone', value: `${r.device} · Android ${r.android} · ${r.abi} · ${r.cores} cores` },
    { label: 'Voice load', value: `${ms(r.ttsLoadMs)}${r.ttsCold ? '' : ' (already loaded)'}` },
    { label: 'Voices in model', value: String(r.ttsVoices) },
    { label: 'First audio (short sentence)', value: ms(r.ttsFirstAudioMs), ok: r.ttsFirstAudioMs <= TARGETS.firstAudioMs },
    { label: 'Voice speed (RTF)', value: `${r.ttsRtf.toFixed(2)} · ${ms(r.ttsGenMs)} for ${r.ttsAudioSec.toFixed(1)} s`, ok: r.ttsRtf <= TARGETS.rtf },
    { label: 'Listen load', value: `${ms(r.asrLoadMs)}${r.asrCold ? '' : ' (already loaded)'}` },
    { label: 'Listen speed (RTF)', value: `${r.asrRtf.toFixed(2)} for ${r.asrAudioSec.toFixed(1)} s`, ok: r.asrRtf <= TARGETS.rtf },
    { label: 'Heard', value: `“${r.asrText.toLowerCase()}”` },
    { label: 'Memory (PSS)', value: `${Math.round(r.pssMb)} MB · native heap ${Math.round(r.nativeHeapMb)} MB`, ok: r.pssMb <= TARGETS.pssMb },
  ];
}

export default function EngineLab() {
  const { colors } = useTheme();
  const { mode, setMode, deviceAvailable } = useEngineMode();
  const engines = useEngines();
  const { voices, defaultId, loading } = useVoices();
  const installed = voices.filter((v) => v.installed);

  const [bench, setBench] = useState<BenchmarkResult | null>(null);
  const [benchBusy, setBenchBusy] = useState(false);
  const [benchError, setBenchError] = useState<string | null>(null);

  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [spokenWord, setSpokenWord] = useState(-1);
  const speakRef = useRef<SpeakHandle | null>(null);

  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [listenError, setListenError] = useState<string | null>(null);
  const listenRef = useRef<ListenSession | null>(null);

  const chosen = voiceId && installed.some((v) => v.id === voiceId) ? voiceId : defaultId;
  const words = SAMPLE.split(/\s+/);

  useEffect(
    () => () => {
      speakRef.current?.stop();
      listenRef.current?.stop();
    },
    [],
  );

  const runBench = async () => {
    if (!nativeBenchmark) return;
    setBenchBusy(true);
    setBenchError(null);
    try {
      setBench(await nativeBenchmark());
    } catch (e) {
      setBenchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBenchBusy(false);
    }
  };

  const toggleSpeak = () => {
    if (speaking) {
      speakRef.current?.stop();
      speakRef.current = null;
      setSpeaking(false);
      setSpokenWord(-1);
      return;
    }
    setSpeaking(true);
    const h = engines.voice.speak(SAMPLE, { voiceId: chosen }, (e) => {
      if (e.type === 'word') setSpokenWord(e.index);
      if (e.type === 'end' || e.type === 'error') {
        setSpeaking(false);
        setSpokenWord(-1);
      }
    });
    speakRef.current = h;
  };

  const toggleListen = async () => {
    if (listening) {
      const finals = (await listenRef.current?.stop()) ?? [];
      listenRef.current = null;
      setListening(false);
      setLevel(0);
      setSegments(finals);
      return;
    }
    setListenError(null);
    setSegments([]);
    try {
      listenRef.current = await engines.speech.start((e) => {
        if (e.type === 'level') setLevel(e.rms);
        if (e.type === 'error') setListenError(e.message);
        if (e.type === 'segment') {
          setSegments((prev) => {
            const rest = prev.filter((s) => s.id !== e.segment.id);
            return [...rest, e.segment].sort((a, b) => a.startMs - b.startMs);
          });
        }
      });
      setListening(true);
    } catch (e) {
      setListenError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={[type.title, { color: colors.text }]} accessibilityRole="header">
        Engine lab
      </Text>
      <Text style={[type.caption, { color: colors.textTertiary }]}>
        Internal test build. The device voice reads words from an English dictionary: words it does not know, like many names, are skipped for now.
      </Text>

      {/* Engine switch */}
      <Text style={[type.overline, { color: colors.textSecondary }]}>Engine</Text>
      <View style={[styles.segment, { backgroundColor: colors.chip }]} accessibilityRole="radiogroup">
        {(['device', 'mock'] as const).map((m) => {
          const on = mode === m;
          const off = m === 'device' && !deviceAvailable;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              disabled={off}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: off }}
              style={[styles.segmentItem, on && { backgroundColor: colors.card }, off && { opacity: 0.4 }]}
            >
              <Text style={[type.callout, { color: colors.text }]}>{m === 'device' ? 'On this phone' : 'Mock'}</Text>
            </Pressable>
          );
        })}
      </View>
      {!deviceAvailable && (
        <Text style={[type.caption, { color: colors.warning }]}>
          This build has no on-device engine. Run scripts/fetch-engine.ps1, then rebuild Android with -Prebuild.
        </Text>
      )}

      {/* Benchmark */}
      <Text style={[type.overline, { color: colors.textSecondary }]}>Benchmark</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[type.caption, { color: colors.textTertiary }]}>
          Loads both models, speaks a test sentence and transcribes a test clip. Takes a few seconds the first time.
        </Text>
        <Button label={bench ? 'Run again' : 'Run benchmark'} onPress={runBench} disabled={!nativeBenchmark} busy={benchBusy} />
        {benchError && <Text style={[type.caption, { color: colors.warning }]}>{benchError}</Text>}
        {bench &&
          rows(bench).map((r) => (
            <View key={r.label} style={[styles.row, { borderTopColor: colors.separator }]}>
              <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>{r.label}</Text>
              <Text style={[type.callout, { color: colors.text, flex: 1.4, textAlign: 'right' }]}>
                {r.value}
                {r.ok === undefined ? '' : r.ok ? '  ✓' : '  ✗'}
              </Text>
            </View>
          ))}
        {bench && (
          <Text style={[type.caption, { color: colors.textTertiary }]}>
            ✓ = within spike target (RTF ≤ {TARGETS.rtf}, first audio ≤ {TARGETS.firstAudioMs} ms, memory ≤ {TARGETS.pssMb} MB).
          </Text>
        )}
      </View>

      {/* Speak */}
      <Text style={[type.overline, { color: colors.textSecondary }]}>Speak</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <View style={styles.chips}>
            {installed.map((v) => {
              const on = v.id === chosen;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setVoiceId(v.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.chip, { backgroundColor: on ? colors.accent : colors.chip }]}
                >
                  <Text style={[type.callout, { color: on ? colors.onAccent : colors.text }]}>{v.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Text style={[type.body, { color: colors.text }]}>
          {words.map((w, i) => (
            <Text key={i} style={i === spokenWord ? { backgroundColor: colors.highlight } : undefined}>
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </Text>
          ))}
        </Text>
        <Button label={speaking ? 'Stop' : 'Speak'} onPress={toggleSpeak} disabled={loading || installed.length === 0} />
      </View>

      {/* Listen */}
      <Text style={[type.overline, { color: colors.textSecondary }]}>Listen</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={[styles.meter, { backgroundColor: colors.waveUnplayed }]}>
          <View style={[styles.meterFill, { backgroundColor: colors.accent, width: `${Math.min(100, level * 400)}%` }]} />
        </View>
        {segments.length === 0 ? (
          <Text style={[type.caption, { color: colors.textTertiary }]}>
            {listening ? 'Listening… say something.' : 'Tap Start and speak in English.'}
          </Text>
        ) : (
          segments.map((s) => (
            <Text key={s.id} style={[type.body, { color: s.final ? colors.text : colors.textTertiary }]}>
              {s.text}
            </Text>
          ))
        )}
        {listenError && <Text style={[type.caption, { color: colors.warning }]}>{listenError}</Text>}
        <Button label={listening ? 'Stop' : 'Start listening'} onPress={toggleListen} />
      </View>
    </ScrollView>
  );
}

function Button({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
    >
      {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  card: { borderRadius: radius.card, padding: 16, gap: 12 },
  segment: { flexDirection: 'row', borderRadius: radius.card, padding: 4 },
  segmentItem: { flex: 1, minHeight: minTouch, borderRadius: radius.card - 4, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: minTouch + 4, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  meter: { height: 6, borderRadius: 3, overflow: 'hidden' },
  meterFill: { height: 6 },
});
