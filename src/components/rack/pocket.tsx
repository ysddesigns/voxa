import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { SHELF_CHROME } from '@/features/library-rack/pockets';
import { itemBand, itemLabel, PosterFace, type RackItem } from './poster';
import { useRoom } from './room';

const OUT = Easing.bezier(0.23, 1, 0.32, 1);
/**
 * Older posters behind the front one. Further back on a shelf below the eye means higher up
 * (`up`), a touch smaller, and each leans a little from its base (`turn`).
 */
const EDGES = [
  { up: 6, x: -2, turn: -2.4, scale: 0.98 },
  { up: 11, x: 3, turn: 1.8, scale: 0.96 },
];

/**
 * One stack on a shelf: the newest poster standing in front, the tops of up to two older ones
 * showing behind it (the stack's depth), and the soft contact shadow where they meet the shelf.
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
  rich,
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
  /** Soft shadows and gloss (off on Lite phones). */
  rich: boolean;
  onPress: (key: string) => void;
}) {
  const { r } = useRoom();
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
  const hint = many
    ? `Shows all ${items.length}`
    : first?.kind === 'live'
      ? 'Opens the Live tab'
      : first?.kind === 'session' && first.meta.kind === 'scan'
        ? 'Opens the scanned text'
        : 'Opens the transcript';
  const total = height + SHELF_CHROME.peek;

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
      style={({ pressed }) => [{ width, height: total, opacity: dimmed ? 0.3 : !motion && pressed ? 0.75 : 1 }]}
    >
      <ContactShadow width={width} bottom={0} color={r.ao} />

      <Animated.View style={[StyleSheet.absoluteFill, fan]}>
        {EDGES.map((e, i) => {
          const behind = items[i + 1];
          if (!behind) return null;
          const band = itemBand(behind);
          return (
            <View
              key={i}
              style={[
                styles.edge,
                {
                  top: SHELF_CHROME.peek - e.up,
                  width,
                  height,
                  backgroundColor: band.bg,
                  transformOrigin: 'bottom',
                  transform: [{ translateX: e.x }, { rotate: `${e.turn}deg` }, { scale: e.scale }],
                },
              ]}
            >
              <View style={[styles.edgeShine, { backgroundColor: band.fg }]} />
              {/* Deeper in the stack, a little darker. */}
              <View style={[StyleSheet.absoluteFill, styles.edgeDepth, { backgroundColor: r.ao, opacity: 0.35 + i * 0.3 }]} />
            </View>
          );
        }).reverse()}
      </Animated.View>

      {first ? (
        <Animated.View style={[{ position: 'absolute', top: SHELF_CHROME.peek }, front]}>
          <PosterFace item={first} width={width} height={height} motion={motion} rich={rich} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
});

/** The soft dark ellipse where a stack meets the shelf. */
function ContactShadow({ width, bottom, color }: { width: number; bottom: number; color: string }) {
  const w = width + 16;
  return (
    <View style={{ position: 'absolute', left: -8, bottom: bottom - 4, width: w, height: 10 }} pointerEvents="none">
      <Svg width={w} height={10}>
        <Defs>
          <RadialGradient id="contact" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={w / 2} cy={5} rx={w / 2} ry={5} fill="url(#contact)" />
      </Svg>
    </View>
  );
}

/** A space on a shelf with nothing in it; a faint outline when the whole case is empty. */
export function EmptyPocket({ width, height, outline }: { width: number; height: number; outline?: boolean }) {
  const { r } = useRoom();
  return (
    <View style={{ width, height: height + SHELF_CHROME.peek }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {outline ? (
        <View
          style={{
            position: 'absolute',
            top: SHELF_CHROME.peek,
            width,
            height,
            borderRadius: 3,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: r.control,
            opacity: 0.35,
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, borderRadius: 3 },
  edgeShine: { position: 'absolute', top: 2, left: 6, right: 6, height: 1, opacity: 0.35 },
  edgeDepth: { borderRadius: 3 },
});
