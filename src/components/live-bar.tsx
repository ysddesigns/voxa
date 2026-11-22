import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { elevation, minTouch, radius, squircle } from '@/design/tokens';
import { type } from '@/design/type';
import { formatClock } from '@/features/listen/format';
import { useListen } from '@/features/listen/listen-session';

/**
 * In-app Live Activity: while Listen runs, a bar above the tabs on every other tab shows listening
 * or paused, the time, and Pause/Resume and Mark. Tapping it opens Live captions.
 */
export function LiveBar({ onOpen, style }: { onOpen: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const l = useListen();
  const [, tick] = useState(0);
  const active = l.status !== 'idle';
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!active) return null;

  const paused = l.status === 'paused';
  const busy = l.status === 'starting' || l.status === 'stopping';
  const clock = formatClock(l.elapsedMs());
  const state = l.status === 'starting' ? 'Starting' : l.status === 'stopping' ? 'Saving' : paused ? 'Paused' : 'Listening';

  return (
    <View style={[styles.bar, { backgroundColor: colors.card, ...elevation(colors.shadow) }, style]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${state}, ${clock}. ${l.title}`}
        accessibilityHint="Opens Live captions"
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.6 }]}
      >
        <Dot on={!paused && !busy} color={paused ? colors.textSecondary : colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[type.subheadline, { color: colors.text, fontFamily: type.headline.fontFamily, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
            {state} · {clock}
          </Text>
          <Text style={[type.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
            {l.title}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => void (paused ? l.resume() : l.pause())}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Resume listening' : 'Pause listening'}
        style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.chipPressed : colors.chip, opacity: busy ? 0.4 : 1 }]}
      >
        <Icon name={paused ? 'play' : 'pause'} size={18} color={colors.text} />
      </Pressable>
      <Pressable
        onPress={() => l.mark()}
        disabled={busy || paused}
        accessibilityRole="button"
        accessibilityLabel="Mark this moment"
        style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.chipPressed : colors.chip, opacity: busy || paused ? 0.4 : 1 }]}
      >
        <Icon name="flag" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** Recording dot: breathes while listening, still when paused or when motion is reduced. */
function Dot({ on, color }: { on: boolean; color: string }) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    opacity.setValue(1);
    if (on) {
      void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    }
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [on, opacity]);
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
}

/** Height of the bar plus its gap, so screens can leave room for it. */
export const LIVE_BAR_SPACE = 72;

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, borderRadius: radius.card, ...squircle, paddingLeft: 16, paddingRight: 8 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: minTouch },
  dot: { width: 10, height: 10, borderRadius: 5 },
  button: { width: minTouch, height: minTouch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
