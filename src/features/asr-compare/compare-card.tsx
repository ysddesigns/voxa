import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { DEV_CATALOGUE, LISTEN_PACK, packBytes } from '@/features/packs/catalogue';
import type { InstallHandle } from '@/features/packs/pack-service';
import { packService } from '@/features/packs/packs';
import { formatMB, verdictMessage } from '@/features/packs/rules';
import { deviceFiles } from '@/storage/device-files';
import { VoxaEngine, type ListenTuning, type NativeAsrCompareResult, type NativeAsrTuneResult } from '../../../modules/voxa-engine';
import { CANDIDATES, PASSAGES, percent, score, type Score } from './compare';
import { DEFAULT_TUNING, VARIANTS, describe, pickBest, sameTuning } from './tuning';

/** Inside Voxa's folder (deviceFiles paths) and the same file as the native module sees it. */
const CLIP = 'lab/compare.pcm';
const CLIP_NATIVE = `voxa/${CLIP}`;

type Result = NativeAsrCompareResult & { name: string };

/**
 * Engine lab: compare listening models on your own voice. Download the candidates, read the
 * passage once, then every downloaded model transcribes that same recording.
 */
export function AsrCompareCard({ disabled, autoTune }: { disabled?: boolean; autoTune?: boolean }) {
  const { colors } = useTheme();
  const available = !!VoxaEngine?.compareAsr && !!packService;

  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const handles = useRef<Record<string, InstallHandle>>({});

  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [heardSec, setHeardSec] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [passageId, setPassageId] = useState(PASSAGES[0].id);
  const [reference, setReference] = useState(PASSAGES[0].text);

  // Scored against the text as it is now, so a corrected passage re-scores without recording again.
  const scored = useMemo(() => {
    if (!results) return null;
    const out = results.map((r) => ({ ...r, score: r.text === undefined ? undefined : (score(reference, r.text) as Score) }));
    return out.sort((a, b) => (a.score?.wer ?? 2) - (b.score?.wer ?? 2));
  }, [results, reference]);

  const choosePassage = (id: string) => {
    const p = PASSAGES.find((x) => x.id === id);
    if (!p || recording || busy) return;
    setPassageId(id);
    setReference(p.text);
    // A recording belongs to one passage.
    setResults(null);
    setHeardSec(null);
  };
  const [error, setError] = useState<string | null>(null);

  // Live settings test: the same recording through Live's own pipeline, once per variant.
  const canTune = !!VoxaEngine?.tuneAsr;
  const [tuneResults, setTuneResults] = useState<NativeAsrTuneResult[] | null>(null);
  const [tuning, setTuning] = useState(false);
  const [liveTuning, setLiveTuning] = useState<ListenTuning | null>(() => VoxaEngine?.listenTuning?.() ?? null);
  const tuneScored = useMemo(() => {
    if (!tuneResults) return null;
    const rows = tuneResults.map((r) => {
      const v = VARIANTS.find((x) => x.id === r.id);
      const s = r.text === undefined ? undefined : score(reference, r.text);
      return { ...r, name: v?.name ?? r.id, tuning: v?.tuning ?? DEFAULT_TUNING, wer: s?.wer, werWithoutNames: s?.werWithoutNames, refWords: s?.refWords };
    });
    return { rows, best: pickBest(rows) };
  }, [tuneResults, reference]);

  const testSettings = async () => {
    if (!VoxaEngine?.tuneAsr) return;
    setTuning(true);
    setError(null);
    try {
      const raw = await VoxaEngine.tuneAsr(
        CLIP_NATIVE,
        VARIANTS.map((v) => ({ id: v.id, ...v.tuning })),
      );
      setTuneResults(raw);
      console.log(
        'VOXA_ASR_TUNE ' +
          JSON.stringify({
            passage: passageId,
            results: raw.map((r) => {
              const s = r.text === undefined ? undefined : score(reference, r.text);
              return { ...r, wer: s?.wer, werWithoutNames: s?.werWithoutNames };
            }),
          }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTuning(false);
    }
  };

  // Dev builds: voxa://engine-lab?run=tune starts the settings test on the saved recording, so it
  // can be run from a computer over USB. Results go to the log as VOXA_ASR_TUNE.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!__DEV__ || !autoTune || autoRan.current || !canTune) return;
    autoRan.current = true;
    void testSettings();
  });

  const applyToLive = (t: ListenTuning | null) => {
    if (!VoxaEngine?.setListenTuning) return;
    setLiveTuning(VoxaEngine.setListenTuning(t));
  };

  const refresh = () => {
    if (!packService) return;
    const have = packService.installed();
    if (VoxaEngine?.modelStatus?.().listen) have.add(LISTEN_PACK);
    setInstalled(have);
  };

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const own = handles.current;
    return () => {
      clearTimeout(first);
      for (const h of Object.values(own)) h.cancel();
    };
  }, []);

  useEffect(() => {
    if (!recording || !VoxaEngine) return;
    const sub = VoxaEngine.addListener('onListen', (e) => {
      if (e.type === 'level') setLevel(e.rms);
      if (e.type === 'error') setError(e.message);
    });
    return () => sub.remove();
  }, [recording]);

  const toggleDownload = (id: string) => {
    const pack = DEV_CATALOGUE.packs.find((p) => p.id === id);
    if (!pack || !packService) return;
    setMessage(null);
    const running = handles.current[id];
    if (running) {
      running.cancel();
      return;
    }
    if (installed.has(id)) {
      if (id !== LISTEN_PACK) {
        packService.remove(id);
        refresh();
      }
      return;
    }
    const verdict = packService.check(pack, false);
    if (!verdict.ok) {
      setMessage(`${pack.name}: ${verdictMessage(verdict)}`);
      return;
    }
    setProgress((p) => ({ ...p, [id]: 0 }));
    const h = packService.install(pack, (f) => setProgress((p) => ({ ...p, [id]: f })));
    handles.current[id] = h;
    h.done
      .catch((e: Error) => setMessage(`${pack.name}: ${e.message}`))
      .finally(() => {
        delete handles.current[id];
        setProgress((p) => {
          const { [id]: _, ...rest } = p;
          return rest;
        });
        refresh();
      });
  };

  const toggleRecord = async () => {
    if (!VoxaEngine) return;
    setError(null);
    if (recording) {
      const r = await VoxaEngine.stopListening();
      setRecording(false);
      setLevel(0);
      setHeardSec(r ? r.heardMs / 1000 : null);
      return;
    }
    try {
      const perm = await VoxaEngine.requestMicPermission();
      if (!perm.granted) throw new Error('Voxa needs the microphone to record the passage.');
      // The native side appends, so start from an empty file.
      await deviceFiles.remove(CLIP);
      setResults(null);
      setHeardSec(null);
      await VoxaEngine.startListening(CLIP_NATIVE);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const compare = async () => {
    if (!VoxaEngine?.compareAsr) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = CANDIDATES.filter((c) => installed.has(c.id));
      const raw = await VoxaEngine.compareAsr(
        CLIP_NATIVE,
        chosen.map((c) => ({ id: c.id, ...(c.modelType ? { modelType: c.modelType } : {}), ...(c.engine ? { engine: c.engine } : {}) })),
      );
      const out: Result[] = raw.map((r) => ({ ...r, name: CANDIDATES.find((c) => c.id === r.id)?.name ?? r.id }));
      setResults(out);
      // Easy to copy from logcat (tag ReactNativeJS) or the dev server.
      console.log(
        'VOXA_ASR_COMPARE ' +
          JSON.stringify({
            passage: passageId,
            results: out.map((r) => {
              const s = r.text === undefined ? undefined : score(reference, r.text);
              return { ...r, wer: s?.wer, werWithoutNames: s?.werWithoutNames };
            }),
          }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloaded = CANDIDATES.filter((c) => installed.has(c.id)).length;
  const row = [styles.row, { borderTopColor: colors.separator }];

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[type.caption, { color: colors.textTertiary }]}>
        Download the models to compare (Wi-Fi), read the passage aloud once at a normal pace, then compare. Every model
        transcribes the same recording, so the scores are fair. Lower word error is better.
      </Text>
      {!available && <Text style={[type.caption, { color: colors.warning }]}>This build has no comparison. Rebuild Android.</Text>}

      {CANDIDATES.map((c) => {
        const pack = DEV_CATALOGUE.packs.find((p) => p.id === c.id);
        const p = progress[c.id];
        const have = installed.has(c.id);
        const label = p !== undefined ? `Cancel ${Math.round(p * 100)}%` : have ? (c.id === LISTEN_PACK ? 'Ready' : 'Remove') : 'Download';
        return (
          <View key={c.id} style={row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.callout, { color: colors.text }]}>{c.name}</Text>
              <Text style={[type.caption, { color: colors.textTertiary }]}>
                {c.note}
                {pack && !have ? ` · ${formatMB(packBytes(pack))} download` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => toggleDownload(c.id)}
              disabled={!available || (have && c.id === LISTEN_PACK) || recording || busy}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${c.name}`}
              style={[styles.small, { backgroundColor: colors.chip, opacity: !available ? 0.4 : 1 }]}
            >
              <Text style={[type.callout, { color: colors.text }]}>{label}</Text>
            </Pressable>
          </View>
        );
      })}
      {message && <Text style={[type.caption, { color: colors.warning }]}>{message}</Text>}

      <Text style={[type.overline, { color: colors.textSecondary }]}>Language</Text>
      <View style={styles.chips}>
        {PASSAGES.map((p) => {
          const on = p.id === passageId;
          return (
            <Pressable
              key={p.id}
              onPress={() => choosePassage(p.id)}
              disabled={recording || busy}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { backgroundColor: on ? colors.accent : colors.chip }]}
            >
              <Text style={[type.callout, { color: on ? colors.onAccent : colors.text }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.overline, { color: colors.textSecondary }]}>Read this aloud</Text>
      <TextInput
        value={reference}
        onChangeText={setReference}
        multiline
        editable={!recording && !busy}
        accessibilityLabel="Passage to read"
        style={[type.body, styles.passage, { color: colors.text, borderColor: colors.separator }]}
      />
      <Text style={[type.caption, { color: colors.textTertiary }]}>
        Fix any word that is wrong for how you speak before scoring: results re-score as you edit. Only Moonshine is English only.
      </Text>
      {recording && (
        <View style={[styles.meter, { backgroundColor: colors.waveUnplayed }]}>
          <View style={[styles.meterFill, { backgroundColor: colors.accent, width: `${Math.min(100, level * 400)}%` }]} />
        </View>
      )}
      {heardSec !== null && !recording && (
        <Text style={[type.caption, { color: colors.textSecondary }]}>Recorded {heardSec.toFixed(1)} s.</Text>
      )}
      <LabButton
        label={recording ? 'Stop recording' : heardSec !== null ? 'Record again' : 'Record the passage'}
        onPress={toggleRecord}
        disabled={!available || disabled || busy || !installed.has(LISTEN_PACK)}
      />
      {!installed.has(LISTEN_PACK) && available && (
        <Text style={[type.caption, { color: colors.textTertiary }]}>Recording uses the current listening model: download it first.</Text>
      )}
      <LabButton
        label={`Compare ${downloaded} model${downloaded === 1 ? '' : 's'}`}
        onPress={compare}
        disabled={!available || recording || heardSec === null || downloaded === 0}
        busy={busy}
      />
      <LabButton
        label="Test Live settings"
        onPress={testSettings}
        disabled={!available || !canTune || recording || busy || heardSec === null || !installed.has(LISTEN_PACK)}
        busy={tuning}
      />
      {available && !canTune && <Text style={[type.caption, { color: colors.warning }]}>The settings test needs a newer build. Rebuild Android.</Text>}
      {busy && <Text style={[type.caption, { color: colors.textTertiary }]}>Loading and running each model in turn. Larger ones take a while.</Text>}
      {tuning && <Text style={[type.caption, { color: colors.textTertiary }]}>Replaying your recording through Live five ways. About a minute.</Text>}
      {error && <Text style={[type.caption, { color: colors.warning }]}>{error}</Text>}

      {tuneScored && (
        <View style={[row, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
          <Text style={[type.headline, { color: colors.text }]}>Live settings</Text>
          <Text style={[type.footnote, { color: colors.textSecondary }]}>
            Now in use: {liveTuning ? describe(liveTuning) : 'unknown'}
            {liveTuning && !sameTuning(liveTuning, DEFAULT_TUNING) ? ' (changed from the default)' : ''}
          </Text>
          {tuneScored.rows.map((r) => {
            const inUse = sameTuning(r.tuning, liveTuning);
            const best = tuneScored.best?.id === r.id;
            return (
              <View key={r.id} style={{ gap: 4 }}>
                <Text style={[type.callout, { color: colors.text }]}>
                  {r.name}
                  {best ? ' · best' : ''}
                  {inUse ? ' · in use' : ''}
                </Text>
                {r.error ? (
                  <Text style={[type.caption, { color: colors.accentText }]}>{r.error}</Text>
                ) : (
                  <>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>
                      Word error {percent(r.wer!)} · without names {percent(r.werWithoutNames!)} · speed RTF {r.rtf!.toFixed(2)} ·{' '}
                      {r.sentences} sentences · {describe(r.tuning)}
                    </Text>
                    <Text style={[type.body, { color: colors.text }]}>“{r.text || '(nothing)'}”</Text>
                    {!inUse && VoxaEngine?.setListenTuning ? (
                      <Pressable
                        onPress={() => applyToLive(r.tuning)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${r.name} for Live`}
                        style={[styles.small, { backgroundColor: best ? colors.accent : colors.chip, alignSelf: 'flex-start' }]}
                      >
                        <Text style={[type.callout, { color: best ? colors.onAccent : colors.text }]}>Use for Live</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            );
          })}
          {liveTuning && !sameTuning(liveTuning, DEFAULT_TUNING) && VoxaEngine?.setListenTuning ? (
            <Pressable onPress={() => applyToLive(null)} accessibilityRole="button" style={[styles.small, { backgroundColor: colors.chip, alignSelf: 'flex-start' }]}>
              <Text style={[type.callout, { color: colors.text }]}>Back to the default</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {scored?.map((r) => (
        <View key={r.id} style={[row, { flexDirection: 'column', gap: 4 }]}>
          <Text style={[type.callout, { color: colors.text }]}>{r.name}</Text>
          {r.error ? (
            <Text style={[type.caption, { color: colors.warning }]}>{r.error}</Text>
          ) : (
            <>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                Word error {percent(r.score!.wer)} · without names {percent(r.score!.werWithoutNames)} · speed RTF{' '}
                {r.rtf!.toFixed(2)} · load {(r.loadMs! / 1000).toFixed(1)} s · memory +{Math.round(r.memMb!)} MB
                {r.sentences !== undefined ? ` · ${r.sentences} sentences` : ''}
              </Text>
              <Text style={[type.body, { color: colors.text }]}>“{r.text || '(nothing)'}”</Text>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

function LabButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
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
  card: { borderRadius: radius.card, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  small: { minHeight: minTouch, paddingHorizontal: 14, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: minTouch + 4, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  meter: { height: 6, borderRadius: 3, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: minTouch, paddingHorizontal: 14, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  passage: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: 12, minHeight: 120, textAlignVertical: 'top' },
  meterFill: { height: 6 },
});
