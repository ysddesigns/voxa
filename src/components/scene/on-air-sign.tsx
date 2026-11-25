import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { onAirSign as ART } from '@/design/tokens';
import { fontFamily } from '@/design/type';
import { Gloss } from './gloss';
import { PaperShadow } from './shadows';

const SIZES = {
  large: { w: 172, h: 58, font: 22, pad: 6, radius: 6, shadow: 1 },
  small: { w: 92, h: 32, font: 12, pad: 4, radius: 4, shadow: 0.6 },
} as const;

/**
 * The studio's ON AIR lightbox, hung on the wall: a dark housing round a red glass panel.
 * Lit while Voxa is listening, with a warm glow on the wall that breathes slowly (`motion`);
 * off, the glass goes dark. Decoration only: the screen says the state in words, so screen
 * readers skip it. Its type stays one size, as a sign's does.
 */
export function OnAirSign({ lit, size = 'large', motion = false, rich = true }: { lit: boolean; size?: keyof typeof SIZES; motion?: boolean; rich?: boolean }) {
  const s = SIZES[size];
  const glow = useSharedValue(lit ? 1 : 0);
  useEffect(() => {
    cancelAnimation(glow);
    if (!lit) {
      glow.set(withTiming(0, { duration: 200 }));
      return;
    }
    const on = withTiming(1, { duration: 200 });
    glow.set(motion ? withSequence(on, withRepeat(withTiming(0.55, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true)) : on);
    return () => cancelAnimation(glow);
  }, [lit, motion, glow]);
  const halo = useAnimatedStyle(() => ({ opacity: glow.get() }));

  return (
    <View style={{ width: s.w, height: s.h }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* The lit glass throws a soft red glow on the wall around the sign. */}
      {rich ? (
        <Animated.View style={[styles.halo, { left: -s.w * 0.35, top: -s.h * 0.9, width: s.w * 1.7, height: s.h * 2.8 }, halo]} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="onAirGlow" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
                <Stop offset="0" stopColor={ART.glow} stopOpacity={0.42} />
                <Stop offset="1" stopColor={ART.glow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={50} cy={50} rx={50} ry={50} fill="url(#onAirGlow)" />
          </Svg>
        </Animated.View>
      ) : null}
      <PaperShadow scale={s.shadow} rich={rich} radius={s.radius} />
      <View style={[styles.housing, { padding: s.pad, borderRadius: s.radius, backgroundColor: ART.housing, borderColor: ART.housingEdge }]}>
        <View style={[styles.glass, { borderRadius: s.radius / 2, backgroundColor: lit ? ART.glassOn : ART.glassOff }]}>
          <Text
            style={[styles.ink, { fontSize: s.font, lineHeight: s.font * 1.2, letterSpacing: s.font * 0.14, color: lit ? ART.inkOn : ART.inkOff }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1}
          >
            ON AIR
          </Text>
          {rich ? <Gloss /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: 'absolute' },
  housing: { ...StyleSheet.absoluteFill, borderWidth: 1 },
  glass: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ink: { fontFamily: fontFamily.heavy },
});
