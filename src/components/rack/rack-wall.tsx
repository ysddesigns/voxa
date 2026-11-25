import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/design/theme';
import { rackDark, rackLight, type RackPalette } from '@/design/tokens';

export function useRack(): RackPalette {
  return useTheme().scheme === 'dark' ? rackDark : rackLight;
}

/** How far the window light drifts per rack swiped: slower than the rack, so it reads as a room. */
const DRIFT = 0.12;

/**
 * The wall behind the rack: tiles, and light from a window falling across it at an angle.
 * Drawn once, with no blur. With `scrollX` (the racks' horizontal scroll), the light drifts
 * slowly as racks slide past. `simple` (Lite phones) leaves out the tiles.
 */
export const RackWall = memo(function RackWall({
  width,
  height,
  simple,
  scrollX,
}: {
  width: number;
  height: number;
  simple?: boolean;
  scrollX?: SharedValue<number>;
}) {
  const r = useRack();
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: scrollX ? -scrollX.get() * DRIFT : 0 }] }));
  if (width <= 0 || height <= 0) return null;

  const tile = 56;
  let grid = '';
  if (!simple) {
    for (let y = tile; y < height; y += tile) grid += `M0,${y}H${width}`;
    for (let x = tile / 2; x < width; x += tile) grid += `M${x},0V${height}`;
  }

  // A 2 x 3 window, its light thrown down and to the left, skewed by the sun's angle.
  // The light layer is wider than the screen so it can drift without showing an edge.
  const lightW = width * 2;
  const skew = -0.42;
  const paneW = width * 0.27;
  const paneH = height * 0.17;
  const gap = width * 0.035;
  const ox = width * 0.42;
  const oy = height * 0.06;
  const panes: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const x = ox + col * (paneW + gap);
      const y = oy + row * (paneH + gap);
      const at = (px: number, py: number) => `${(px + (py - oy) * skew).toFixed(1)},${py.toFixed(1)}`;
      panes.push([at(x, y), at(x + paneW, y), at(x + paneW, y + paneH), at(x, y + paneH)].join(' '));
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="rackWall" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.wallLight} stopOpacity={0.35} />
            <Stop offset="0.6" stopColor={r.wall} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={r.wall} />
        <Rect x={0} y={0} width={width} height={height} fill="url(#rackWall)" />
        {grid ? <Path d={grid} stroke={r.tile} strokeWidth={1} /> : null}
      </Svg>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: lightW, height }, drift]}>
        <Svg width={lightW} height={height}>
          {panes.map((p, i) => (
            <Polygon key={i} points={p} fill={r.wallLight} opacity={simple ? 0.28 : 0.42} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
});
