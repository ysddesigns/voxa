import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fontFamily } from '@/design/type';
import { SHELF_CHROME } from '@/features/library-rack/pockets';
import { useRack } from './rack-wall';

/** Rack geometry shared by the screen and the shelves. */
export const RACK = {
  /** Screen edge to the rack's posts. */
  margin: 14,
  /** Posts to the pockets. */
  inset: 10,
  gap: 10,
  post: 3,
  /** Heights of the top bar and of the bottom bar with feet. */
  top: 18,
  base: 30,
} as const;

/** The two uprights, drawn by every piece of the rack so they join up. */
function Posts() {
  const r = useRack();
  return (
    <>
      <View style={[styles.post, { left: 0, backgroundColor: r.wire }]} />
      <View style={[styles.post, { right: 0, backgroundColor: r.wire }]} />
      <View style={[styles.postShadow, { left: RACK.post + 3, backgroundColor: r.shade }]} />
      <View style={[styles.postShadow, { right: -4, backgroundColor: r.shade }]} />
    </>
  );
}

/**
 * One shelf: a row of pockets behind an orange lip, with each pocket's label on the lip right
 * under it. `labels` lines up with the pockets (null for an empty pocket).
 */
export function PocketShelf({ cols, posterW, labels, children }: { cols: number; posterW: number; labels: (string | null)[]; children: ReactNode }) {
  const r = useRack();
  return (
    <View style={styles.rack}>
      <Posts />
      <View style={styles.row}>{children}</View>
      <View style={[styles.lip, { backgroundColor: r.lip }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.lipShine, { backgroundColor: r.onLip }]} />
        {/* The lip sticks out 2 past the posts: pad 2 more so labels sit under their pockets. */}
        <View style={[styles.row, { paddingHorizontal: RACK.inset + 2 }]}>
          {Array.from({ length: cols }, (_, i) => (
            <Text
              key={i}
              style={[styles.lipText, { width: posterW, color: r.onLip }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              maxFontSizeMultiplier={1.2}
            >
              {labels[i] ?? ''}
            </Text>
          ))}
        </View>
      </View>
      <View style={[styles.lipShadow, { backgroundColor: r.shade }]} />
    </View>
  );
}

/** The rack's top bar. */
export function RackTop() {
  const r = useRack();
  return (
    <View style={[styles.rack, { height: RACK.top }]}>
      <View style={[styles.post, { left: 0, top: 6, backgroundColor: r.wire }]} />
      <View style={[styles.post, { right: 0, top: 6, backgroundColor: r.wire }]} />
      <View style={[styles.bar, { top: 6, backgroundColor: r.wire }]} />
      <View style={[styles.bar, { top: 12, height: 3, left: 4, right: -4, backgroundColor: r.shade }]} />
    </View>
  );
}

/** The bottom bar and the feet the rack stands on. */
export function RackFeet() {
  const r = useRack();
  return (
    <View style={[styles.rack, { height: RACK.base }]}>
      <Posts />
      <View style={[styles.bar, { top: 6, backgroundColor: r.wire }]} />
      <View style={[styles.foot, { left: -4, backgroundColor: r.wire }]} />
      <View style={[styles.foot, { right: -4, backgroundColor: r.wire }]} />
    </View>
  );
}

/** The counter's least height above the home indicator: its edge plus room for the rack dots. */
export const COUNTER_MIN = 56;

/** The wooden counter under the rack; fills what is left of the screen. */
export function Counter({ bottomInset, children }: { bottomInset: number; children?: ReactNode }) {
  const r = useRack();
  return (
    <View style={{ flex: 1, minHeight: COUNTER_MIN + bottomInset }}>
      <View style={{ height: 10, backgroundColor: r.counterEdge }} />
      <View style={{ flex: 1, backgroundColor: r.counter, paddingBottom: bottomInset }}>
        <View style={{ height: 4, backgroundColor: r.shade }} />
        <View style={styles.counterBody}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rack: { marginHorizontal: RACK.margin },
  row: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: RACK.inset, gap: RACK.gap },
  post: { position: 'absolute', top: 0, bottom: 0, width: RACK.post, borderRadius: 2 },
  postShadow: { position: 'absolute', top: 6, bottom: -6, width: 3, borderRadius: 2 },
  lip: { height: SHELF_CHROME.lip, marginHorizontal: -2, borderRadius: 3, justifyContent: 'center' },
  lipShine: { position: 'absolute', top: 1.5, left: 6, right: 6, height: 1, opacity: 0.35 },
  lipText: { fontFamily: fontFamily.bold, fontSize: 9.5, letterSpacing: 1.2, lineHeight: 13, textAlign: 'center' },
  lipShadow: {
    height: SHELF_CHROME.below - 2,
    marginHorizontal: 6,
    marginBottom: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    transform: [{ translateX: 4 }],
  },
  bar: { position: 'absolute', left: -2, right: -2, height: 3, borderRadius: 2 },
  foot: { position: 'absolute', bottom: 0, width: 11, height: 4, borderRadius: 2 },
  counterBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
