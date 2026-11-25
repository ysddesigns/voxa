import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { EmptySlot, LivePoster, Poster } from '@/components/rack/poster';
import { RackWall, useRack } from '@/components/rack/rack-wall';
import { RACK, RackBase, RackTop, Shelf, posterSize } from '@/components/rack/shelf';
import { Button } from '@/components/ui';
import { useDeviceTier } from '@/device/use-device-tier';
import { minTouch } from '@/design/tokens';
import { fontFamily } from '@/design/type';
import { posterTitle } from '@/features/library-rack/labels';
import { buildShelves, postersPerRow, type ShelfRow } from '@/features/library-rack/shelves';
import { useListen } from '@/features/listen/listen-session';
import { sessionStore } from '@/storage';
import type { SessionMeta } from '@/storage/sessions';

type Item = { kind: 'session'; meta: SessionMeta } | { kind: 'live'; title: string; paused: boolean };

/** The live poster always lands on This Week, first. */
const itemTime = (i: Item) => (i.kind === 'live' ? Infinity : i.meta.startedAt);

/**
 * Library v2, "The Rack": everything saved on this phone as posters on a wire rack against a
 * sunlit wall, one shelf label per week or month. Each poster's art is drawn from its session
 * (time of day, speakers, length, marks). Same data and actions as the Library tab.
 */
export default function LibraryRackScreen() {
  const r = useRack();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const l = useListen();
  const tier = useDeviceTier();
  const reduceMotion = useReducedMotion();
  const motion = tier !== 'lite' && !reduceMotion;

  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  // Reload on focus too, so a rename or delete on the session screen shows on return.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      sessionStore
        .list()
        .then((list) => live && setSessions(list))
        .catch(() => live && setSessions([]));
      return () => {
        live = false;
      };
      // Not read inside, but a change means a session was saved or changed: list again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [l.version, l.status]),
  );

  const perRow = useMemo(() => postersPerRow(width, fontScale), [width, fontScale]);
  const size = posterSize(width, perRow);

  const rows = useMemo(() => {
    const saved: Item[] = (sessions ?? []).filter((s) => s.id !== l.sessionId).map((meta) => ({ kind: 'session', meta }));
    const items: Item[] = l.status === 'idle' ? saved : [{ kind: 'live', title: l.title, paused: l.status === 'paused' }, ...saved];
    return buildShelves(items, itemTime, perRow);
  }, [sessions, l.sessionId, l.status, l.title, perRow]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (m: SessionMeta) => !q || m.title.toLowerCase().includes(q) || posterTitle(m).toLowerCase().includes(q) || (m.text ?? '').toLowerCase().includes(q),
    [q],
  );
  const found = useMemo(() => (q ? (sessions ?? []).filter((s) => s.id !== l.sessionId && matches(s)).length : 0), [q, sessions, l.sessionId, matches]);

  const open = useCallback((id: string) => router.push({ pathname: '/session/[id]', params: { id } }), [router]);
  const goLive = useCallback(() => router.navigate('/live'), [router]);

  const savedCount = (sessions ?? []).filter((s) => s.id !== l.sessionId).length;

  const header = (
    <View style={{ paddingTop: insets.top + 8 }}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to Library"
          hitSlop={6}
          style={({ pressed }) => [styles.round, { borderColor: r.wire, opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="chevronLeft" size={22} color={r.title} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          onPress={() => {
            setSearching((v) => !v);
            if (searching) setQuery('');
          }}
          accessibilityRole="button"
          accessibilityLabel={searching ? 'Close search' : 'Search the rack'}
          hitSlop={6}
          style={({ pressed }) => [styles.round, { borderColor: r.wire, opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name={searching ? 'close' : 'search'} size={19} color={r.title} />
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.overline, { color: r.overline }]} maxFontSizeMultiplier={1.4}>
          LIBRARY / ON THIS PHONE
        </Text>
        <Text style={[styles.title, { color: r.title }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          The Rack
        </Text>
        {sessions && savedCount ? (
          <Text style={[styles.count, { color: r.overline }]} accessibilityLiveRegion="polite">
            {q ? `${found} of ${savedCount} match` : `${savedCount} saved · nothing leaves this phone`}
          </Text>
        ) : null}
      </View>

      {searching ? (
        <View style={[styles.search, { borderColor: r.wire }]}>
          <Icon name="search" size={17} color={r.overline} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find a title or word"
            placeholderTextColor={r.overline}
            accessibilityLabel="Search saved sessions"
            returnKeyType="search"
            autoFocus
            style={[styles.searchInput, { color: r.title }]}
          />
        </View>
      ) : null}
      <RackTop />
    </View>
  );

  const renderRow = ({ item: row }: { item: ShelfRow<Item> }) => (
    <Shelf label={row.label} count={row.count} showLabel={row.first} posterHeight={size.height} slots={row.items.map(() => size.width)}>
      {row.items.map((it) =>
        it.kind === 'live' ? (
          <LivePoster key="live" title={it.title} paused={it.paused} width={size.width} height={size.height} motion={motion} onPress={goLive} />
        ) : (
          <Poster key={it.meta.id} meta={it.meta} width={size.width} height={size.height} dimmed={!matches(it.meta)} motion={motion} onOpen={open} />
        ),
      )}
    </Shelf>
  );

  const empty =
    sessions === null ? undefined : (
      <View>
        <Shelf label="NOTHING YET" count={0} showLabel={false} posterHeight={size.height} slots={Array.from({ length: perRow }, () => size.width)}>
          {Array.from({ length: perRow }, (_, i) => (
            <EmptySlot key={i} width={size.width} height={size.height} />
          ))}
        </Shelf>
        <View style={[styles.note, { backgroundColor: r.wallLight, borderColor: r.wire }]}>
          <Text style={[styles.noteTitle, { color: r.title }]}>Nothing on the rack yet</Text>
          <Text style={[styles.noteBody, { color: r.title }]}>
            Meetings you listen to and text you scan are kept here as posters, on this phone only.
          </Text>
          <Button label="Start Listening" icon="mic" accent onPress={goLive} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
        </View>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: r.wall }}>
      <RackWall width={width} height={height} simple={tier === 'lite'} />
      <FlatList
        data={rows}
        key={perRow}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={<RackBase bottomInset={insets.bottom} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: RACK.margin },
  round: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { paddingHorizontal: RACK.margin + 4, paddingTop: 14, paddingBottom: 14, gap: 2 },
  overline: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 1.6, lineHeight: 15 },
  title: { fontFamily: fontFamily.display, fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
  count: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: minTouch,
    marginHorizontal: RACK.margin,
    marginBottom: 14,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 16, paddingVertical: 0 },
  note: { marginHorizontal: RACK.margin + 10, marginTop: 4, marginBottom: 20, padding: 16, borderRadius: 4, borderWidth: 1, gap: 6, transform: [{ rotate: '-0.6deg' }] },
  noteTitle: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 26 },
  noteBody: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 20 },
});
