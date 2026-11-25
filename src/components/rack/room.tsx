import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/design/theme';
import { rackDark, rackLight, type RackPalette } from '@/design/tokens';
import { seeded } from '@/features/library-rack/poster-art';

/** The room's palette, and the side its light comes from: the window (left) by day, a lamp (right) at night. */
export function useRoom(): { r: RackPalette; light: 'left' | 'right' } {
  const dark = useTheme().scheme === 'dark';
  return { r: dark ? rackDark : rackLight, light: dark ? 'right' : 'left' };
}

export const useRack = () => useRoom().r;

/** How far the window light drifts per rack swiped: slower than the case, so it reads as a room. */
const DRIFT = 0.12;

/** A polygon grown about its centre: stacked at falling opacity, it gives light a soft edge without blur. */
function grow(points: [number, number][], by: number): string {
  const cx = points.reduce((n, p) => n + p[0], 0) / points.length;
  const cy = points.reduce((n, p) => n + p[1], 0) / points.length;
  return points
    .map(([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy) || 1;
      return `${(x + (dx / d) * by).toFixed(1)},${(y + (dy / d) * by).toFixed(1)}`;
    })
    .join(' ');
}

/** Light with a soft edge: three copies, wider ones fainter. */
function SoftLight({ points, color, strength }: { points: [number, number][]; color: string; strength: number }) {
  return (
    <G>
      <Polygon points={grow(points, 9)} fill={color} opacity={strength * 0.22} />
      <Polygon points={grow(points, 4)} fill={color} opacity={strength * 0.3} />
      <Polygon points={grow(points, 0)} fill={color} opacity={strength * 0.48} />
    </G>
  );
}

/**
 * The room behind the bookcase, drawn once with no blur: a plaster wall lit from one side,
 * window light (by day) or lamp glow (at night), a baseboard, an oak floor in perspective, and
 * the case's own shadow on the wall and floor. The window light is its own layer (WindowLight)
 * so it can fall on the case too. `simple` (Lite phones) draws fewer layers.
 */
export const Room = memo(function Room({
  width,
  height,
  floorY,
  caseBox,
  simple,
}: {
  width: number;
  height: number;
  /** Where the wall meets the floor. */
  floorY: number;
  /** The bookcase's outline, for its shadows. */
  caseBox: { left: number; right: number; top: number; bottom: number } | null;
  simple?: boolean;
}) {
  const { r, light } = useRoom();

  // Floor boards converge on a point above the middle of the screen.
  const boards = useMemo(() => {
    if (width <= 0 || height <= floorY) return { lines: '', joints: '' };
    const vx = width / 2;
    const depth = height - floorY;
    const squeeze = 0.62; // the far edge is this much narrower than the near one
    const plank = 44;
    let lines = '';
    let joints = '';
    const rand = seeded(7);
    const topX = (x: number) => vx + (x - vx) * squeeze;
    for (let x = vx - plank * 12; x <= vx + plank * 12; x += plank) {
      lines += `M${topX(x).toFixed(1)},${floorY}L${x.toFixed(1)},${height}`;
      // A butt joint somewhere along each board.
      const t = 0.25 + rand() * 0.6;
      const y = floorY + depth * t;
      const k = squeeze + (1 - squeeze) * t;
      const a = vx + (x - vx) * k;
      const b = vx + (x + plank - vx) * k;
      joints += `M${a.toFixed(1)},${y.toFixed(1)}L${b.toFixed(1)},${(y + 1.5).toFixed(1)}`;
    }
    return { lines, joints };
  }, [width, height, floorY]);

  if (width <= 0 || height <= 0) return null;

  // Sun patch on the floor: the same window, stretched along the boards.
  const floorPatch: [number, number][] = [
    [width * 0.02, floorY + (height - floorY) * 0.12],
    [width * 0.36, floorY + (height - floorY) * 0.1],
    [width * 0.62, height],
    [-width * 0.08, height],
  ];

  const shadowX = light === 'left' ? caseBox?.right : caseBox?.left;
  const lit = light === 'left' ? 0 : 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="roomWall" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.wall} />
            <Stop offset="1" stopColor={r.wallShade} />
          </LinearGradient>
          {/* By day the window's glow, high on the left; at night the floor lantern's, low on the right. */}
          <RadialGradient id="roomGlow" cx={lit ? '0.95' : '0.05'} cy={lit ? '0.95' : '0.15'} rx="0.95" ry={lit ? '0.85' : '0.7'} fx={lit ? '0.95' : '0.05'} fy={lit ? '0.95' : '0.15'}>
            <Stop offset="0" stopColor={r.light} stopOpacity={lit ? 0.42 : 0.5} />
            <Stop offset="1" stopColor={r.light} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="roomFloor" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.floorDark} />
            <Stop offset="0.35" stopColor={r.floor} />
            <Stop offset="1" stopColor={r.floorDark} />
          </LinearGradient>
          <LinearGradient id="roomFloorSide" x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
            <Stop offset="0" stopColor={r.light} stopOpacity={0.16} />
            <Stop offset="0.6" stopColor={r.light} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="roomCaseShadow" x1={light === 'left' ? '0' : '1'} y1="0" x2={light === 'left' ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor={r.shadow} stopOpacity={1} />
            <Stop offset="1" stopColor={r.shadow} stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id="roomContact" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor={r.ao} stopOpacity={1} />
            <Stop offset="1" stopColor={r.ao} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Wall */}
        <Rect x={0} y={0} width={width} height={floorY} fill="url(#roomWall)" />
        <Rect x={0} y={0} width={width} height={floorY} fill="url(#roomGlow)" />

        {/* Floor */}
        <Rect x={0} y={floorY} width={width} height={height - floorY} fill="url(#roomFloor)" />
        {!simple ? <Path d={boards.lines} stroke={r.floorLine} strokeWidth={1} /> : null}
        {!simple ? <Path d={boards.joints} stroke={r.floorLine} strokeWidth={1} /> : null}
        <Rect x={0} y={floorY} width={width} height={height - floorY} fill="url(#roomFloorSide)" />
        {light === 'left' ? <SoftLight points={floorPatch} color={r.light} strength={0.55} /> : null}
        {light === 'right' ? <Ellipse cx={width * 0.82} cy={floorY + (height - floorY) * 0.55} rx={width * 0.35} ry={(height - floorY) * 0.4} fill={r.light} opacity={0.08} /> : null}

        {/* Baseboard */}
        <Rect x={0} y={floorY - 14} width={width} height={14} fill={r.paint} />
        <Rect x={0} y={floorY - 14} width={width} height={1.5} fill={r.paintEdge} />
        <Rect x={0} y={floorY - 2} width={width} height={2} fill={r.paintShade} />
        <Rect x={0} y={floorY} width={width} height={3} fill={r.ao} opacity={0.6} />

        {/* The case's shadow on the wall, away from the light, and under its feet. */}
        {caseBox && shadowX != null ? (
          <>
            <Rect
              x={light === 'left' ? shadowX : shadowX - 22}
              y={caseBox.top + 12}
              width={22}
              height={floorY - caseBox.top - 12}
              fill="url(#roomCaseShadow)"
            />
            <Ellipse cx={(caseBox.left + caseBox.right) / 2} cy={caseBox.bottom} rx={(caseBox.right - caseBox.left) / 2 + 14} ry={9} fill="url(#roomContact)" />
          </>
        ) : null}
      </Svg>

    </View>
  );
});

/**
 * Sunlight from a window off to the left (day only): two columns of panes skewed down to the
 * right, soft edged. Drawn behind the bookcase at full strength and again over it, faintly, so
 * the light falls across the case and posters as it does in a room. With `scrollX` it drifts
 * slowly as racks slide past.
 */
export const WindowLight = memo(function WindowLight({
  width,
  height,
  strength,
  simple,
  scrollX,
  left = 0,
  top = 0,
}: {
  width: number;
  /** Down to the floor line: light on the wall stops there. */
  height: number;
  strength: number;
  /** Where the screen's top-left is, inside a clipped box (to light just the case). */
  left?: number;
  top?: number;
  simple?: boolean;
  scrollX?: SharedValue<number>;
}) {
  const { r, light } = useRoom();
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: scrollX ? -scrollX.get() * DRIFT : 0 }] }));
  const panes = useMemo(() => {
    const out: [number, number][][] = [];
    const skew = 0.5;
    const pw = width * 0.2;
    const ph = height * 0.2;
    const gap = width * 0.03;
    const ox = -width * 0.12;
    const oy = height * 0.08;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const x = ox + col * (pw + gap);
        const y = oy + row * (ph + gap);
        const at = (px: number, py: number): [number, number] => [px + (py - oy) * skew, py];
        out.push([at(x, y), at(x + pw, y), at(x + pw, y + ph), at(x, y + ph)]);
      }
    }
    return out;
  }, [width, height]);

  if (light !== 'left' || width <= 0 || height <= 0) return null;
  return (
    <View style={{ position: 'absolute', left, top, width, height, overflow: 'hidden' }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: width * 2, height }, drift]}>
        <Svg width={width * 2} height={height}>
          {panes.map((p, i) =>
            simple ? <Polygon key={i} points={grow(p, 0)} fill={r.light} opacity={0.45 * strength} /> : <SoftLight key={i} points={p} color={r.light} strength={strength} />,
          )}
        </Svg>
      </Animated.View>
    </View>
  );
});
