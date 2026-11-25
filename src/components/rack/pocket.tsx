import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SHELF_CHROME } from '@/features/library-rack/pockets';
import { itemBand, itemLabel, PosterFace, type RackItem } from './poster';
import { useRack } from './rack-wall';

const OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Older posters behind the front one: how far each rises, slides and turns. */
const EDGES = [
  { up: 6, x: -2, turn: -2.2 },
  { up: 11, x: 3, turn: 1.6 },
];

/**
 * One pocket on the rack: the newest poster in front, the tops of up to two older ones
 * peeking out behind it (the stack's depth), and the wire front holding them in.
 * Pressing lifts the front poster and fans the edges a little.
 */
export const PocketView = memo(function PocketView({
  pocketKey,
  items,
  label,
  width,
  height,
  dimmed,
  motion,
  onPress,
}: {
  pocketKey: string;
  /** Newest (or best search match) first. */
  items: RackItem[];
  /** Spoken description, set by the shelf. */
  label: string;
  width: number;
  height: number;
  /** A search found nothing here: faded and skipped by screen readers. */
  dimmed?: boolean;
  motion: boolean;
  onPress: (key: string) => void;
}) {
  const r = useRack();
  const lift = useSharedValue(0);
  const front = useAnimatedStyle(() => ({
    transform: [{ translateY: -8 * lift.get() }, { rotate: `${-1 * lift.get()}deg` }],
  }));
  const fan = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * lift.get() }] }));
  const to = (v: number) => {
    if (motion) lift.set(withTiming(v, { duration: v ? 120 : 200, easing: OUT }));
  };

  const first = items[0];
  const many = items.length > 1;
  const hint = many ? `Shows all ${items.length}` : first?.kind === 'live' ? 'Opens the Live tab' : first?.kind === 'session' && first.meta.kind === 'scan' ? 'Opens the scanned text' : 'Opens the transcript';

  return (
    <Pressable
      onPress={() => onPress(pocketKey)}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      accessibilityRole="button"
      accessibilityLabel={first ? `${label} Newest: ${itemLabel(first)}` : label}
      accessibilityHint={hint}
      accessibilityElementsHidden={dimmed}
      importantForAccessibility={dimmed ? 'no-hide-descendants' : 'auto'}
      style={({ pressed }) => [{ width, height: height + SHELF_CHROME.peek, opacity: dimmed ? 0.28 : !motion && pressed ? 0.75 : 1 }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, fan]}>
        {EDGES.map((e, i) => {
          const behind = items[i + 1];
          if (!behind) return null;
          return (
            <View
              key={i}
              style={[
                styles.edge,
                {
                  top: SHELF_CHROME.peek - e.up,
                  width,
                  height,
                  backgroundColor: itemBand(behind).bg,
                  transform: [{ translateX: e.x }, { rotate: `${e.turn}deg` }],
                },
              ]}
            >
              <View style={[styles.edgeShine, { backgroundColor: itemBand(behind).fg }]} />
              {/* Deeper in the pocket, a little darker. */}
              <View style={[StyleSheet.absoluteFill, styles.edgeDepth, { backgroundColor: r.shade, opacity: 0.5 + i * 0.4 }]} />
            </View>
          );
        }).reverse()}
      </Animated.View>

      {first ? (
        <Animated.View style={[{ position: 'absolute', top: SHELF_CHROME.peek }, front]}>
          <PosterFace item={first} width={width} height={height} motion={motion} />
        </Animated.View>
      ) : null}

      <WireFront width={width} height={height} />
    </Pressable>
  );
});

/** The wire basket front across the lower part of a pocket. */
function WireFront({ width, height }: { width: number; height: number }) {
  const r = useRack();
  const h = Math.round(height * 0.36);
  return (
    <View pointerEvents="none" style={[styles.wire, { width: width + 6, height: h, borderColor: r.wire }]}>
      <View style={[styles.wireShine, { backgroundColor: r.wireShine }]} />
    </View>
  );
}

/** A pocket with nothing in it: the wire front, and a dashed outline on an empty rack. */
export function EmptyPocket({ width, height, dashed }: { width: number; height: number; dashed?: boolean }) {
  const r = useRack();
  return (
    <View style={{ width, height: height + SHELF_CHROME.peek }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {dashed ? (
        <View style={{ position: 'absolute', top: SHELF_CHROME.peek, width, height, borderRadius: 3, borderWidth: 1.5, borderStyle: 'dashed', borderColor: r.wire, opacity: 0.45 }} />
      ) : null}
      <WireFront width={width} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, borderRadius: 3 },
  edgeShine: { position: 'absolute', top: 2, left: 6, right: 6, height: 1, opacity: 0.35 },
  edgeDepth: { borderRadius: 3 },
  wire: { position: 'absolute', bottom: 0, left: -3, borderWidth: 1.5, borderBottomWidth: 0 },
  wireShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.75, opacity: 0.7 },
});
