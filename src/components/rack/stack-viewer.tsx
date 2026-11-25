import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { RoundButton } from '@/components/scene/round-button';
import { Button } from '@/components/ui';
import { useScene } from '@/design/scene';
import { fontFamily, sceneType } from '@/design/type';
import { posterMeta, posterTitle } from '@/features/library-rack/labels';
import { itemKey, itemLabel, PosterFace, type RackItem } from './poster';

const OUT = Easing.bezier(0.23, 1, 0.32, 1);
const GAP = 16;

/**
 * A stack pulled out of its pocket: the rack dims and the stack's posters spread into a
 * swipeable row, the centred one full size. Tap a poster (or Open) to open it.
 * `closing` plays the way out, then calls onClosed; the screen unmounts it.
 */
export function StackViewer({
  title,
  items,
  width,
  height,
  topInset,
  bottomInset,
  motion,
  rich,
  closing,
  onClose,
  onClosed,
  onOpen,
}: {
  title: string;
  items: RackItem[];
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
  /** Lift-and-spread entrance; without it (Lite, reduced motion) a plain fade. */
  motion: boolean;
  /** Soft shadows and gloss on the posters (off on Lite phones). */
  rich: boolean;
  closing: boolean;
  onClose: () => void;
  onClosed: () => void;
  onOpen: (item: RackItem) => void;
}) {
  const { r } = useScene();
  const shown = useSharedValue(0);
  const x = useSharedValue(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (closing) {
      shown.set(
        withTiming(0, { duration: 180, easing: OUT }, (done) => {
          if (done) scheduleOnRN(onClosed);
        }),
      );
    } else {
      shown.set(withTiming(1, { duration: 260, easing: OUT }));
    }
  }, [closing, onClosed, shown]);

  const cardW = Math.round(Math.min(width * 0.64, (height * 0.5) / 1.42));
  const cardH = Math.round(cardW * 1.42);
  const interval = cardW + GAP;
  const side = (width - interval) / 2;

  const onScroll = useAnimatedScrollHandler((e) => {
    x.set(e.contentOffset.x);
  });

  const scrim = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const content = useAnimatedStyle(() => {
    const p = shown.get();
    return motion
      ? { opacity: p, transform: [{ translateY: (1 - p) * 28 }, { scale: 0.95 + 0.05 * p }] }
      : { opacity: p };
  });

  const current = items[Math.min(index, items.length - 1)];

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: r.scrim }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Put the stack back" accessibilityRole="button" />
      </Animated.View>

      <Animated.View style={[styles.content, { paddingTop: topInset + 8, paddingBottom: bottomInset + 16 }, content]} pointerEvents="box-none">
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[sceneType.overline, { color: r.onScrimSecondary }]}>
              {items.length} SAVED{items.length > 1 ? ` · ${Math.min(index, items.length - 1) + 1} OF ${items.length}` : ''}
            </Text>
            <Text style={[styles.title, { color: r.onScrim }]} accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
          </View>
          <RoundButton icon="close" size={18} label="Put the stack back" onPress={onClose} color={r.onScrim} borderColor={r.onScrimSecondary} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }} pointerEvents="box-none">
          <Animated.FlatList
            data={items}
            keyExtractor={itemKey}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={interval}
            decelerationRate="fast"
            disableIntervalMomentum
            getItemLayout={(_, i) => ({ length: interval, offset: interval * i, index: i })}
            contentContainerStyle={{ paddingHorizontal: side }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => setIndex(Math.max(0, Math.round(e.nativeEvent.contentOffset.x / interval)))}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            style={{ flexGrow: 0, height: cardH + 24, marginHorizontal: -20 }}
            renderItem={({ item, index: i }) => (
              <Card item={item} i={i} x={x} interval={interval} width={cardW} height={cardH} motion={motion} rich={rich} onOpen={onOpen} />
            )}
          />
        </View>

        {current ? (
          <View style={styles.foot}>
            <Text style={[sceneType.heading, { color: r.onScrim }]} numberOfLines={2}>
              {current.kind === 'live' ? current.title || 'Listening' : posterTitle(current.meta)}
            </Text>
            <Text style={[sceneType.body, { color: r.onScrimSecondary }]} numberOfLines={1}>
              {current.kind === 'live' ? (current.paused ? 'Paused' : 'Recording now') : posterMeta(current.meta)}
            </Text>
            <Button
              label={current.kind === 'live' ? 'Go to Live' : current.meta.kind === 'scan' ? 'Open Scan' : 'Open Transcript'}
              accent
              onPress={() => onOpen(current)}
              style={{ alignSelf: 'stretch', marginTop: 10 }}
            />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/** One poster in the row: full size in the middle, a little smaller and dimmer to the sides. */
function Card({
  item,
  i,
  x,
  interval,
  width,
  height,
  motion,
  rich,
  onOpen,
}: {
  item: RackItem;
  i: number;
  x: SharedValue<number>;
  interval: number;
  width: number;
  height: number;
  motion: boolean;
  rich: boolean;
  onOpen: (item: RackItem) => void;
}) {
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    const at = [(i - 1) * interval, i * interval, (i + 1) * interval];
    const s = motion ? interpolate(x.get(), at, [0.88, 1, 0.88], Extrapolation.CLAMP) : 1;
    const o = interpolate(x.get(), at, [0.55, 1, 0.55], Extrapolation.CLAMP);
    return { opacity: o, transform: [{ scale: s * (1 - 0.03 * press.get()) }] };
  });
  return (
    <Pressable
      onPress={() => onOpen(item)}
      onPressIn={() => press.set(withTiming(1, { duration: 100, easing: OUT }))}
      onPressOut={() => press.set(withTiming(0, { duration: 160, easing: OUT }))}
      accessibilityRole="button"
      accessibilityLabel={itemLabel(item)}
      style={{ width: interval, alignItems: 'center', paddingVertical: 12 }}
    >
      <Animated.View style={style}>
        <PosterFace item={item} width={width} height={height} scale={width / 100} motion={motion} rich={rich} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { ...StyleSheet.absoluteFill, paddingHorizontal: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 34 },
  foot: { gap: 2 },
});
