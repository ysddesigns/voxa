import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

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
