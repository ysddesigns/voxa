import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '@/design/theme';
import { waveHeights } from './waveform';

type Props = {
  /** 0..1 */
  progress: number;
  height: number;
  barWidth?: number;
  gap?: number;
  seed?: number;
  /** Tap or drag position as 0..1. Omit for a display-only wave. */
  onSeek?: (fraction: number) => void;
  label?: string;
  valueText?: string;
};

/**
 * Playback waveform (Editor preview bar, Player, Voices sample): played bars in
 * Voxa orange, unplayed in grey, and a taller ink playhead. Bars fill the width.
 */
export function ProgressWave({ progress, height, barWidth = 3, gap = 3, seed = 0.4, onSeek, label, valueText }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const count = width > 0 ? Math.max(8, Math.floor((width + gap) / (barWidth + gap))) : 0;
  const heights = waveHeights(count, seed);
  const head = Math.min(count - 1, Math.max(0, Math.round(progress * (count - 1))));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const seekAt = (x: number) => {
    if (!onSeek || width <= 0) return;
    onSeek(Math.min(1, Math.max(0, x / width)));
  };

  const bars = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap, height }} pointerEvents="none">
      {heights.map((h, i) => {
        const isHead = i === head && progress > 0;
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              borderRadius: barWidth / 2,
              height: isHead ? height : Math.round(height * 0.12 + h * height * 0.76),
              backgroundColor: isHead ? colors.text : i < head ? colors.accent : colors.waveUnplayed,
            }}
          />
        );
      })}
    </View>
  );

  if (!onSeek) {
    return (
      <View onLayout={onLayout} style={{ height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {bars}
      </View>
    );
  }

  return (
    <Pressable
      onLayout={onLayout}
      onPress={(e) => seekAt(e.nativeEvent.locationX)}
      hitSlop={8}
      style={{ height }}
      accessibilityRole="adjustable"
      accessibilityLabel={label ?? 'Playback position'}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100), text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const step = e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1;
        onSeek(Math.min(1, Math.max(0, progress + step)));
      }}
    >
      {bars}
    </Pressable>
  );
}
