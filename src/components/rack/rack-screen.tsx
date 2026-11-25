import { useCallback, useMemo, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { LIVE_BAR_SPACE } from '@/components/live-bar';
import { CASE, CaseBase, CaseShelf, CaseTop, eyeLevel, FLOOR_MIN, FloorDots } from '@/components/rack/bookcase';
import { FloorDecor } from '@/components/rack/decor';
import { EmptyPocket, PocketView } from '@/components/rack/pocket';
import type { RackItem } from '@/components/rack/poster';
import { Room, useRoom, WindowLight } from '@/components/rack/room';
import { StackViewer } from '@/components/rack/stack-viewer';
import { Button } from '@/components/ui';
import { useDeviceTier } from '@/device/use-device-tier';
import { minTouch } from '@/design/tokens';
import { fontFamily } from '@/design/type';
import { posterTitle } from '@/features/library-rack/labels';
import { buildPockets, frontMatches, paginate, rackLayout, type Pocket, type RackLayout } from '@/features/library-rack/pockets';
import { useListen } from '@/features/listen/listen-session';
import { useSpeakSession } from '@/features/speak/speak-session';
import { sessionStore } from '@/storage';
import type { SessionMeta } from '@/storage/sessions';

/** A pocket as shown: its stack ordered for the search, and how many matched. */
type ShownPocket = Pocket<RackItem> & { hits: number };

/** The live poster always lands on Today, in front. */
const itemTime = (i: RackItem) => (i.kind === 'live' ? Infinity : i.meta.startedAt);

const matchSession = (m: SessionMeta, q: string) =>
  m.title.toLowerCase().includes(q) || posterTitle(m).toLowerCase().includes(q) || (m.text ?? '').toLowerCase().includes(q);

/** The wall meets the floor this far above the case's bottom, so the case stands on the floor. */
const FLOOR_OVERLAP = 12;

/** Height of the iOS system tab bar above the home indicator. */
const IOS_TAB_BAR = 49;
/** Android's floating Voxa tab pill (see android-tab-bar): height and the gap above it. */
const ANDROID_TAB_BAR = 64 + 8;

/**
 * The Library tab, "The Rack" (PRD LB-1): everything saved on this phone, as posters on a white
 * bookcase with an oak top in a sunlit room (lamplit at night), drawn in code. It always fits
 * the screen and grows deeper, not longer: each stack is one day, week or month, newest poster
 * in front, older ones showing behind. Tap a stack to pull it off the shelf; swipe across for
 * older cases. The tab bar floats over the floor, so the case stops above it.
 */
export function RackScreen() {
  const { r } = useRoom();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const l = useListen();
  const speaking = useSpeakSession().status !== 'idle';
  const tier = useDeviceTier();
  const reduceMotion = useReducedMotion();
  const motion = tier !== 'lite' && !reduceMotion;
  const rich = tier !== 'lite';

  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [viewer, setViewer] = useState<{ key: string; closing: boolean } | null>(null);
  const [page, setPage] = useState(0);
  // The whole screen, kept at its tallest so the keyboard never shrinks the case.
  const [root, setRoot] = useState({ w: 0, h: 0 });
  const [headerH, setHeaderH] = useState(0);

  const scrollX = useSharedValue(0);
  const pager = useAnimatedRef<Animated.ScrollView>();
  // What floats over the bottom of the screen: the tab bar, and on Android the Listen or Speak bar.
  const barBottom =
    Platform.OS === 'ios'
      ? insets.bottom + IOS_TAB_BAR
      : Math.max(insets.bottom, 12) + 8 + ANDROID_TAB_BAR + (l.status !== 'idle' || speaking ? LIVE_BAR_SPACE : 0);

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
    const area = root.h - headerH - CASE.top - CASE.base - (FLOOR_MIN + barBottom);
    if (root.w <= 0 || headerH <= 0 || area <= 0) return null;
    const inner = root.w - 2 * (CASE.margin + CASE.side + CASE.inset);
    return rackLayout({ width: inner, height: area, fontScale, gap: CASE.gap });
  }, [root, headerH, barBottom, fontScale]);

  const caseH = layout ? CASE.top + layout.rows * layout.shelfH + CASE.base : 0;
  const caseBottom = headerH + caseH;
  const floorY = layout ? caseBottom - FLOOR_OVERLAP : root.h * 0.8;
  const caseBox = useMemo(
    () => (layout ? { left: CASE.margin, right: root.w - CASE.margin, top: headerH, bottom: caseBottom } : null),
    [layout, root.w, headerH, caseBottom],
  );

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
  // An open stack takes Android's back; the next back does what it does on any tab.
  const viewerOpen = !!shownPocket;
  useFocusEffect(
    useCallback(() => {
      if (!viewerOpen) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        closeViewer();
        return true;
      });
      return () => sub.remove();
    }, [viewerOpen, closeViewer]),
  );

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
      <Room width={root.w} height={root.h} floorY={floorY} caseBox={caseBox} simple={!rich} />
      <WindowLight width={root.w} height={floorY} strength={0.9} simple={!rich} scrollX={motion ? scrollX : undefined} />

      <View style={{ flex: 1 }} importantForAccessibility={shownPocket ? 'no-hide-descendants' : 'auto'}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
          <View style={styles.middle}>
            {searching ? (
              <View style={[styles.search, { borderColor: r.control }]}>
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
                  {savedCount ? `THE RACK · ${savedCount} SAVED` : 'THE RACK · ON THIS PHONE'}
                </Text>
                <Text style={[styles.title, { color: r.title }]} accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  Library
                </Text>
              </>
            )}
          </View>

          <Pressable
            onPress={toggleSearch}
            accessibilityRole="button"
            accessibilityLabel={searching ? 'Close search' : 'Search the library'}
            hitSlop={6}
            style={({ pressed }) => [styles.round, { borderColor: r.control, opacity: pressed ? 0.5 : 1 }]}
          >
            <Icon name={searching ? 'close' : 'search'} size={19} color={r.title} />
          </Pressable>
        </View>

        {layout ? (
          <View style={{ height: caseH }}>
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
                <CasePage
                  key={i}
                  index={i}
                  width={root.w}
                  // Only the cases either side of this one are drawn.
                  drawn={Math.abs(i - current) <= 1}
                  rack={rack}
                  layout={layout}
                  loading={sessions === null}
                  empty={empty}
                  searching={!!q}
                  motion={motion}
                  rich={rich}
                  scrollX={scrollX}
                  onPocket={openPocket}
                />
              ))}
            </Animated.ScrollView>

            {/* The same window light, faintly, falling across the case and its posters. */}
            <View style={styles.caseClip} pointerEvents="none">
              <WindowLight
                width={root.w}
                height={floorY}
                left={-(CASE.margin - CASE.overhang)}
                top={-headerH}
                strength={0.3}
                simple={!rich}
                scrollX={motion ? scrollX : undefined}
              />
            </View>

            {empty ? (
              <View style={styles.noteWrap} pointerEvents="box-none">
                <View style={[styles.note, { backgroundColor: r.tagBg, borderColor: r.tagBorder }]}>
                  <Text style={[styles.noteTitle, { color: r.tagText }]}>Nothing on the shelves yet</Text>
                  <Text style={[styles.noteBody, { color: r.tagText }]}>
                    Meetings you listen to and text you scan are kept here as posters, on this phone only.
                  </Text>
                  <Button label="Start Listening" icon="mic" accent onPress={() => router.navigate('/live')} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.floor, { paddingBottom: barBottom, minHeight: FLOOR_MIN + barBottom }]}>
          {racks.length > 1 ? (
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Bookcase"
              accessibilityValue={{ text: `${current + 1} of ${racks.length}` }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => goTo(current + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
            >
              <FloorDots count={racks.length} current={current} dimmed={(i) => !!q && !racks[i].some((p) => p.hits > 0)} onPick={goTo} />
            </View>
          ) : null}
        </View>
      </View>

      {/* The floor vase and lantern stand in front of the case, over its plinth. */}
      {layout ? <FloorDecor bottom={barBottom + 2} rich={rich} /> : null}

      {shownPocket && viewer && root.w > 0 ? (
        <StackViewer
          title={shownPocket.spoken}
          items={q && shownPocket.hits ? shownPocket.items.slice(0, shownPocket.hits) : shownPocket.items}
          width={root.w}
          height={root.h}
          topInset={insets.top}
          bottomInset={barBottom}
          motion={motion}
          rich={rich}
          closing={viewer.closing}
          onClose={closeViewer}
          onClosed={clearViewer}
          onOpen={openItem}
        />
      ) : null}
    </View>
  );
}

/** One bookcase of stacks. While swiping, cases turn slightly, like walking past them in a shop. */
function CasePage({
  index,
  width,
  drawn,
  rack,
  layout,
  loading,
  empty,
  searching,
  motion,
  rich,
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
  rich: boolean;
  scrollX: SharedValue<number>;
  onPocket: (key: string) => void;
}) {
  const turn = useAnimatedStyle(() => {
    if (!motion) return { transform: [{ perspective: 1000 }] };
    const d = Math.max(-1, Math.min(1, (scrollX.get() - index * width) / Math.max(1, width)));
    return { transform: [{ perspective: 1000 }, { rotateY: `${-12 * d}deg` }, { scale: 1 - 0.05 * Math.abs(d) }] };
  });

  const { cols, rows, posterW, posterH } = layout;
  return (
    <Animated.View style={[{ width }, turn]}>
      {drawn ? (
        <>
          <CaseTop screenW={width} />
          {Array.from({ length: rows }, (_, row) => {
            const slots = Array.from({ length: cols }, (_, c) => rack[row * cols + c] ?? null);
            return (
              <CaseShelf
                key={row}
                screenW={width}
                posterW={posterW}
                posterH={posterH}
                eye={eyeLevel(row, rows)}
                rich={rich}
                tags={slots.map((p) => (p ? tagLabel(p, searching) : null))}
              >
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
                      rich={rich}
                      onPress={onPocket}
                    />
                  ) : (
                    <EmptyPocket key={`empty-${c}`} width={posterW} height={posterH} outline={empty && !loading} />
                  ),
                )}
              </CaseShelf>
            );
          })}
          <CaseBase screenW={width} />
        </>
      ) : null}
    </Animated.View>
  );
}

function tagLabel(p: ShownPocket, searching: boolean): string {
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: CASE.margin, paddingBottom: 12 },
  middle: { flex: 1, minHeight: 56, justifyContent: 'center' },
  round: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  overline: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 1.6, lineHeight: 15, fontVariant: ['tabular-nums'] },
  title: { fontFamily: fontFamily.display, fontSize: 30, lineHeight: 38, letterSpacing: -0.5 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: minTouch, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5 },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 16, paddingVertical: 0 },
  found: { fontFamily: fontFamily.medium, fontSize: 13, fontVariant: ['tabular-nums'] },
  noteWrap: { ...StyleSheet.absoluteFill, justifyContent: 'center', paddingHorizontal: CASE.margin + 24 },
  note: { padding: 16, borderRadius: 3, borderWidth: 1, gap: 6, transform: [{ rotate: '-0.6deg' }] },
  noteTitle: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 26 },
  noteBody: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 20 },
  floor: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /** The case's outline (oak top included), so light laid over it stays on it. */
  caseClip: { position: 'absolute', top: 0, bottom: 0, left: CASE.margin - CASE.overhang, right: CASE.margin - CASE.overhang, overflow: 'hidden' },
});
