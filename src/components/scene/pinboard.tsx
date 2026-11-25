import { memo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useScene } from '@/design/scene';
import { pinArt } from '@/design/tokens';
import { hashId, seeded } from '@/features/library-rack/poster-art';
import { PaperShadow } from './shadows';

/** Cork grain: specks per 1000 square points, capped so a long board stays cheap. */
const SPECKS_PER_K = 0.9;
const MAX_SPECKS = 260;

/**
 * A cork pinboard in an oak frame, hung on the wall: the Phrases screen's board. Its frame is lit
 * on the room's light side; `rich` adds the cork's grain. Children are laid out inside it.
 */
export function Pinboard({ children, rich = true, style }: { children: ReactNode; rich?: boolean; style?: StyleProp<ViewStyle> }) {
  const { r, light } = useScene();
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={style}>
      <PaperShadow rich={rich} radius={5} />
      <View
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setSize((s) => (Math.abs(s.w - w) < 1 && Math.abs(s.h - h) < 1 ? s : { w, h }));
        }}
        style={[
          styles.board,
          {
            backgroundColor: r.cork,
            borderTopColor: r.oakLight,
            borderBottomColor: r.oakDark,
            borderLeftColor: light === 'left' ? r.oakLight : r.oak,
            borderRightColor: light === 'left' ? r.oak : r.oakLight,
          },
        ]}
      >
        {rich ? <CorkGrain width={size.w} height={size.h} color={r.corkGrain} /> : null}
        {children}
      </View>
    </View>
  );
}

const CorkGrain = memo(function CorkGrain({ width, height, color }: { width: number; height: number; color: string }) {
  if (width <= 0 || height <= 0) return null;
  const rand = seeded(11);
  const count = Math.min(MAX_SPECKS, Math.round(((width * height) / 1000) * SPECKS_PER_K));
  const specks = Array.from({ length: count }, (_, i) => (
    <Circle key={i} cx={(rand() * width).toFixed(1)} cy={(rand() * height).toFixed(1)} r={(0.6 + rand() * 1.1).toFixed(2)} fill={color} opacity={0.25 + rand() * 0.35} />
  ));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>{specks}</Svg>
    </View>
  );
});

/**
 * A paper card pinned to the board, a touch crooked (the tilt comes from `seed`, so a card keeps
 * it). `active` lifts it and rings it in the accent, for the phrase being spoken. The whole card
 * is the button.
 */
export function PinnedCard({
  seed,
  active,
  onPress,
  accessibilityLabel,
  rich = true,
  style,
  children,
}: {
  seed: string;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  rich?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { r } = useScene();
  const tilt = ((hashId(seed) % 7) - 3) * 0.3;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, { transform: [{ rotate: `${tilt}deg` }, { translateY: active ? -2 : pressed ? -1 : 0 }] }]}
    >
      <PaperShadow rich={rich && active} radius={2} scale={active ? 1 : 0.6} />
      <View style={[styles.card, { backgroundColor: r.tagBg, borderColor: active ? r.accent : 'transparent' }]}>{children}</View>
      <Pin shadow={r.shadow} />
    </Pressable>
  );
}

/** A round red pin head with a glint, and its little shadow on the paper. */
function Pin({ shadow }: { shadow: string }) {
  return (
    <View style={styles.pinWrap} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.pinShadow, { backgroundColor: shadow }]} />
      <View style={[styles.pin, { backgroundColor: pinArt.head }]}>
        <View style={[styles.pinShine, { backgroundColor: pinArt.shine }]} />
      </View>
    </View>
  );
}

const PIN = 12;

const styles = StyleSheet.create({
  board: { borderWidth: 7, borderRadius: 5, padding: 12, overflow: 'hidden' },
  card: { flexGrow: 1, borderRadius: 2, borderWidth: 2, paddingHorizontal: 12, paddingTop: 18, paddingBottom: 12, minHeight: 72 },
  pinWrap: { position: 'absolute', top: 2, left: 0, right: 0, alignItems: 'center' },
  pinShadow: { position: 'absolute', top: 4, marginLeft: 5, width: PIN, height: PIN, borderRadius: PIN / 2 },
  pin: { width: PIN, height: PIN, borderRadius: PIN / 2 },
  pinShine: { position: 'absolute', top: 2, left: 3, width: 4, height: 3, borderRadius: 2 },
});
