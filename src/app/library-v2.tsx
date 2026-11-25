import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect, usePreventRemove, useRouter } from 'expo-router';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { EmptyPocket, PocketView } from '@/components/rack/pocket';
import type { RackItem } from '@/components/rack/poster';
import { RackWall, useRack } from '@/components/rack/rack-wall';
import { COUNTER_MIN, Counter, PocketShelf, RACK, RackFeet, RackTop } from '@/components/rack/shelf';
import { StackViewer } from '@/components/rack/stack-viewer';
import { Button } from '@/components/ui';
import { useDeviceTier } from '@/device/use-device-tier';
import { minTouch } from '@/design/tokens';
import { fontFamily } from '@/design/type';
import { posterTitle } from '@/features/library-rack/labels';
import { buildPockets, frontMatches, paginate, rackLayout, type Pocket, type RackLayout } from '@/features/library-rack/pockets';
import { useListen } from '@/features/listen/listen-session';
import { sessionStore } from '@/storage';
import type { SessionMeta } from '@/storage/sessions';

/** A pocket as shown: its stack ordered for the search, and how many matched. */
type ShownPocket = Pocket<RackItem> & { hits: number };

/** The live poster always lands on This Week, in front. */
const itemTime = (i: RackItem) => (i.kind === 'live' ? Infinity : i.meta.startedAt);

const matchSession = (m: SessionMeta, q: string) =>
  m.title.toLowerCase().includes(q) || posterTitle(m).toLowerCase().includes(q) || (m.text ?? '').toLowerCase().includes(q);

/**
 * Library v2, "The Rack". The rack always fits the screen and grows deeper, not longer: each
 * pocket is one week or month, a stack with the newest poster in front and older ones peeking
 * out behind. Tap a pocket to pull its stack out; swipe across for older racks. Same data and
 * actions as the Library tab.
 */
export default function LibraryRackScreen() {
  const r = useRack();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const l = useListen();
  const tier = useDeviceTier();
  const reduceMotion = useReducedMotion();
  const motion = tier !== 'lite' && !reduceMotion;

  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [viewer, setViewer] = useState<{ key: string; closing: boolean } | null>(null);
  const [page, setPage] = useState(0);
  // The whole screen, kept at its tallest so the keyboard never shrinks the rack.
  const [root, setRoot] = useState({ w: 0, h: 0 });
  const [headerH, setHeaderH] = useState(0);

  const scrollX = useSharedValue(0);
  const pager = useAnimatedRef<Animated.ScrollView>();
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
  });

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

  const q = query.trim().toLowerCase();

  const pockets = useMemo<ShownPocket[]>(() => {
    const saved: RackItem[] = (sessions ?? []).filter((s) => s.id !== l.sessionId).map((meta) => ({ kind: 'session', meta }));
    const items: RackItem[] = l.status === 'idle' ? saved : [{ kind: 'live', title: l.title, paused: l.status === 'paused' }, ...saved];
    const match = (i: RackItem) => (i.kind === 'live' ? i.title.toLowerCase().includes(q) : matchSession(i.meta, q));
    return buildPockets(items, itemTime).map((p) => (q ? { ...p, ...frontMatches(p.items, match) } : { ...p, hits: p.items.length }));
  }, [sessions, l.sessionId, l.status, l.title, q]);

  const layout = useMemo(() => {
    const area = root.h - headerH - RACK.top - RACK.base - (COUNTER_MIN + insets.bottom);
    if (root.w <= 0 || headerH <= 0 || area <= 0) return null;
    return rackLayout({ width: root.w - 2 * RACK.margin - 2 * RACK.inset, height: area, fontScale, gap: RACK.gap });
  }, [root, headerH, insets.bottom, fontScale]);

  const racks = useMemo(() => paginate(pockets, layout ? layout.cols * layout.rows : 9), [pockets, layout]);
  const current = Math.min(page, racks.length - 1);
  const savedCount = (sessions ?? []).filter((s) => s.id !== l.sessionId).length;
  const found = q ? pockets.reduce((n, p) => n + p.hits, 0) : 0;
  const empty = sessions !== null && pockets.length === 0;

  const openItem = useCallback(
    (item: RackItem) => {
      if (item.kind === 'live') router.navigate('/live');
      else router.push({ pathname: '/session/[id]', params: { id: item.meta.id } });
    },
    [router],
  );

  const openPocket = useCallback(
    (key: string) => {
      const p = pockets.find((x) => x.key === key);
      if (!p) return;
      const stack = q && p.hits ? p.items.slice(0, p.hits) : p.items;
      if (stack.length === 1) openItem(stack[0]);
      else setViewer({ key, closing: false });
    },
    [pockets, q, openItem],
  );

  const shownPocket = viewer ? pockets.find((p) => p.key === viewer.key) : undefined;
  const closeViewer = useCallback(() => setViewer((v) => (v ? { ...v, closing: true } : v)), []);
  const clearViewer = useCallback(() => setViewer(null), []);
  // The open stack takes the first back (button, edge swipe or Android back); the next leaves.
  usePreventRemove(!!shownPocket, closeViewer);

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(racks.length - 1, i));
    pager.current?.scrollTo({ x: next * root.w, animated: !reduceMotion });
    setPage(next);
  };

  const onRoot = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setRoot((prev) => (prev.w !== width || height > prev.h ? { w: width, h: height } : prev));
  };

  const toggleSearch = () => {
    if (searching) setQuery('');
    setSearching(!searching);
  };

  return (
    <View style={{ flex: 1, backgroundColor: r.wall }} onLayout={onRoot}>
      <RackWall width={root.w} height={root.h} simple={tier === 'lite'} scrollX={motion ? scrollX : undefined} />

      <View style={{ flex: 1 }} importantForAccessibility={shownPocket ? 'no-hide-descendants' : 'auto'}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to Library"
            hitSlop={6}
            style={({ pressed }) => [styles.round, { borderColor: r.wire, opacity: pressed ? 0.5 : 1 }]}
          >
            <Icon name="chevronLeft" size={22} color={r.title} strokeWidth={2.2} />
          </Pressable>

          <View style={styles.middle}>
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
                {q ? (
                  <Text style={[styles.found, { color: r.overline }]} accessibilityLiveRegion="polite">
                    {found} found
                  </Text>
                ) : null}
              </View>
            ) : (
              <>
                <Text style={[styles.overline, { color: r.overline }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {savedCount ? `LIBRARY · ${savedCount} SAVED` : 'LIBRARY / ON THIS PHONE'}
                </Text>
                <Text style={[styles.title, { color: r.title }]} accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  The Rack
                </Text>
              </>
            )}
          </View>

          <Pressable
            onPress={toggleSearch}
            accessibilityRole="button"
            accessibilityLabel={searching ? 'Close search' : 'Search the rack'}
            hitSlop={6}
            style={({ pressed }) => [styles.round, { borderColor: r.wire, opacity: pressed ? 0.5 : 1 }]}
          >
            <Icon name={searching ? 'close' : 'search'} size={19} color={r.title} />
          </Pressable>
        </View>

        {layout ? (
          <View style={{ height: layout.rows * layout.shelfH + RACK.top + RACK.base }}>
            <Animated.ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, root.w)))}
              keyboardShouldPersistTaps="handled"
            >
              {racks.map((rack, i) => (
                <RackPage
                  key={i}
                  index={i}
                  width={root.w}
                  // Only the racks either side of this one are drawn.
                  drawn={Math.abs(i - current) <= 1}
                  rack={rack}
                  layout={layout}
                  loading={sessions === null}
                  empty={empty}
                  searching={!!q}
                  motion={motion}
                  scrollX={scrollX}
                  onPocket={openPocket}
                />
              ))}
            </Animated.ScrollView>

            {empty ? (
              <View style={styles.noteWrap} pointerEvents="box-none">
                <View style={[styles.note, { backgroundColor: r.wallLight, borderColor: r.wire }]}>
                  <Text style={[styles.noteTitle, { color: r.title }]}>Nothing on the rack yet</Text>
                  <Text style={[styles.noteBody, { color: r.title }]}>
                    Meetings you listen to and text you scan are kept here as posters, on this phone only.
                  </Text>
                  <Button label="Start Listening" icon="mic" accent onPress={() => router.navigate('/live')} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        <Counter bottomInset={insets.bottom}>
          {racks.length > 1 ? (
            <View
              style={styles.dots}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Rack"
              accessibilityValue={{ text: `${current + 1} of ${racks.length}` }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => goTo(current + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
            >
              {racks.map((rack, i) => {
                const hasHits = !q || rack.some((p) => p.hits > 0);
                return (
                  <Pressable key={i} onPress={() => goTo(i)} hitSlop={{ top: 4, bottom: 4 }} style={styles.dotHit} accessibilityRole="button" accessibilityLabel={`Rack ${i + 1}`}>
                    <View style={[styles.dot, { backgroundColor: i === current ? r.lip : r.title, opacity: i === current ? 1 : hasHits ? 0.35 : 0.1 }]} />
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </Counter>
      </View>

      {shownPocket && viewer && root.w > 0 ? (
        <StackViewer
          title={shownPocket.spoken}
          items={q && shownPocket.hits ? shownPocket.items.slice(0, shownPocket.hits) : shownPocket.items}
          width={root.w}
          height={root.h}
          topInset={insets.top}
          bottomInset={insets.bottom}
          motion={motion}
          closing={viewer.closing}
          onClose={closeViewer}
          onClosed={clearViewer}
          onOpen={openItem}
        />
      ) : null}
    </View>
  );
}

/** One rack of pockets. While swiping, racks turn slightly, like walking past them in a shop. */
function RackPage({
  index,
  width,
  drawn,
  rack,
  layout,
  loading,
  empty,
  searching,
  motion,
  scrollX,
  onPocket,
}: {
  index: number;
  width: number;
  drawn: boolean;
  rack: ShownPocket[];
  layout: RackLayout;
  loading: boolean;
  empty: boolean;
  searching: boolean;
  motion: boolean;
  scrollX: SharedValue<number>;
  onPocket: (key: string) => void;
}) {
  const turn = useAnimatedStyle(() => {
    if (!motion) return { transform: [{ perspective: 1000 }, { rotateX: '2deg' }] };
    const d = Math.max(-1, Math.min(1, (scrollX.get() - index * width) / Math.max(1, width)));
    return { transform: [{ perspective: 1000 }, { rotateX: '2deg' }, { rotateY: `${-14 * d}deg` }, { scale: 1 - 0.06 * Math.abs(d) }] };
  });

  const { cols, rows, posterW, posterH } = layout;
  return (
    <Animated.View style={[{ width }, turn]}>
      {drawn ? (
        <>
          <RackTop />
          {Array.from({ length: rows }, (_, row) => {
            const slots = Array.from({ length: cols }, (_, c) => rack[row * cols + c] ?? null);
            return (
              <PocketShelf key={row} cols={cols} posterW={posterW} labels={slots.map((p) => (p ? lipLabel(p, searching) : null))}>
                {slots.map((p, c) =>
                  p ? (
                    <PocketView
                      key={p.key}
                      pocketKey={p.key}
                      items={p.items}
                      label={spokenLabel(p, searching)}
                      width={posterW}
                      height={posterH}
                      dimmed={searching && p.hits === 0}
                      motion={motion}
                      onPress={onPocket}
                    />
                  ) : (
                    <EmptyPocket key={`empty-${c}`} width={posterW} height={posterH} dashed={empty && !loading} />
                  ),
                )}
              </PocketShelf>
            );
          })}
          <RackFeet />
        </>
      ) : null}
    </Animated.View>
  );
}

function lipLabel(p: ShownPocket, searching: boolean): string {
  const n = p.items.length;
  if (searching) return p.hits ? `${p.label} · ${p.hits}/${n}` : p.label;
  return n > 1 ? `${p.label} · ${n}` : p.label;
}

function spokenLabel(p: ShownPocket, searching: boolean): string {
  const n = p.items.length;
  const match = searching ? `, ${p.hits} ${p.hits === 1 ? 'match' : 'matches'}` : '';
  return `${p.spoken}, ${n} saved${match}.`;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: RACK.margin, paddingBottom: 10 },
  middle: { flex: 1, minHeight: 56, justifyContent: 'center' },
  round: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  overline: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 1.6, lineHeight: 15, fontVariant: ['tabular-nums'] },
  title: { fontFamily: fontFamily.display, fontSize: 30, lineHeight: 38, letterSpacing: -0.5 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: minTouch, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5 },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 16, paddingVertical: 0 },
  found: { fontFamily: fontFamily.medium, fontSize: 13, fontVariant: ['tabular-nums'] },
  noteWrap: { ...StyleSheet.absoluteFill, justifyContent: 'center', paddingHorizontal: RACK.margin + 18 },
  note: { padding: 16, borderRadius: 4, borderWidth: 1, gap: 6, transform: [{ rotate: '-0.6deg' }] },
  noteTitle: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 26 },
  noteBody: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 20 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dotHit: { width: 28, height: 40, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
