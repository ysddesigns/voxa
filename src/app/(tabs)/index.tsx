import { useEffect, useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { Screen } from '@/components/screen';
import { Waveform } from '@/components/waveform';
import { TIER_LABEL } from '@/device/tier';
import { useDeviceTier } from '@/device/use-device-tier';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { formatDay, formatDuration } from '@/features/listen/format';
import { useListen } from '@/features/listen/listen-session';
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
  const tier = useDeviceTier();
  const recent = useRecent();
  const now = new Date();
  const overline = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen
      title={greeting(now)}
      overline={overline}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings and engine lab"
          onPress={() => router.push('/engine-lab')}
          style={[styles.avatar, { backgroundColor: colors.chip }]}
        >
          <Icon name="person" color={colors.text} />
        </Pressable>
      }
    >
      <View style={[styles.offline, { backgroundColor: colors.card }]}>
        <Icon name="offline" size={16} color={colors.accentText} />
        <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>
          Works offline · {TIER_LABEL[tier]} models on this phone
        </Text>
      </View>

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
              accessibilityLabel={label === 'Scan' ? 'Scan text with the camera' : label}
              onPress={() => router.push(label === 'Scan' ? '/scan' : '/editor')}
              style={[styles.heroChip, { backgroundColor: 'rgba(255,255,255,0.22)' }]}
            >
              <Text style={[type.callout, { color: colors.onAccent }]}>{label}</Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <View style={[styles.plus, { backgroundColor: '#111111' }]}>
            <Icon name="plus" color="#FFFFFF" />
          </View>
        </View>
      </Pressable>

      <View style={styles.tiles}>
        <Tile icon="chat" title="Speak for me" sub="Phrases, type and play" onPress={() => router.push('/phrases')} />
        <Tile icon="mic" title="Start listening" sub="Live captions" onPress={() => router.push('/live')} />
      </View>

      <View style={styles.sectionHead}>
        <Text style={[type.heading, { color: colors.text }]}>Recent</Text>
        <Link href="/library" style={[type.callout, { color: colors.accentText }]}>
          See all
        </Link>
      </View>
      <View style={[styles.list, { backgroundColor: colors.card }]}>
        {recent.length === 0 ? (
          <Text style={[type.callout, { color: colors.textTertiary, paddingVertical: 16 }]}>
            Nothing saved yet. Meetings you listen to appear here.
          </Text>
        ) : null}
        {recent.map((item, i) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: item.id } })}
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
              pressed && { opacity: 0.6 },
            ]}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.warning }]}>
              <Icon name={item.kind === 'scan' ? 'scan' : 'live'} size={18} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[type.caption, { color: colors.textTertiary }]}>
                {item.kind === 'scan'
                  ? `Scanned · ${formatDay(item.startedAt)}`
                  : `${formatDay(item.startedAt)} · ${formatDuration(item.durationMs)}${item.speakers ? ` · ${item.speakers} speakers` : ''}`}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
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
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? colors.chipPressed : colors.card }]}
    >
      <View style={[styles.tileIcon, { backgroundColor: colors.primaryFill }]}>
        <Icon name={icon} color={colors.onPrimary} />
      </View>
      <Text style={[type.bodyStrong, { color: colors.text }]}>{title}</Text>
      <Text style={[type.caption, { color: colors.textTertiary }]}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 14 },
  hero: { borderRadius: radius.hero, padding: 22, gap: 16 },
  heroWave: { height: 60, justifyContent: 'center' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroChip: { borderRadius: radius.chip, paddingHorizontal: 14, minHeight: minTouch - 8, justifyContent: 'center' },
  plus: { width: minTouch + 4, height: minTouch + 4, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderRadius: radius.tile, padding: 16, gap: 6 },
  tileIcon: { width: 40, height: 40, borderRadius: radius.icon, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  list: { borderRadius: radius.card, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
