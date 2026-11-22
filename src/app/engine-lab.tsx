import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { nativeBenchmark } from '@/engines/native';
import { AsrCompareCard } from '@/features/asr-compare/compare-card';
import { parseLongTest, summarizeLongTest, type LongTestSummary } from '@/engines/native/long-test';
import { DEV_CATALOGUE } from '@/features/packs/catalogue';
import { packService } from '@/features/packs/packs';
import type { InstallHandle } from '@/features/packs/pack-service';
import { formatMB, verdictMessage } from '@/features/packs/rules';
import { useEngineMode, useEngines } from '@/engines/provider';
import type { ListenSession, SpeakHandle, TranscriptSegment } from '@/engines/types';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { useVoices } from '@/features/voices/voices-store';
import { VoxaEngine, type BenchmarkResult } from '../../modules/voxa-engine';

/**
 * Engine lab (internal): switch between the on-device engines and the mocks, run the
 * engine benchmark, and try speaking and listening. Opened from the Home avatar.
 */

const LONG_TEST_MINUTES = 60;

const TEST_PACK = DEV_CATALOGUE.packs.find((p) => p.kind === 'test')!;

function longTestRows(s: LongTestSummary): Row[] {
  const n = (x: number, d = 0) => x.toFixed(d);
  return [
    { label: 'Ran', value: `${n(s.minutes, 1)} min · screen off ${n(s.screenOffMinutes, 1)} min${s.done ? ` · ${s.reason}` : ' · running'}` },
    {
      label: 'Battery',
      value: s.charged
        ? `Charged during the test, battery figures not valid`
        : `${s.batteryUsed}% used${s.batteryPerHour === null ? '' : ` · ${n(s.batteryPerHour, 1)}% per hour`}`,
      ok: s.charged ? false : undefined,
    },
    { label: 'Hottest', value: `${n(s.maxTempC, 1)} °C` },
    { label: 'Peak memory', value: `${Math.round(s.peakMemoryMb)} MB`, ok: s.peakMemoryMb <= TARGETS.pssMb },
    {
      label: 'Listen speed (RTF)',
      value: s.avgRtf === null ? 'after the first minute' : `average ${s.avgRtf.toFixed(2)} · worst ${s.worstRtf!.toFixed(2)}`,
      ok: s.worstRtf === null ? undefined : s.worstRtf <= TARGETS.rtf,
    },
    { label: 'Words heard', value: String(s.words) },
    ...(s.speechShare === null ? [] : [{ label: 'Recognizer ran', value: `${Math.round(s.speechShare * 100)}% of the time (silence skipped)` }]),
  ];
}

const SAMPLE = 'Good morning. This voice runs on your phone, with no internet. Every word lights up as it is spoken.';

// Spike targets for a 2 GB phone. Tune once the closed beta has real devices.
// modelsMb is the Phase 0 gate (under 300 MB for the models); pssMb is the whole debug app.
const TARGETS = { rtf: 0.5, firstAudioMs: 1000, pssMb: 400, modelsMb: 300 };

type Row = { label: string; value: string; ok?: boolean };

function rows(r: BenchmarkResult): Row[] {
  const ms = (n: number) => `${Math.round(n)} ms`;
  return [
    { label: 'Phone', value: `${r.device} · Android ${r.android} · ${r.abi} · ${r.cores} cores` },
    ...(r.ttsName ? [{ label: 'Voice', value: r.ttsName }] : []),
    { label: 'Voice load', value: `${ms(r.ttsLoadMs)}${r.ttsCold ? '' : ' (already loaded)'}` },
    { label: 'Voices in model', value: String(r.ttsVoices) },
    { label: 'First audio (short sentence)', value: ms(r.ttsFirstAudioMs), ok: r.ttsFirstAudioMs <= TARGETS.firstAudioMs },
    { label: 'Voice speed (RTF)', value: `${r.ttsRtf.toFixed(2)} · ${ms(r.ttsGenMs)} for ${r.ttsAudioSec.toFixed(1)} s`, ok: r.ttsRtf <= TARGETS.rtf },
    ...(r.compareError
      ? [{ label: `${r.compareName ?? 'Other voice'} (compare)`, value: r.compareError, ok: false }]
      : r.compareRtf === undefined
        ? []
        : [
            {
              label: `${r.compareName ?? 'Other voice'} (compare)`,
              value: `RTF ${r.compareRtf.toFixed(2)} · first audio ${ms(r.compareFirstAudioMs ?? 0)} · load ${ms(r.compareLoadMs ?? 0)}`,
              ok: r.compareRtf <= TARGETS.rtf,
            },
          ]),
    { label: 'Listen load', value: `${ms(r.asrLoadMs)}${r.asrCold ? '' : ' (already loaded)'}` },
    { label: 'Listen speed (RTF)', value: `${r.asrRtf.toFixed(2)} for ${r.asrAudioSec.toFixed(1)} s`, ok: r.asrRtf <= TARGETS.rtf },
    { label: 'Heard', value: `“${r.asrPunctuated ?? r.asrText.toLowerCase()}”` },
    ...(r.punctMs === undefined ? [] : [{ label: 'Punctuation', value: `${Math.round(r.punctMs)} ms per sentence` }]),
    ...(r.vadRtf === undefined
      ? []
      : [
          {
            label: 'Speech detector (VAD)',
            value: `RTF ${r.vadRtf.toFixed(3)} · ${r.vadSegments} part(s), ${r.vadSpeechSec?.toFixed(1)} s speech · load ${ms(r.vadLoadMs ?? 0)}`,
            ok: r.vadRtf <= TARGETS.rtf,
          },
        ]),
    ...(r.diarRtf === undefined
      ? []
      : [
          {
            label: 'Speaker labels',
            value: `RTF ${r.diarRtf.toFixed(2)} for ${r.diarAudioSec?.toFixed(0)} s · found ${r.diarSpeakers} of 4 speakers · load ${ms(r.diarLoadMs ?? 0)}`,
            ok: r.diarRtf <= 1 && r.diarSpeakers === 4,
          },
        ]),
    ...(r.basePssMb === undefined
      ? []
      : [
          {
            label: 'Memory per model',
            value: `app ${Math.round(r.basePssMb)} MB · voice +${Math.round(r.ttsMemMb ?? 0)} · listen +${Math.round(r.asrMemMb ?? 0)} · speakers +${Math.round(r.diarMemMb ?? 0)}`,
            ok: (r.ttsMemMb ?? 0) + (r.asrMemMb ?? 0) + (r.diarMemMb ?? 0) <= TARGETS.modelsMb,
          },
        ]),
    ...(r.peakPssMb === undefined
      ? []
      : [{ label: 'Peak memory (all models)', value: `${Math.round(r.peakPssMb)} MB`, ok: r.peakPssMb <= TARGETS.pssMb }]),
    { label: 'Memory after (PSS)', value: `${Math.round(r.pssMb)} MB · native heap ${Math.round(r.nativeHeapMb)} MB`, ok: r.pssMb <= TARGETS.pssMb },
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

  const longTestAvailable = !!VoxaEngine?.startLongTest;
  const [longRunning, setLongRunning] = useState(false);
  const [longSummary, setLongSummary] = useState<LongTestSummary | null>(null);
  const [longError, setLongError] = useState<string | null>(null);

  const refreshLongTest = () => {
    if (!VoxaEngine?.longTestReport) return;
    setLongRunning(VoxaEngine.longTestRunning?.() ?? false);
    const lines = VoxaEngine.longTestReport();
    setLongSummary(summarizeLongTest(parseLongTest(lines)));
    if (__DEV__ && lines.length) console.log('VOXA_LONG_TEST ' + lines[lines.length - 1]);
  };

  // Show the last test on open, and keep the numbers fresh while one runs.
  useEffect(() => {
    const first = setTimeout(refreshLongTest, 0);
    const timer = setInterval(refreshLongTest, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const toggleLongTest = async () => {
    if (!VoxaEngine?.startLongTest) return;
    setLongError(null);
    if (longRunning) {
      VoxaEngine.stopLongTest?.();
      setTimeout(refreshLongTest, 1500);
      return;
    }
    try {
      const perm = await VoxaEngine.requestMicPermission();
      if (!perm.granted) throw new Error('Voxa needs the microphone for this test.');
      await VoxaEngine.startLongTest(LONG_TEST_MINUTES);
      setLongRunning(true);
      setTimeout(refreshLongTest, 1000);
    } catch (e) {
      setLongError(e instanceof Error ? e.message : String(e));
    }
  };

  // Downloads: one small real file, to try resume, checksum and install on the phone.
  const [packStatus, setPackStatus] = useState<{ installed: boolean; free: string; network: string } | null>(null);
  const [packProgress, setPackProgress] = useState<number | null>(null);
  const [packMessage, setPackMessage] = useState<string | null>(null);
  const packHandle = useRef<InstallHandle | null>(null);

  const refreshPack = () => {
    if (!packService || !VoxaEngine?.storageInfo || !VoxaEngine.networkInfo) return;
    const net = VoxaEngine.networkInfo();
    setPackStatus({
      installed: packService.installed().has(TEST_PACK.id),
      free: formatMB(VoxaEngine.storageInfo().freeBytes),
      network: !net.connected ? 'offline' : net.unmetered ? 'Wi-Fi' : 'mobile data',
    });
  };

  useEffect(() => {
    const first = setTimeout(refreshPack, 0);
    return () => {
      clearTimeout(first);
      packHandle.current?.cancel();
    };
  }, []);

  const togglePack = () => {
    if (!packService) return;
    setPackMessage(null);
    if (packHandle.current) {
      packHandle.current.cancel();
      return;
    }
    if (packStatus?.installed) {
      packService.remove(TEST_PACK.id);
      refreshPack();
      return;
    }
    const verdict = packService.check(TEST_PACK, false);
    if (!verdict.ok) {
      setPackMessage(verdictMessage(verdict));
      return;
    }
    setPackProgress(0);
    const h = packService.install(TEST_PACK, setPackProgress);
    packHandle.current = h;
    h.done
      .then(
        () => setPackMessage('Installed and checked (SHA-256 matches).'),
        (e: Error) => setPackMessage(e.message),
      )
      .finally(() => {
        packHandle.current = null;
        setPackProgress(null);
        refreshPack();
      });
  };

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
      const result = await nativeBenchmark();
      setBench(result);
      // Shows in the dev server's terminal, so results can be copied without a screenshot.
      if (__DEV__) console.log('VOXA_BENCHMARK ' + JSON.stringify(result));
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
        Internal test build. The device voice reads English words from a dictionary, and Yoruba, Igbo and Hausa words from spelling rules. Words it still cannot say are skipped.
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
          Loads every model, speaks a test sentence, transcribes a test clip and labels the speakers in a four-person clip. Takes up to a minute the first time.
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

      {/* Screen-off test */}
      <Text style={[type.overline, { color: colors.textSecondary }]}>60-minute screen-off test</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[type.caption, { color: colors.textTertiary }]}>
          Listens for an hour like a meeting, with the screen off. Unplug the charger, start the test, lock the phone and
          leave it near people talking (or a radio). Results update here every minute and stay after the test.
        </Text>
        <Button
          label={longRunning ? 'Stop test' : longSummary ? 'Start a new test' : 'Start test'}
          onPress={toggleLongTest}
          disabled={!longTestAvailable || listening}
        />
        {!longTestAvailable && (
          <Text style={[type.caption, { color: colors.warning }]}>This build has no screen-off test. Rebuild Android.</Text>
        )}
        {longError && <Text style={[type.caption, { color: colors.warning }]}>{longError}</Text>}
        {longSummary &&
          longTestRows(longSummary).map((r) => (
            <View key={r.label} style={[styles.row, { borderTopColor: colors.separator }]}>
              <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>{r.label}</Text>
              <Text style={[type.callout, { color: colors.text, flex: 1.4, textAlign: 'right' }]}>
                {r.value}
                {r.ok === undefined ? '' : r.ok ? '  ✓' : '  ✗'}
              </Text>
            </View>
          ))}
      </View>

      {/* Listening models */}
      <Text style={[type.overline, { color: colors.textSecondary }]}>Compare listening models</Text>
      <AsrCompareCard disabled={listening || longRunning} />

      {/* Downloads */}
      <Text style={[type.overline, { color: colors.textSecondary }]}>Downloads</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[type.caption, { color: colors.textTertiary }]}>
          Tries the pack downloader with one small real file ({TEST_PACK.licence}, {formatMB(TEST_PACK.files[0].bytes)}).
          Cancel halfway and start again: it should carry on from where it stopped.
        </Text>
        {packStatus && (
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {packStatus.installed ? 'Installed' : 'Not installed'} · {packStatus.free} free · {packStatus.network}
          </Text>
        )}
        <Button
          label={packProgress !== null ? `Cancel (${Math.round(packProgress * 100)}%)` : packStatus?.installed ? 'Remove test pack' : 'Download test pack'}
          onPress={togglePack}
          disabled={!packService}
        />
        {!packService && <Text style={[type.caption, { color: colors.warning }]}>This build has no downloader. Rebuild Android.</Text>}
        {packMessage && <Text style={[type.caption, { color: colors.textSecondary }]}>{packMessage}</Text>}
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
        <Button label={listening ? 'Stop' : 'Start listening'} onPress={toggleListen} disabled={longRunning} />
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
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  meter: { height: 6, borderRadius: 3, overflow: 'hidden' },
  meterFill: { height: 6 },
});
