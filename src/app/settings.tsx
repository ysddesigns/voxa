import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { TIER_LABEL } from '@/device/tier';
import { useDeviceTier } from '@/device/use-device-tier';
import { useTheme, type ThemePreference } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { useListen } from '@/features/listen/listen-session';
import { ModelRow } from '@/components/model-row';
import { useModels } from '@/features/packs/models';
import { formatMB } from '@/features/packs/rules';
import { usePrefs } from '@/features/settings/prefs';
import { deleteAllSessions, deleteWaitingAudio, readStorage, totalBytes, type StorageUse } from '@/features/settings/storage';
import { useVoices } from '@/features/voices/voices-store';
import { sessionStore } from '@/storage';

/** Settings (PRD ST-1..ST-5): appearance, speaking, downloads, storage, privacy, about. */
export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { prefs, update } = usePrefs();
  const { byId, defaultId } = useVoices();
  const listen = useListen();
  const tier = useDeviceTier();
  const [storage, setStorage] = useState<StorageUse>(readStorage);
  const models = useModels();

  // Re-read after anything that changes what is stored.
  useEffect(() => {
    const t = setTimeout(() => setStorage(readStorage()), 0);
    return () => clearTimeout(t);
  }, [listen.version, models.ready.listen, models.ready.speakers]);

  const voice = byId(defaultId);
  const used = totalBytes(storage);

  const confirm = (title: string, message: string, action: string, run: () => Promise<unknown>) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: async () => {
          await run().catch(() => Alert.alert('Something went wrong', 'Not everything could be deleted.'));
          listen.bump();
          setStorage(readStorage());
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.iconBtn, { backgroundColor: colors.chip }]}>
          <Icon name="chevronLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
          Settings
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 8 }}>
        <Section title="Appearance">
          <View style={styles.segment} accessibilityRole="radiogroup">
            {(['system', 'light', 'dark'] as ThemePreference[]).map((p) => {
              const on = preference === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPreference(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.segmentItem, { backgroundColor: on ? colors.primaryFill : colors.chip }]}
                >
                  <Text style={[type.callout, { color: on ? colors.onPrimary : colors.text }]}>{p === 'system' ? 'Phone setting' : p === 'light' ? 'Light' : 'Dark'}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Speaking">
          <Row label="Voice" value={voice?.name ?? 'Choose a voice'} onPress={() => router.navigate('/voices')} />
          <Row label="Quick phrases" onPress={() => router.push('/phrases')} />
          <Toggle
            label="Discreet mode"
            hint="Speak for me plays in your earbuds, or the earpiece, never the loudspeaker."
            value={prefs.discreet}
            onChange={(v) => update({ discreet: v })}
          />
        </Section>

        <Section title="Listening">
          <Toggle
            label="Read captions with the screen reader"
            hint="When TalkBack or VoiceOver is on, each new sentence on the Live screen is read out. Useful with a braille display."
            value={prefs.readCaptions}
            onChange={(v) => update({ readCaptions: v })}
          />
          {Platform.OS === 'android' ? (
            <Toggle
              label="Show captions in the notification"
              hint="The newest sentence appears in the Listening notification. It is never shown on the lock screen."
              value={prefs.noticeCaptions}
              onChange={(v) => update({ noticeCaptions: v })}
            />
          ) : null}
        </Section>

        <Section title="Downloads">
          <ModelRow id="listen" title="Listening" what="Live captions in English" />
          <ModelRow id="speakers" title="Speaker labels" what="Who spoke when, after a meeting" />
          <Toggle
            label="Use mobile data"
            hint="Allow downloads over 10 MB without Wi-Fi. Data charges may apply."
            value={prefs.allowMobileData}
            onChange={(v) => update({ allowMobileData: v })}
          />
        </Section>

        <Section title="Storage">
          {storage.freeBytes !== null ? (
            <Text style={[type.callout, { color: colors.textSecondary }]}>
              Voxa uses {formatMB(used)} · {formatMB(storage.freeBytes)} free on this phone
            </Text>
          ) : (
            <Text style={[type.callout, { color: colors.textSecondary }]}>Storage details need the on-device engine.</Text>
          )}
          {storage.sessionBytes !== null ? <Info label="Transcripts and scans" value={formatMB(storage.sessionBytes)} /> : null}
          {storage.audioBytes !== null ? <Info label="Meeting audio waiting for speaker labels" value={formatMB(storage.audioBytes)} /> : null}
          {Object.entries(storage.packBytes).map(([id, bytes]) => (
            <Info key={id} label={`Pack: ${id}`} value={formatMB(bytes)} />
          ))}
          <Danger
            label="Delete waiting meeting audio"
            onPress={() =>
              confirm('Delete meeting audio?', 'Transcripts stay. Speakers can no longer be labelled for those meetings.', 'Delete audio', () => deleteWaitingAudio(sessionStore))
            }
          />
          <Danger
            label="Delete everything saved"
            onPress={() =>
              confirm(
                'Delete all saved sessions?',
                'Every transcript, scan and summary on this phone is removed. This cannot be undone.',
                'Delete all',
                () => deleteAllSessions(sessionStore),
              )
            }
          />
        </Section>

        <Section title="Privacy">
          <Text style={[type.callout, { color: colors.textSecondary }]}>
            Voxa works on this phone. What you say, hear, type and scan is never sent anywhere. The internet is only used to download voices and models, and only when you ask.
          </Text>
        </Section>

        <Section title="Help Voxa">
          <Row label="Donate your voice" onPress={() => router.push('/donate')} />
          <Text style={[type.caption, { color: colors.textTertiary }]}>
            Read short sentences aloud so Voxa learns to understand Nigerian voices. Nothing is sent unless you share it.
          </Text>
        </Section>

        <Section title="About">
          <Info label="Version" value={Constants.expoConfig?.version ?? 'dev'} />
          <Info label="This phone" value={`${TIER_LABEL[tier]} models`} />
          <Row label="Engine lab" onPress={() => router.push('/engine-lab')} />
          <Row
            label="Show setup again"
            onPress={() => {
              update({ onboarded: false });
              router.replace('/welcome');
            }}
          />
          <Text style={[type.caption, { color: colors.textTertiary }]}>
            Built with open models: sherpa-onnx (Apache-2.0), Zipformer (Apache-2.0), Piper voice trained on LJ Speech (public domain), Silero VAD (MIT), pyannote (MIT),
            3D-Speaker (Apache-2.0), CMUdict, and Google ML Kit text recognition.
          </Text>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8, marginTop: 12 }}>
      <Text style={[type.overline, { color: colors.textTertiary }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

function Row({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}: ${value}` : label} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      {value ? <Text style={[type.callout, { color: colors.textTertiary }]}>{value}</Text> : null}
      <Icon name="arrow" size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      <Text style={[type.callout, { color: colors.textTertiary }]}>{value}</Text>
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: colors.text }]}>{label}</Text>
        <Text style={[type.caption, { color: colors.textTertiary }]}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.accent, false: colors.waveUnplayed }} thumbColor="#FFFFFF" />
    </View>
  );
}

function Danger({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Icon name="trash" size={18} color={colors.accentText} />
      <Text style={[type.body, { color: colors.accentText, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  iconBtn: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: minTouch },
  segment: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  segmentItem: { flex: 1, borderRadius: radius.pill, minHeight: minTouch, alignItems: 'center', justifyContent: 'center' },
});
