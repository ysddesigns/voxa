import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { fontFamily } from '@/design/type';
import { posterA11yLabel, posterOverline, posterTitle } from '@/features/library-rack/labels';
import { BANDS, posterScene, type Band } from '@/features/library-rack/poster-art';
import type { SessionMeta } from '@/storage/sessions';
import { LiveArt, PosterArt } from './poster-art';
import { useRack } from './rack-wall';

type FrameProps = {
  width: number;
  height: number;
  band: Band;
  overline: ReactNode;
  title: string;
  label: string;
  hint: string;
  /** Faded by a search that it does not match; hidden from screen readers. */
  dimmed?: boolean;
  /** Lift out of the rack when pressed (off on Lite phones and with reduced motion). */
  motion: boolean;
  onPress: () => void;
  children: ReactNode;
};

/** The paper, its flat cast shadow, the title band and the press-lift. */
function PosterFrame({ width, height, band, overline, title, label, hint, dimmed, motion, onPress, children }: FrameProps) {
  const r = useRack();
  const lift = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * lift.value }, { rotate: `${-1.2 * lift.value}deg` }] }));
  const shadow = useAnimatedStyle(() => ({ transform: [{ translateX: 3 + 3 * lift.value }, { translateY: 4 + 6 * lift.value }], opacity: 1 - 0.3 * lift.value }));
  const to = (v: number) => {
    if (motion) lift.value = withTiming(v, { duration: v ? 140 : 220, easing: Easing.out(Easing.cubic) });
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityElementsHidden={dimmed}
      importantForAccessibility={dimmed ? 'no-hide-descendants' : 'auto'}
      style={{ width, height, opacity: dimmed ? 0.28 : 1 }}
    >
      {({ pressed }) => (
        <>
          <Animated.View style={[styles.fill, { backgroundColor: r.shade, borderRadius: 3 }, shadow]} />
          <Animated.View style={[styles.fill, styles.paper, !motion && pressed && { opacity: 0.8 }, style]}>
            <View style={[styles.band, { backgroundColor: band.bg }]}>
              {overline}
              <Text
                style={[styles.title, { color: band.fg }]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.4}
              >
                {title}
              </Text>
            </View>
            <View style={styles.art}>{children}</View>
            <View style={[styles.fill, { backgroundColor: r.posterVeil }]} pointerEvents="none" />
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}

function Overline({ text, color }: { text: string; color: string }) {
  return (
    <Text style={[styles.overline, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
      {text}
    </Text>
  );
}

/** A saved session as a poster. Its art comes from the session (see poster-art). */
export const Poster = memo(function Poster({
  meta,
  width,
  height,
  dimmed,
  motion,
  onOpen,
}: {
  meta: SessionMeta;
  width: number;
  height: number;
  dimmed?: boolean;
  motion: boolean;
  onOpen: (id: string) => void;
}) {
  const scene = useMemo(() => posterScene(meta), [meta]);
  return (
    <PosterFrame
      width={width}
      height={height}
      band={scene.band}
      overline={<Overline text={posterOverline(meta)} color={scene.band.fg} />}
      title={posterTitle(meta)}
      label={posterA11yLabel(meta)}
      hint={meta.kind === 'scan' ? 'Opens the scanned text' : 'Opens the transcript'}
      dimmed={dimmed}
      motion={motion}
      onPress={() => onOpen(meta.id)}
    >
      <PosterArt scene={scene} id={meta.id} />
    </PosterFrame>
  );
});

/** The meeting being recorded, first on the rack, with a breathing "ON AIR" light. */
export function LivePoster({
  title,
  paused,
  width,
  height,
  motion,
  onPress,
}: {
  title: string;
  paused: boolean;
  width: number;
  height: number;
  motion: boolean;
  onPress: () => void;
}) {
  const band = BANDS[1];
  const reduce = useReducedMotion();
  const glow = useSharedValue(1);
  const breathe = motion && !paused && !reduce;
  useEffect(() => {
    cancelAnimation(glow);
    glow.value = 1;
    if (breathe) glow.value = withRepeat(withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(glow);
  }, [breathe, glow]);
  const dot = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <PosterFrame
      width={width}
      height={height}
      band={band}
      overline={
        <View style={styles.onAir}>
          <Animated.View style={[styles.dot, { backgroundColor: band.fg }, dot]} />
          <Overline text={paused ? 'PAUSED' : 'ON AIR'} color={band.fg} />
        </View>
      }
      title={title || 'Listening'}
      label={`${paused ? 'Listening paused' : 'Listening now'}: ${title}`}
      hint="Opens the Live tab"
      motion={motion}
      onPress={onPress}
    >
      <LiveArt />
    </PosterFrame>
  );
}

/** An empty pocket: what the rack shows before anything is saved. */
export function EmptySlot({ width, height }: { width: number; height: number }) {
  const r = useRack();
  return <View style={{ width, height, borderRadius: 3, borderWidth: 1.5, borderStyle: 'dashed', borderColor: r.wire, opacity: 0.45 }} />;
}

const styles = StyleSheet.create({
  fill: StyleSheet.absoluteFill,
  paper: { borderRadius: 3, overflow: 'hidden' },
  band: { paddingHorizontal: 7, paddingTop: 6, paddingBottom: 6, gap: 2 },
  overline: { fontFamily: fontFamily.semibold, fontSize: 9, letterSpacing: 0.6, lineHeight: 11 },
  title: { fontFamily: fontFamily.display, fontSize: 13, lineHeight: 15.5, letterSpacing: -0.1 },
  art: { flex: 1 },
  onAir: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
