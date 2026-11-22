import { useEffect, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { Screen } from '@/components/screen';
import { Group, ListRow, TextRow } from '@/components/ui';
import { Waveform } from '@/components/waveform';
import { useTheme } from '@/design/theme';
import { minTouch, radius, squircle } from '@/design/tokens';
import { type } from '@/design/type';
import { formatDay, formatDuration } from '@/features/listen/format';
import { useListen } from '@/features/listen/listen-session';
import { usePrefs } from '@/features/settings/prefs';
import { sessionStore } from '@/storage';
import type { SessionMeta } from '@/storage/sessions';

/** The three newest saved sessions. */
function useRecent(): SessionMeta[] {
  const { version, status } = useListen();
  const [recent, setRecent] = useState<SessionMeta[]>([]);
  useEffect(() => {
    let live = true;
    sessionStore
      .list()
      .then((list) => live && setRecent(list.filter((s) => s.status !== 'recording').slice(0, 3)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [version, status]);
  return recent;
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const { colors } = useTheme();
  const router = useRouter();
  const recent = useRecent();
  const { prefs, loaded } = usePrefs();
  const now = new Date();
  const overline = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // First run: setup before anything else.
  if (loaded && !prefs.onboarded) return <Redirect href="/welcome" />;

  return (
    <Screen
      title={greeting(now)}
      overline={overline}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={[styles.avatar, { backgroundColor: colors.chip }]}
        >
          <Icon name="person" color={colors.text} />
        </Pressable>
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Type something to say"
        onPress={() => router.push('/editor')}
        style={[styles.hero, { backgroundColor: colors.accent }]}
      >
        <Text style={[type.title, { color: colors.onAccent }]}>What do you want to say?</Text>
        <View style={styles.heroWave}>
          <Waveform bars={34} maxHeight={56} color="rgba(255,255,255,0.9)" breathe />
        </View>
        <View style={styles.heroRow}>
          {(['Paste', 'Scan', 'Files'] as const).map((label) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label === 'Scan' ? 'Scan text with the camera' : label === 'Files' ? 'Open a text, Word or PDF file' : label}
              onPress={() =>
                label === 'Scan' ? router.push('/scan') : label === 'Files' ? router.push({ pathname: '/editor', params: { open: 'file' } }) : router.push('/editor')
              }
              style={[styles.heroChip, { backgroundColor: 'rgba(255,255,255,0.22)' }]}
            >
              <Text style={[type.callout, { color: colors.onAccent }]}>{label}</Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <View style={[styles.plus, { backgroundColor: colors.primaryFill }]}>
            <Icon name="plus" color={colors.onPrimary} />
          </View>
        </View>
      </Pressable>

      <View style={styles.tiles}>
        <Tile icon="chat" title="Speak for me" sub="Phrases, type and play" onPress={() => router.push('/phrases')} />
        <Tile icon="mic" title="Start listening" sub="Live captions" onPress={() => router.push('/live')} />
      </View>

      <Group header="Recent" action={recent.length ? { label: 'See All', onPress: () => router.navigate('/library') } : undefined}>
        {recent.length === 0 ? (
          <TextRow>
            <Text style={[type.subheadline, { color: colors.textSecondary }]}>Nothing saved yet. Meetings you listen to appear here.</Text>
          </TextRow>
        ) : null}
        {recent.map((item) => (
          <ListRow
            key={item.id}
            icon={item.kind === 'scan' ? 'scan' : 'live'}
            title={item.title}
            subtitle={
              item.kind === 'scan'
                ? `Scanned · ${formatDay(item.startedAt)}`
                : `${formatDay(item.startedAt)} · ${formatDuration(item.durationMs)}${item.speakers ? ` · ${item.speakers} speakers` : ''}`
            }
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: item.id } })}
          />
        ))}
      </Group>
    </Screen>
  );
}

function Tile({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? colors.chipPressed : colors.card, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={[styles.tileIcon, { backgroundColor: colors.primaryFill }]}>
        <Icon name={icon} color={colors.onPrimary} />
      </View>
      <Text style={[type.headline, { color: colors.text }]}>{title}</Text>
      <Text style={[type.footnote, { color: colors.textSecondary }]}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: radius.hero, ...squircle, padding: 20, gap: 16 },
  heroWave: { height: 60, justifyContent: 'center' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroChip: { borderRadius: radius.chip, paddingHorizontal: 14, minHeight: minTouch, justifyContent: 'center' },
  plus: { width: minTouch + 4, height: minTouch + 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderRadius: radius.tile, ...squircle, padding: 16, gap: 4 },
  tileIcon: { width: 40, height: 40, borderRadius: radius.icon, ...squircle, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
