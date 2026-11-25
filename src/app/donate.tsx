import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Icon } from '@/components/icons';
import { Button, Card, Group, LargeTitle, NavBar, Page } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import {
  DONATE_DIR,
  DonationStore,
  GOAL_MS,
  MIN_TAKE_MS,
  nativePath,
  nextPrompt,
  promptOf,
  SHARE_DIR,
  shareName,
  takePath,
  totalMs,
  type Take,
} from '@/features/donate/donations';
import { PROMPT_SETS, promptsFor, type Prompt, type PromptSet } from '@/features/donate/prompts';
import { formatMB } from '@/features/packs/rules';
import { deviceFiles } from '@/storage/device-files';
import { VoxaEngine } from '../../modules/voxa-engine';

const donations = new DonationStore(deviceFiles);
/** A take stops by itself after this long, in case the volunteer forgets. */
const MAX_TAKE_MS = 20_000;

type Phase = 'loading' | 'consent' | 'ready' | 'recording' | 'saving' | 'sharing';

/**
 * Donate your voice: volunteers read short sentences aloud; the recordings stay on the phone until
 * the volunteer shares them as one zip file. They train Voxa's own listening model for Nigerian
 * English (training/asr). Volunteers who mix Hausa or Pidgin with English in meetings read mixed
 * sentences too, alternating with English: the recordings the model needs to follow a switch.
 */
export default function DonateScreen() {
  const { colors } = useTheme();
  const available = !!VoxaEngine?.startRecording && !!VoxaEngine.zipFolder;

  const [phase, setPhase] = useState<Phase>('loading');
  const [takes, setTakes] = useState<Take[]>([]);
  const [speaker, setSpeaker] = useState('');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [last, setLast] = useState<Prompt | null>(null);
  const [set, setSet] = useState<PromptSet>('en');
  const recordingFor = useRef<Prompt | null>(null);

  const prompts = useMemo(() => promptsFor(set), [set]);
  const prompt = nextPrompt(prompts, takes, skipped);
  const recordedMs = totalMs(takes);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [consent, saved, chosen] = await Promise.all([donations.consent(), donations.takes(), donations.set()]);
      if (!alive) return;
      setTakes(saved);
      setSet(chosen);
      if (consent) setSpeaker(await donations.speaker());
      if (alive) setPhase(consent ? 'ready' : 'consent');
    })().catch(() => alive && setPhase('consent'));
    return () => {
      alive = false;
    };
  }, []);

  // Loudness meter while recording.
  useEffect(() => {
    if (phase !== 'recording' || !VoxaEngine) return;
    const sub = VoxaEngine.addListener('onRecord', (e) => setLevel(e.rms));
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 200);
    return () => {
      sub.remove();
      clearInterval(timer);
      setLevel(0);
      setElapsed(0);
    };
  }, [phase]);

  const stop = useCallback(async () => {
    const p = recordingFor.current;
    if (!VoxaEngine?.stopRecording || !p) return;
    recordingFor.current = null;
    setPhase('saving');
    try {
      const { durationMs } = await VoxaEngine.stopRecording();
      if (durationMs < MIN_TAKE_MS) {
        setTakes(await donations.discard(p.id));
        setNote('That was too short. Tap Record, then read the whole sentence.');
      } else {
        setTakes(await donations.save(p, durationMs));
        setLast(p);
        setNote(null);
      }
    } catch (e) {
      setTakes(await donations.discard(p.id).catch(() => takes));
      setNote(`The recording failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setPhase('ready');
  }, [takes]);

  // Stops by itself after MAX_TAKE_MS.
  useEffect(() => {
    if (phase === 'recording' && elapsed >= MAX_TAKE_MS) void stop();
  }, [phase, elapsed, stop]);

  // Leaving mid-recording throws that take away.
  useEffect(
    () => () => {
      const p = recordingFor.current;
      if (p && VoxaEngine?.stopRecording) {
        recordingFor.current = null;
        void VoxaEngine.stopRecording()
          .catch(() => null)
          .then(() => donations.discard(p.id));
      }
    },
    [],
  );

  const agree = async () => {
    await donations.agree();
    setSpeaker(await donations.speaker());
    setPhase('ready');
  };

  const record = async (p: Prompt) => {
    if (!VoxaEngine?.startRecording) return;
    setNote(null);
    const perm = await VoxaEngine.requestMicPermission();
    if (!perm.granted) {
      setNote('Voxa needs the microphone to record. Allow it in your phone settings.');
      return;
    }
    try {
      await VoxaEngine.startRecording(nativePath(takePath(p.id)));
      recordingFor.current = p;
      setPhase('recording');
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  const choose = (next: PromptSet) => {
    setSet(next);
    setSkipped(new Set());
    void donations.chooseSet(next).catch(() => null);
  };

  const redoLast = async () => {
    if (!last) return;
    setTakes(await donations.discard(last.id));
    setSkipped((s) => {
      const n = new Set(s);
      n.delete(last.id);
      return n;
    });
    setLast(null);
  };

  const share = async () => {
    if (!VoxaEngine?.zipFolder) return;
    setPhase('sharing');
    try {
      const name = shareName(speaker);
      const { bytes } = await VoxaEngine.zipFolder(nativePath(DONATE_DIR), nativePath(`${SHARE_DIR}/${name}`));
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
      setNote(`Prepared ${formatMB(bytes)}. Choose WhatsApp, email or Drive.`);
      await Sharing.shareAsync(new File(Paths.document, 'voxa', SHARE_DIR, name).uri, {
        mimeType: 'application/zip',
        dialogTitle: 'Send your Voxa recordings',
      });
    } catch (e) {
      setNote(`Could not share: ${e instanceof Error ? e.message : String(e)}`);
    }
    setPhase('ready');
  };

  const deleteAll = () =>
    Alert.alert('Delete all your recordings?', 'Every recording on this phone is removed. Recordings you already sent are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          await donations.deleteAll().catch(() => Alert.alert('Something went wrong', 'Not everything could be deleted.'));
          setTakes([]);
          setSkipped(new Set());
          setLast(null);
          setSpeaker('');
          setNote(null);
          setPhase('consent');
        },
      },
    ]);

  const busy = phase === 'saving' || phase === 'sharing';
  const goal = Math.min(1, recordedMs / GOAL_MS);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavBar back="Settings" />
      <Page style={{ gap: 16 }}>
        <LargeTitle>Donate your voice</LargeTitle>
        {!available ? (
          <Card>
            <Text style={[type.body, { color: colors.text }]}>Recording needs the latest version of Voxa. Update the app, then come back here.</Text>
          </Card>
        ) : phase === 'loading' ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.text} />
        ) : phase === 'consent' ? (
          <Consent onAgree={agree} />
        ) : (
          <>
            <Card>
              <Text style={[type.callout, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
                {takes.length} recorded · {minutes(recordedMs)} of 20 minutes
              </Text>
              <View style={[styles.bar, { backgroundColor: colors.waveUnplayed }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={[styles.barFill, { width: `${goal * 100}%`, backgroundColor: colors.accent }]} />
              </View>
            </Card>

            <Group header="How do you talk in meetings?" footer="Mixed sentences come in turn with English ones. Read each one exactly as written.">
              {PROMPT_SETS.map((o) => (
                <SetRow key={o.set} label={o.label} hint={o.hint} selected={o.set === set} disabled={busy || phase === 'recording'} onPress={() => choose(o.set)} />
              ))}
            </Group>

            {prompt ? (
              <Card>
                <Text style={[type.footnote, { color: colors.textSecondary }]}>Read this aloud</Text>
                <Text style={[type.heading, { color: colors.text }]} accessibilityRole="text">
                  {prompt.text}
                </Text>

                {phase === 'recording' ? (
                  <>
                    <View style={[styles.bar, { backgroundColor: colors.waveUnplayed, height: 10 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <View style={[styles.barFill, { width: `${Math.min(100, level * 600)}%`, backgroundColor: level < 0.01 ? colors.warning : colors.accent }]} />
                    </View>
                    <Text style={[type.caption, { color: colors.textTertiary }]}>
                      {level < 0.01 ? 'We cannot hear you yet. Speak a little louder.' : `Recording · ${(elapsed / 1000).toFixed(0)} s`}
                    </Text>
                    <Button label="Stop and Save" icon="stop" onPress={stop} />
                  </>
                ) : (
                  <View style={styles.actions}>
                    <Button label="Record" icon="mic" accent onPress={() => record(prompt)} disabled={busy} style={{ flex: 2 }} />
                    <Button label="Skip" kind="gray" onPress={() => setSkipped((s) => new Set(s).add(prompt.id))} disabled={busy} style={{ flex: 1 }} />
                  </View>
                )}
              </Card>
            ) : (
              <Card>
                <Text style={[type.body, { color: colors.text }]}>
                  {skipped.size ? 'You have been through every sentence. ' : 'You recorded every sentence. Thank you! '}
                  Share your recordings below.
                </Text>
                {skipped.size ? <Button label="Show Skipped Sentences" kind="gray" onPress={() => setSkipped(new Set())} /> : null}
              </Card>
            )}

            {note ? <Text style={[type.callout, { color: colors.accentText }]} accessibilityLiveRegion="polite">{note}</Text> : null}

            {last && phase === 'ready' && last.id !== prompt?.id && takes.some((t) => promptOf(t) === last.id) ? (
              <Pressable onPress={redoLast} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                <Icon name="check" size={18} color={colors.textSecondary} />
                <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                  Saved: {last.text}
                </Text>
                <Text style={[type.callout, { color: colors.text }]}>Record again</Text>
              </Pressable>
            ) : null}

            <Card>
              <Text style={[type.body, { color: colors.text }]}>
                Your recordings stay on this phone until you send them. When you are ready, share them as one file by WhatsApp, email or Drive.
              </Text>
              <Button label={phase === 'sharing' ? 'Preparing…' : 'Share My Recordings'} icon="share" onPress={share} disabled={busy || phase === 'recording' || !takes.length} />
              <Pressable onPress={deleteAll} disabled={busy || phase === 'recording'} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                <Icon name="trash" size={18} color={colors.accentText} />
                <Text style={[type.body, { color: colors.accentText, flex: 1 }]}>Delete all my recordings</Text>
              </Pressable>
              {speaker ? (
                <Text style={[type.caption, { color: colors.textTertiary }]} selectable>
                  Your volunteer code: {speaker}. Quote it if you ever want recordings you sent removed.
                </Text>
              ) : null}
            </Card>
          </>
        )}
      </Page>
    </View>
  );
}

function Consent({ onAgree }: { onAgree: () => void }) {
  const { colors } = useTheme();
  const points = [
    'You read short sentences aloud: in English, or mixing English with Hausa or Pidgin the way you talk in meetings. About twenty minutes in total, in as many sittings as you like.',
    'The recordings help Voxa understand Nigerian voices better, for everyone who uses it.',
    'Only your voice reading the sentence is kept. No name, no phone number, no location. You get a random volunteer code instead.',
    'Nothing leaves your phone until you tap Share and choose where to send it.',
    'You can delete any or all of your recordings on this phone at any time.',
    'Please record somewhere quiet, and do not say anything private.',
  ];
  return (
    <>
      <Text style={[type.body, { color: colors.text }]}>
        Voxa listens best to the voices it learned from. Most speech models learned from American and British speakers. You can help change that.
      </Text>
      <Card>
        {points.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: 10 }}>
            <Icon name="check" size={18} color={colors.accent} />
            <Text style={[type.callout, { color: colors.text, flex: 1 }]}>{p}</Text>
          </View>
        ))}
      </Card>
      <Text style={[type.footnote, { color: colors.textSecondary }]}>
        By tapping I Agree, you allow Voxa to use the recordings you send to train and test its speech models. You must be eighteen or older.
      </Text>
      <Button label="I Agree" accent onPress={onAgree} />
    </>
  );
}

function SetRow({ label, hint, selected, disabled, onPress }: { label: string; hint: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${label}. ${hint}`}
      style={({ pressed }) => [styles.setRow, { opacity: disabled ? 0.4 : 1 }, pressed && { backgroundColor: colors.chipPressed }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.text }]}>{label}</Text>
        <Text style={[type.footnote, { color: colors.textSecondary }]}>{hint}</Text>
      </View>
      {selected ? <Icon name="check" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

const minutes = (ms: number) => {
  const m = ms / 60000;
  return m < 1 ? `${Math.round(ms / 1000)} seconds` : `${m.toFixed(1)} minutes`;
};

const styles = StyleSheet.create({
  bar: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  actions: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: minTouch },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: minTouch, paddingHorizontal: 16, paddingVertical: 10 },
});
