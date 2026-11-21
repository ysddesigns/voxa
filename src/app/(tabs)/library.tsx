import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/screen';
import { useTheme } from '@/design/theme';
import { minTouch, radius } from '@/design/tokens';
import { type } from '@/design/type';
import { formatDay, formatDuration } from '@/features/listen/format';
import { useListen } from '@/features/listen/listen-session';
import { sessionStore } from '@/storage';
import type { SessionMeta } from '@/storage/sessions';

/** Everything saved on this phone, newest first (PRD LB-1). */
export default function LibraryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const l = useListen();
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    sessionStore
      .list()
      .then((list) => live && setSessions(list))
      .catch(() => live && setSessions([]));
    return () => {
      live = false;
    };
  }, [l.version, l.status]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    // The one being recorded shows on the Live tab.
    const list = (sessions ?? []).filter((s) => s.id !== l.sessionId);
    return q ? list.filter((s) => s.title.toLowerCase().includes(q)) : list;
  }, [sessions, query, l.sessionId]);

  return (
    <Screen title="Library">
      <View style={[styles.search, { backgroundColor: colors.card }]}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Search saved sessions"
          style={[type.body, { color: colors.text, flex: 1, paddingVertical: 10 }]}
        />
      </View>

      {l.status !== 'idle' ? (
        <Pressable onPress={() => router.navigate('/live')} accessibilityRole="button" style={[styles.live, { backgroundColor: colors.warning }]}>
          <Icon name="mic" size={18} color={colors.accentText} />
          <Text style={[type.bodyStrong, { color: colors.accentText, flex: 1 }]}>{l.status === 'paused' ? 'Listening paused' : 'Listening now'}</Text>
          <Icon name="arrow" size={18} color={colors.accentText} />
        </Pressable>
      ) : null}

      {sessions === null ? null : shown.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.card }]}>
          <Text style={[type.bodyStrong, { color: colors.text }]}>{query ? 'Nothing matches' : 'Nothing saved yet'}</Text>
          <Text style={[type.body, { color: colors.textSecondary }]}>
            {query ? 'Try another word.' : 'Meetings you listen to and text you scan are saved here, on this phone only.'}
          </Text>
          {query ? null : (
            <Pressable onPress={() => router.navigate('/live')} accessibilityRole="button" style={[styles.pill, { backgroundColor: colors.primaryFill }]}>
              <Text style={[type.callout, { color: colors.onPrimary }]}>Start listening</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={[styles.list, { backgroundColor: colors.card }]}>
          {shown.map((s, i) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.warning }]}>
                <Icon name={s.kind === 'scan' ? 'scan' : 'live'} size={18} color={colors.accentText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={[type.caption, { color: colors.textTertiary }]}>{metaLine(s)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function metaLine(s: SessionMeta): string {
  if (s.kind === 'scan') return `Scanned · ${formatDay(s.startedAt)}`;
  const parts = [formatDay(s.startedAt), formatDuration(s.durationMs)];
  if (s.speakers) parts.push(`${s.speakers} ${s.speakers === 1 ? 'speaker' : 'speakers'}`);
  if (s.marks.length) parts.push(`${s.marks.length} ${s.marks.length === 1 ? 'mark' : 'marks'}`);
  if (s.status === 'recovered') parts.push('recovered');
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 14 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.card, padding: 14 },
  empty: { borderRadius: radius.card, padding: 20, gap: 8 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 16, minHeight: minTouch - 4, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginTop: 4 },
  list: { borderRadius: radius.card, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: minTouch },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
