import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { ModelRow } from '@/components/model-row';
import { ActionRow, Group, InfoRow, LargeTitle, NavBar, NavRow, Page, TextRow, ToggleRow } from '@/components/ui';
import { TIER_LABEL } from '@/device/tier';
import { useDeviceTier } from '@/device/use-device-tier';
import { useTheme, type ThemePreference } from '@/design/theme';
import { radius, squircle } from '@/design/tokens';
import { type } from '@/design/type';
import { useListen } from '@/features/listen/listen-session';
import { useModels } from '@/features/packs/models';
import { formatMB } from '@/features/packs/rules';
import { usePrefs } from '@/features/settings/prefs';
import { useLiveUpdates } from '@/features/settings/use-live-updates';
import { deleteAllSessions, deleteWaitingAudio, readStorage, totalBytes, type StorageUse } from '@/features/settings/storage';
import { useVoices } from '@/features/voices/voices-store';
import { sessionStore } from '@/storage';

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'Automatic' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** Settings (PRD ST-1..ST-5): appearance, speaking, downloads, storage, privacy, about. */
export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const router = useRouter();
  const { prefs, update } = usePrefs();
  const { byId, defaultId } = useVoices();
  const listen = useListen();
  const tier = useDeviceTier();
  const [storage, setStorage] = useState<StorageUse>(readStorage);
  const models = useModels();
  const liveUpdates = useLiveUpdates();
  const android = Platform.OS === 'android';

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
      <NavBar back="Home" />
      <Page>
        <LargeTitle>Settings</LargeTitle>

        <Group header="Appearance">
          <View style={styles.segmentWrap}>
            <View style={[styles.segment, { backgroundColor: colors.chip }]} accessibilityRole="radiogroup">
              {THEMES.map((t) => {
                const on = preference === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setPreference(t.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.segmentItem, on && { backgroundColor: colors.card, boxShadow: `0 2px 6px ${colors.shadow}` }]}
                  >
                    <Text style={[type.subheadline, { color: colors.text, fontFamily: on ? type.headline.fontFamily : type.subheadline.fontFamily }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Group>

        <Group header="Speaking" footer="Discreet mode plays Speak for me in your earbuds, or the earpiece, never the loudspeaker.">
          <NavRow label="Voice" value={voice?.name ?? 'Choose'} onPress={() => router.navigate('/voices')} />
          <NavRow label="Quick phrases" onPress={() => router.push('/phrases')} />
          <ToggleRow label="Discreet mode" value={prefs.discreet} onChange={(v) => update({ discreet: v })} />
        </Group>

        <Group
          header="Listening"
          footer={`${liveUpdates.supported ? 'Live Updates show the listening time in the status bar, even on the lock screen. ' : ''}With TalkBack or VoiceOver on, each new caption is read out, which also works with a braille display.`}
        >
          {android ? <NavRow label="Keep listening with the screen off" onPress={() => router.push('/battery')} /> : null}
          {liveUpdates.supported ? <NavRow label="Live Updates" value={liveUpdates.allowed ? 'On' : 'Off'} onPress={() => liveUpdates.open()} /> : null}
          <ToggleRow label="Read captions aloud" value={prefs.readCaptions} onChange={(v) => update({ readCaptions: v })} />
          {android ? (
            <ToggleRow
              label="Captions in the notification"
              hint="Never shown on the lock screen."
              value={prefs.noticeCaptions}
              onChange={(v) => update({ noticeCaptions: v })}
            />
          ) : null}
        </Group>

        <Group header="Downloads" footer="Without Wi-Fi, downloads over 10 MB wait unless mobile data is on. Data charges may apply.">
          <View style={styles.inset}>
            <ModelRow id="listen" title="Listening" what="Live captions in English" />
          </View>
          <View style={styles.inset}>
            <ModelRow id="speakers" title="Speaker labels" what="Who spoke when, after a meeting" />
          </View>
          <ToggleRow label="Use mobile data" value={prefs.allowMobileData} onChange={(v) => update({ allowMobileData: v })} />
        </Group>

        <Group
          header="Storage"
          footer={storage.freeBytes !== null ? `Voxa uses ${formatMB(used)}. ${formatMB(storage.freeBytes)} free on this phone.` : 'Storage details need the on-device engine.'}
        >
          {storage.sessionBytes !== null ? <InfoRow label="Transcripts and scans" value={formatMB(storage.sessionBytes)} /> : null}
          {storage.audioBytes !== null ? <InfoRow label="Meeting audio" value={formatMB(storage.audioBytes)} /> : null}
          {Object.entries(storage.packBytes).map(([id, bytes]) => (
            <InfoRow key={id} label={`Pack: ${id}`} value={formatMB(bytes)} />
          ))}
          <ActionRow
            label="Delete waiting meeting audio"
            destructive
            onPress={() =>
              confirm('Delete meeting audio?', 'Transcripts stay. Speakers can no longer be labelled for those meetings.', 'Delete Audio', () => deleteWaitingAudio(sessionStore))
            }
          />
          <ActionRow
            label="Delete everything saved"
            destructive
            onPress={() =>
              confirm('Delete all saved sessions?', 'Every transcript, scan and summary on this phone is removed. This cannot be undone.', 'Delete All', () =>
                deleteAllSessions(sessionStore),
              )
            }
          />
        </Group>

        <Group header="Privacy">
          <TextRow>
            <Text style={[type.subheadline, { color: colors.textSecondary }]}>
              Voxa works on this phone. What you say, hear, type and scan is never sent anywhere. The internet is only used to download voices and models, and only when you ask.
            </Text>
          </TextRow>
        </Group>

        <Group header="Help Voxa" footer="Read short sentences aloud so Voxa learns Nigerian voices. Nothing is sent unless you share it.">
          <NavRow label="Donate your voice" onPress={() => router.push('/donate')} />
        </Group>

        <Group header="About">
          <InfoRow label="Version" value={Constants.expoConfig?.version ?? 'dev'} />
          <InfoRow label="This phone" value={`${TIER_LABEL[tier]} models`} />
          <NavRow label="Open-source licences" onPress={() => router.push('/licences')} />
          <NavRow label="Engine lab" onPress={() => router.push('/engine-lab')} />
          <ActionRow
            label="Show setup again"
            onPress={() => {
              update({ onboarded: false });
              router.replace('/welcome');
            }}
          />
        </Group>
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: 16, paddingVertical: 4 },
  segmentWrap: { padding: 8 },
  segment: { flexDirection: 'row', borderRadius: radius.icon, padding: 2, ...squircle },
  segmentItem: { flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...squircle },
});
