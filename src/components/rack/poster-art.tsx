import { memo } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { PosterScene } from '@/features/library-rack/poster-art';

/** Draws a poster scene (see features/library-rack/poster-art) filling its box. */
export const PosterArt = memo(function PosterArt({ scene, id }: { scene: PosterScene; id: string }) {
  const sky = `sky-${id}`;
  if (scene.kind === 'page') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={100} height={100} fill={scene.paper} />
        {scene.lines.map((w, i) => (
          <Rect key={i} x={12} y={14 + i * 9} width={w * 0.76} height={3.2} rx={1.6} fill={scene.ink} opacity={i === 0 ? 0.8 : 0.42} />
        ))}
        <Path d="M78,0 L100,0 L100,22 Z" fill={scene.corner} />
        <Path d="M78,0 L100,22 L78,22 Z" fill={scene.ink} opacity={0.12} />
      </Svg>
    );
  }

  const { sun } = scene;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMax slice">
      <Defs>
        <LinearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={scene.sky[0]} />
          <Stop offset="1" stopColor={scene.sky[1]} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill={`url(#${sky})`} />
      {scene.stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={sun.color} opacity={0.85} />
      ))}
      <Circle cx={sun.x} cy={sun.y} r={sun.r} fill={sun.color} />
      {/* A crescent: the sky's top colour bites into the moon. */}
      {sun.moon ? <Circle cx={sun.x + sun.r * 0.45} cy={sun.y - sun.r * 0.3} r={sun.r * 0.85} fill={scene.sky[0]} /> : null}
      {scene.lake ? (
        <G>
          <Rect x={0} y={scene.lake.y} width={100} height={100 - scene.lake.y} fill={scene.lake.color} />
          <Rect x={18} y={scene.lake.y + 5} width={40} height={1.4} rx={0.7} fill={scene.lake.shine} opacity={0.7} />
          <Rect x={48} y={scene.lake.y + 11} width={30} height={1.4} rx={0.7} fill={scene.lake.shine} opacity={0.5} />
        </G>
      ) : null}
      {scene.hills.map((h, i) => (
        <Path key={i} d={h.d} fill={h.color} />
      ))}
      {scene.flags.map((f, i) => (
        <G key={i}>
          <Path d={`M${f.x},${f.y} V${f.y - 11}`} stroke="#2A2118" strokeWidth={0.9} />
          <Path d={`M${f.x},${f.y - 11} L${f.x + 6},${f.y - 9} L${f.x},${f.y - 7} Z`} fill={scene.flagColor} />
        </G>
      ))}
    </Svg>
  );
});

/** The poster shown while Listen is running: a dark sky over a sound wave. */
export const LiveArt = memo(function LiveArt() {
  const bars = [10, 18, 28, 16, 34, 22, 40, 26, 14, 30, 20, 12];
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <Rect x={0} y={0} width={100} height={100} fill="#1F2A44" />
      <Circle cx={74} cy={24} r={9} fill="#F3EBD3" opacity={0.9} />
      {bars.map((h, i) => (
        <Rect key={i} x={8 + i * 7.4} y={70 - h / 2} width={4} height={h} rx={2} fill="#F6EEDC" opacity={0.55 + (i % 3) * 0.15} />
      ))}
      <Path d="M0,88 Q25,80 50,86 T100,84 V100 H0 Z" fill="#101B33" />
    </Svg>
  );
});
