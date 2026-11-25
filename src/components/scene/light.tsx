import { G, Polygon } from 'react-native-svg';

export type Point = [number, number];

/** A polygon grown about its centre: stacked at falling opacity, it gives light a soft edge without blur. */
export function grow(points: Point[], by: number): string {
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

/** Light with a soft edge: three copies, wider ones fainter. Draw inside an <Svg>. */
export function SoftLight({ points, color, strength }: { points: Point[]; color: string; strength: number }) {
  return (
    <G>
      <Polygon points={grow(points, 9)} fill={color} opacity={strength * 0.22} />
      <Polygon points={grow(points, 4)} fill={color} opacity={strength * 0.3} />
      <Polygon points={grow(points, 0)} fill={color} opacity={strength * 0.48} />
    </G>
  );
}
