import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Bars that move like speech while `active` (the now-speaking bar), and rest at their shape when
 * paused or when the phone asks for reduced motion.
 */
export function SpeakingWave({
  bars,
  maxHeight,
  minHeight = 4,
  barWidth = 3,
  gap = 2,
  color,
  active,
}: {
  bars: number;
  maxHeight: number;
  minHeight?: number;
  barWidth?: number;
  gap?: number;
  color: string;
  active: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  const moving = active && !reduceMotion;
  useEffect(() => {
    cancelAnimation(t);
    t.value = 0;
    if (moving) t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
  }, [moving, t]);
  const heights = waveHeights(bars, 0.8);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', gap, height: maxHeight }}>
      {heights.map((h, i) => (
        <SpeakingBar key={i} index={i} shape={h} t={t} moving={moving} maxHeight={maxHeight} minHeight={minHeight} width={barWidth} color={color} />
      ))}
    </View>
  );
}

function SpeakingBar({
  index,
  shape,
  t,
  moving,
  maxHeight,
  minHeight,
  width,
  color,
}: {
  index: number;
  shape: number;
  t: SharedValue<number>;
  moving: boolean;
  maxHeight: number;
  minHeight: number;
  width: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    // Each bar rises and falls on its own beat, so the row reads as a voice rather than a pulse.
    const level = moving ? 0.25 + 0.75 * Math.abs(Math.sin((t.value * 2 + index * 0.37) * Math.PI)) : 0.35 + 0.65 * shape;
    return { height: minHeight + level * (maxHeight - minHeight) };
  });
  return <Animated.View style={[{ width, borderRadius: width / 2, backgroundColor: color }, style]} />;
}

/** Deterministic bar heights (0..1) so the same waveform renders on every device. */
export function waveHeights(count: number, seed = 0.3): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = Math.abs(Math.sin(i * 1.1 + seed) * 0.6 + Math.sin(i * 0.5) * 0.4);
    out.push(Math.min(1, v));
  }
  return out;
}

type Props = {
  bars: number;
  maxHeight: number;
  minHeight?: number;
  barWidth?: number;
  gap?: number;
  color: string;
  /** Slow idle "breathing" (Home hero). Turned off when the OS asks for reduced motion. */
  breathe?: boolean;
  seed?: number;
};

export function Waveform({
  bars,
  maxHeight,
  minHeight = 6,
  barWidth = 4,
  gap = 3,
  color,
  breathe = false,
  seed,
}: Props) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!breathe || reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(0.82, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [breathe, reduceMotion, pulse]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scaleY: pulse.value }] }));
  const heights = waveHeights(bars, seed);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ flexDirection: 'row', alignItems: 'center', gap, height: maxHeight }, animated]}
    >
      {heights.map((h, i) => (
        <View
          key={i}
          style={{
            width: barWidth,
            borderRadius: barWidth / 2,
            height: Math.round(minHeight + h * (maxHeight - minHeight)),
            backgroundColor: color,
          }}
        />
      ))}
    </Animated.View>
  );
}
