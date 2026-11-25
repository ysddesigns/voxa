import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Gloss } from '@/components/scene/gloss';
import { PaperShadow } from '@/components/scene/shadows';
import { useScene } from '@/design/scene';
import { fontFamily } from '@/design/type';
import { posterA11yLabel, posterOverline, posterTitle } from '@/features/library-rack/labels';
import { BANDS, posterScene, type Band, type PosterScene } from '@/features/library-rack/poster-art';
import type { SessionMeta } from '@/storage/sessions';
import { LiveArt, PosterArt } from './poster-art';

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

/** How much taller than wide every poster is. */
export const POSTER_RATIO = 1.42;

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
  const live = item.kind === 'live';
  return (
    <PosterSheet
      band={itemBand(item)}
      overline={item.kind === 'live' ? (item.paused ? 'PAUSED' : 'ON AIR') : posterOverline(item.meta)}
      dot={live ? (item.paused ? 'still' : 'breathing') : undefined}
      title={item.kind === 'live' ? item.title || 'Listening' : posterTitle(item.meta)}
      art={item.kind === 'live' ? <LiveArt /> : <PosterArt scene={sceneOf(item.meta)} id={item.meta.id} />}
      width={width}
      height={height}
      scale={scale}
      motion={motion}
      rich={rich}
    />
  );
});

/**
 * Any poster: a title band (small-caps overline over a serif title) above its art, on paper
 * in the room's light. `dot` puts a light before the overline, breathing (with motion) while
 * something is live: ON AIR while listening, SPEAKING in the player.
 */
export const PosterSheet = memo(function PosterSheet({
  band,
  overline,
  title,
  art,
  dot,
  width,
  height,
  scale = 1,
  motion = false,
  rich = true,
}: {
  band: Band;
  overline: string;
  title: string;
  art: ReactNode;
  dot?: 'breathing' | 'still';
  width: number;
  height: number;
  scale?: number;
  motion?: boolean;
  rich?: boolean;
}) {
  const { r } = useScene();
  const s = Math.max(1, scale);
  return (
    <View style={{ width, height }}>
      <PaperShadow scale={s} rich={rich} />
      <View style={[styles.fill, styles.paper]}>
        <View style={[styles.band, { backgroundColor: band.bg, paddingHorizontal: 7 * s, paddingVertical: 6 * s, gap: 2 * s }]}>
          <View style={styles.onAir}>
            {dot ? <LightDot breathing={dot === 'breathing' && motion} color={band.fg} scale={s} /> : null}
            <Overline text={overline} color={band.fg} scale={s} />
          </View>
          <Text style={[styles.title, { color: band.fg, fontSize: 13 * s, lineHeight: 15.5 * s }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
        </View>
        <View style={styles.art}>{art}</View>
        <View style={[styles.fill, { backgroundColor: r.posterVeil }]} pointerEvents="none" />
        {rich ? <Gloss /> : null}
      </View>
    </View>
  );
});

/**
 * A session's poster small enough for a list row: a strip of its band colour over its art, no
 * words (the row says them). Same art as on the shelf, so a meeting looks the same everywhere.
 * Decoration only: screen readers skip it.
 */
export const PosterThumb = memo(function PosterThumb({ meta, width }: { meta: SessionMeta; width: number }) {
  const { r } = useScene();
  const scene = sceneOf(meta);
  const height = Math.round(width * POSTER_RATIO);
  return (
    <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <PaperShadow scale={0.5} rich={false} radius={2} />
      <View style={[styles.fill, styles.thumb]}>
        <View style={{ height: Math.max(4, Math.round(height * 0.16)), backgroundColor: scene.band.bg }} />
        <View style={styles.art}>
          <PosterArt scene={scene} id={`thumb-${meta.id}`} />
        </View>
        <View style={[styles.fill, { backgroundColor: r.posterVeil }]} pointerEvents="none" />
      </View>
    </View>
  );
});

function Overline({ text, color, scale }: { text: string; color: string; scale: number }) {
  return (
    <Text style={[styles.overline, { color, fontSize: 9 * scale, lineHeight: 11 * scale }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
      {text}
    </Text>
  );
}

/** A small light that breathes while something is live, and holds still otherwise. */
function LightDot({ breathing, color, scale }: { breathing: boolean; color: string; scale: number }) {
  const glow = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(glow);
    glow.set(1);
    if (breathing) glow.set(withRepeat(withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(glow);
  }, [breathing, glow]);
  const dot = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const size = 5 * scale;
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, dot]} />;
}

const styles = StyleSheet.create({
  fill: StyleSheet.absoluteFill,
  paper: { borderRadius: 3, overflow: 'hidden' },
  thumb: { borderRadius: 2, overflow: 'hidden' },
  band: {},
  overline: { fontFamily: fontFamily.semibold, letterSpacing: 0.6 },
  title: { fontFamily: fontFamily.display, letterSpacing: -0.1 },
  art: { flex: 1 },
  onAir: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
