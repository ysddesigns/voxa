import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/screen';
import { Button, Card, Group, ListRow, SearchField } from '@/components/ui';
import { useTheme } from '@/design/theme';
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
      <SearchField value={query} onChangeText={setQuery} placeholder="Search" label="Search saved sessions" />

      {l.status !== 'idle' ? (
        <Group>
          <ListRow icon="mic" tint title={l.status === 'paused' ? 'Listening paused' : 'Listening now'} subtitle={l.title} onPress={() => router.navigate('/live')} />
        </Group>
      ) : null}

      {sessions === null ? null : shown.length === 0 ? (
        <Card style={{ gap: 8 }}>
          <Text style={[type.headline, { color: colors.text }]}>{query ? 'Nothing Matches' : 'Nothing Saved Yet'}</Text>
          <Text style={[type.subheadline, { color: colors.textSecondary }]}>
            {query ? 'Try another word.' : 'Meetings you listen to and text you scan are saved here, on this phone only.'}
          </Text>
          {query ? null : <Button label="Start Listening" icon="mic" onPress={() => router.navigate('/live')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />}
        </Card>
      ) : (
        <Group header={query ? `${shown.length} found` : undefined}>
          {shown.map((s) => (
            <ListRow
              key={s.id}
              icon={s.kind === 'scan' ? 'scan' : 'live'}
              title={s.title}
              subtitle={metaLine(s)}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
            />
          ))}
        </Group>
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

