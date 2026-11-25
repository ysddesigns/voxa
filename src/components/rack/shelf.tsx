import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fontFamily } from '@/design/type';
import { useRack } from './rack-wall';

/** Rack geometry, shared by the screen (to size posters) and the shelves. */
export const RACK = {
  /** Screen edge to the rack's posts. */
  margin: 14,
  /** Posts to the first and last poster. */
  inset: 12,
  gap: 10,
  /** Space above the posters on each shelf. */
  top: 16,
  lip: 24,
  /** Space under the lip, where its shadow falls. */
  below: 14,
  /** Wire pocket front, as a share of the poster's height from the bottom. */
  pocket: 0.36,
  post: 3,
} as const;

export function posterSize(screenWidth: number, perRow: number): { width: number; height: number } {
  const inner = screenWidth - 2 * RACK.margin - 2 * RACK.inset - (perRow - 1) * RACK.gap;
  const width = Math.floor(inner / perRow);
  return { width, height: Math.round(width * 1.42) };
}

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

/** One shelf: posters standing in wire pockets behind an orange lip with the shelf's label. */
export function Shelf({
  label,
  count,
  showLabel,
  posterHeight,
  slots,
  children,
}: {
  label: string;
  count: number;
  showLabel: boolean;
  posterHeight: number;
  /** Width of each poster slot, left to right, for the pocket wires. */
  slots: number[];
  children: ReactNode;
}) {
  const r = useRack();
  const pocketH = Math.round(posterHeight * RACK.pocket);
  return (
    <View style={styles.rack}>
      <Posts />
      <View style={[styles.row, { paddingTop: RACK.top, height: RACK.top + posterHeight }]}>{children}</View>

      {/* Wire pockets in front of the posters' lower part. */}
      <View style={[styles.pockets, { top: RACK.top + posterHeight - pocketH, height: pocketH }]} pointerEvents="none">
        {slots.map((w, i) => (
          <View key={i} style={{ width: w + 6, marginLeft: i === 0 ? RACK.inset - 3 : RACK.gap - 6, height: pocketH, borderColor: r.wire, borderWidth: 1.5, borderBottomWidth: 0 }}>
            <View style={[styles.pocketShine, { backgroundColor: r.wireShine }]} />
          </View>
        ))}
      </View>

      <View style={[styles.lip, { backgroundColor: r.lip }]} accessible accessibilityRole="header" accessibilityLabel={showLabel ? `${label}, ${count} saved` : label} importantForAccessibility={showLabel ? 'yes' : 'no-hide-descendants'} accessibilityElementsHidden={!showLabel}>
        <View style={[styles.lipShine, { backgroundColor: r.onLip }]} />
        <Text style={[styles.lipText, { color: r.onLip }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {showLabel ? (
          <Text style={[styles.lipText, { color: r.onLip }]} maxFontSizeMultiplier={1.3}>
            {count}
          </Text>
        ) : null}
      </View>
      <View style={[styles.lipShadow, { backgroundColor: r.shade }]} />
    </View>
  );
}

/** The rack's top bar (under the screen's header). */
export function RackTop() {
  const r = useRack();
  return (
    <View style={[styles.rack, { height: 18 }]}>
      <View style={[styles.post, { left: 0, top: 6, backgroundColor: r.wire }]} />
      <View style={[styles.post, { right: 0, top: 6, backgroundColor: r.wire }]} />
      <View style={[styles.bar, { top: 6, backgroundColor: r.wire }]} />
      <View style={[styles.bar, { top: 12, height: 3, left: 4, right: -4, backgroundColor: r.shade }]} />
    </View>
  );
}

/** The bottom bar, feet and the counter the rack stands on. */
export function RackBase({ bottomInset, children }: { bottomInset: number; children?: ReactNode }) {
  const r = useRack();
  return (
    <View>
      {children}
      <View style={[styles.rack, { height: 34 }]}>
        <Posts />
        <View style={[styles.bar, { top: 8, backgroundColor: r.wire }]} />
        <View style={[styles.foot, { left: -4, backgroundColor: r.wire }]} />
        <View style={[styles.foot, { right: -4, backgroundColor: r.wire }]} />
      </View>
      <View style={{ height: 10, backgroundColor: r.counterEdge }} />
      <View style={{ minHeight: 72 + bottomInset, backgroundColor: r.counter }}>
        <View style={{ height: 4, backgroundColor: r.shade }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rack: { marginHorizontal: RACK.margin },
  row: { flexDirection: 'row', paddingHorizontal: RACK.inset, gap: RACK.gap },
  post: { position: 'absolute', top: 0, bottom: 0, width: RACK.post, borderRadius: 2 },
  postShadow: { position: 'absolute', top: 6, bottom: -6, width: 3, borderRadius: 2 },
  pockets: { position: 'absolute', left: 0, right: 0, flexDirection: 'row' },
  pocketShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.75, opacity: 0.7 },
  lip: {
    height: RACK.lip,
    marginHorizontal: -2,
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  lipShine: { position: 'absolute', top: 1.5, left: 6, right: 6, height: 1, opacity: 0.35 },
  lipText: { fontFamily: fontFamily.bold, fontSize: 10.5, letterSpacing: 1.6, lineHeight: 14 },
  lipShadow: { height: 8, marginTop: 0, marginHorizontal: 6, marginBottom: RACK.below - 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, transform: [{ translateX: 4 }] },
  bar: { position: 'absolute', left: -2, right: -2, height: 3, borderRadius: 2 },
  foot: { position: 'absolute', bottom: 0, width: 11, height: 4, borderRadius: 2 },
});
