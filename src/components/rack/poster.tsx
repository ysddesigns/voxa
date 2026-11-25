import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { fontFamily } from '@/design/type';
import { posterA11yLabel, posterOverline, posterTitle } from '@/features/library-rack/labels';
import { BANDS, posterScene, type Band, type PosterScene } from '@/features/library-rack/poster-art';
import type { SessionMeta } from '@/storage/sessions';
import { LiveArt, PosterArt } from './poster-art';
import { useRoom } from './room';

/** What sits on the rack: a saved session, or the meeting being recorded now. */
export type RackItem = { kind: 'session'; meta: SessionMeta } | { kind: 'live'; title: string; paused: boolean };

export const itemKey = (i: RackItem) => (i.kind === 'live' ? 'live' : i.meta.id);

// Scenes are pure functions of the session; keep one per meta object.
const scenes = new WeakMap<SessionMeta, PosterScene>();
export function sceneOf(meta: SessionMeta): PosterScene {
  let s = scenes.get(meta);
  if (!s) scenes.set(meta, (s = posterScene(meta)));
  return s;
}

export const itemBand = (i: RackItem): Band => (i.kind === 'live' ? BANDS[1] : sceneOf(i.meta).band);

export const itemLabel = (i: RackItem) =>
  i.kind === 'live' ? `${i.paused ? 'Listening paused' : 'Listening now'}: ${i.title || 'Listening'}` : posterA11yLabel(i.meta);

/**
 * A poster as seen: a soft shadow cast away from the room's light, paper, title band, art, and
 * (when `rich`) a faint gloss across the paper. Not pressable itself; the pocket or the carousel
 * around it handles the press. `scale` enlarges the type for big posters.
 */
export const PosterFace = memo(function PosterFace({
  item,
  width,
  height,
  scale = 1,
  motion,
  rich = true,
}: {
  item: RackItem;
  width: number;
  height: number;
  scale?: number;
  motion: boolean;
  /** Soft shadow layers and gloss (off on Lite phones). */
  rich?: boolean;
}) {
  const { r, light } = useRoom();
  const band = itemBand(item);
  const s = Math.max(1, scale);
  const away = light === 'left' ? 1 : -1;
  // Three offset layers, wider and fainter, make a soft shadow without blur.
  const layers = rich ? [3, 6, 10] : [4];
  return (
    <View style={{ width, height }}>
      {layers.map((d, i) => (
        <View
          key={d}
          style={[
            styles.fill,
            styles.shadow,
            { backgroundColor: r.shadow, opacity: rich ? [0.9, 0.55, 0.3][i] : 1, transform: [{ translateX: away * d * s }, { translateY: d * 0.4 * s }] },
          ]}
        />
      ))}
      <View style={[styles.fill, styles.paper]}>
        <View style={[styles.band, { backgroundColor: band.bg, paddingHorizontal: 7 * s, paddingVertical: 6 * s, gap: 2 * s }]}>
          {item.kind === 'live' ? (
            <OnAir paused={item.paused} color={band.fg} scale={s} motion={motion} />
          ) : (
            <Overline text={posterOverline(item.meta)} color={band.fg} scale={s} />
          )}
          <Text
            style={[styles.title, { color: band.fg, fontSize: 13 * s, lineHeight: 15.5 * s }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
          >
            {item.kind === 'live' ? item.title || 'Listening' : posterTitle(item.meta)}
          </Text>
        </View>
        <View style={styles.art}>{item.kind === 'live' ? <LiveArt /> : <PosterArt scene={sceneOf(item.meta)} id={item.meta.id} />}</View>
        <View style={[styles.fill, { backgroundColor: r.posterVeil }]} pointerEvents="none" />
        {rich ? <Gloss from={light} color={r.sheen} /> : null}
      </View>
    </View>
  );
});

/** Light catching the paper from the room's lit side. */
function Gloss({ from, color }: { from: 'left' | 'right'; color: string }) {
  const x1 = from === 'left' ? '0' : '1';
  const x2 = from === 'left' ? '1' : '0';
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
      <Defs>
        <LinearGradient id="gloss" x1={x1} y1="0" x2={x2} y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.24} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.04} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={10} height={10} fill="url(#gloss)" />
    </Svg>
  );
}

function Overline({ text, color, scale }: { text: string; color: string; scale: number }) {
  return (
    <Text style={[styles.overline, { color, fontSize: 9 * scale, lineHeight: 11 * scale }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
      {text}
    </Text>
  );
}

/** "ON AIR" with a breathing light while recording; still when paused or without motion. */
function OnAir({ paused, color, scale, motion }: { paused: boolean; color: string; scale: number; motion: boolean }) {
  const glow = useSharedValue(1);
  const breathe = motion && !paused;
  useEffect(() => {
    cancelAnimation(glow);
    glow.set(1);
    if (breathe) glow.set(withRepeat(withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(glow);
  }, [breathe, glow]);
  const dot = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const size = 5 * scale;
  return (
    <View style={styles.onAir}>
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, dot]} />
      <Overline text={paused ? 'PAUSED' : 'ON AIR'} color={color} scale={scale} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: StyleSheet.absoluteFill,
  shadow: { borderRadius: 3 },
  paper: { borderRadius: 3, overflow: 'hidden' },
  band: {},
  overline: { fontFamily: fontFamily.semibold, letterSpacing: 0.6 },
  title: { fontFamily: fontFamily.display, letterSpacing: -0.1 },
  art: { flex: 1 },
  onAir: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
