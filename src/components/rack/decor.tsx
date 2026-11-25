import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { CASE, FLOOR_MIN } from './bookcase';
import { useRoom } from './room';

/**
 * Things standing on the floor at the bookcase's front corners, there whether the case is full
 * or not: a tall floor vase of flowers and pampas on the left, and a paper lantern floor lamp
 * on the right, switched on at night (it is the room's evening light). They stand in front of
 * the case, so they overlap its plinth only, never a shelf. Lit from the room's light side,
 * with contact and cast shadows on the floor. Decoration only: screen readers skip it.
 */

/** How tall the floor things are: the floor band plus the plinth, stopping under the bottom shelf. */
export const floorDecorHeight = FLOOR_MIN + CASE.base - 4;

/** Art colours (like the poster palettes): fixed. */
const ART = {
  vase: ['#C98A68', '#8E5238'],
  vaseShine: '#F2C9AE',
  stem: '#5E7F4E',
  leaf: ['#7FA06A', '#4E6E40'],
  pampas: ['#F3E8CF', '#D8C7A2'],
  flowers: [
    ['#EE8C74', '#C9604B', '#F7B5A3'],
    ['#F4C3B4', '#D98F7E', '#FBE0D6'],
    ['#F6E7C8', '#D9C39A', '#FFF6E4'],
  ],
  wood: '#7A5A3A',
  paper: ['#F6F1E6', '#D8CEBB'],
  paperOn: ['#FFF4D8', '#F3BF72'],
  rib: '#BFA77F',
} as const;

/** Vase art, in a 66 x 100 box. Heads: x, y, size, colour. */
const HEADS: [number, number, number, number][] = [
  [33, 12, 7.5, 0],
  [21, 27, 6.5, 1],
  [46, 25, 7, 2],
  [27, 40, 6, 2],
  [41, 41, 6.5, 0],
];
const PLUMES: [number, number, number][] = [
  [13, 20, -24],
  [54, 17, 22],
  [9, 36, -38],
];
const LEAVES: [number, number, number][] = [
  [24, 48, -40], [43, 49, 38], [33, 46, 0],
];

export const FloorDecor = memo(function FloorDecor({ bottom, rich }: { bottom: number; rich: boolean }) {
  const h = floorDecorHeight;
  return (
    <View
      style={[styles.row, { bottom, height: h }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <FloorVase height={h} rich={rich} />
      <FloorLantern height={h} rich={rich} />
    </View>
  );
});

function FloorVase({ height, rich }: { height: number; rich: boolean }) {
  const { r, light } = useRoom();
  const lit = light === 'left' ? 0 : 1;
  const away = light === 'left' ? 1 : -1;
  const width = Math.round(height * 0.66);
  const heads = rich ? HEADS : HEADS.slice(0, 3);
  return (
    <Svg width={width} height={height} viewBox="0 0 66 100">
      <Defs>
        <RadialGradient id="vaseCast" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor={r.shadow} stopOpacity={0.9} />
          <Stop offset="1" stopColor={r.shadow} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="floorVase" x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
          <Stop offset="0" stopColor={ART.vase[0]} />
          <Stop offset="1" stopColor={ART.vase[1]} />
        </LinearGradient>
        <RadialGradient id="vaseHead" cx={lit ? '0.7' : '0.3'} cy="0.3" rx="0.75" ry="0.75">
          <Stop offset="0.45" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.28} />
        </RadialGradient>
      </Defs>

      {/* Shadow thrown along the floor away from the light, and where the vase meets it. */}
      <Ellipse cx={33 + away * 16} cy={96} rx={28} ry={4.5} fill="url(#vaseCast)" />
      <Ellipse cx={33} cy={98} rx={19} ry={2.6} fill={r.ao} opacity={0.75} />

      {/* Pampas plumes and stems, gathered at the mouth. */}
      {(rich ? PLUMES : PLUMES.slice(0, 2)).map(([x, y, a], i) => (
        <G key={`p${i}`}>
          <Path d={`M${31 + i * 2},53 Q${(x + 33) / 2},${(y + 53) / 2 + 4} ${x},${y + 10}`} stroke={ART.pampas[1]} strokeWidth={1} fill="none" />
          <Ellipse cx={x} cy={y} rx={4.6} ry={13} fill={ART.pampas[0]} transform={`rotate(${a} ${x} ${y})`} />
          <Ellipse cx={x + away * 1.2} cy={y + 1} rx={2.4} ry={10} fill={ART.pampas[1]} opacity={0.55} transform={`rotate(${a} ${x} ${y})`} />
        </G>
      ))}
      {heads.map(([x, y], i) => (
        <Path key={`s${i}`} d={`M${30 + (i % 3) * 3},53 Q${(x + 33) / 2},${(y + 53) / 2 + 3} ${x},${y}`} stroke={ART.stem} strokeWidth={1.2} fill="none" />
      ))}
      {rich
        ? LEAVES.map(([x, y, a], i) => (
            <Ellipse key={`l${i}`} cx={x} cy={y} rx={6.5} ry={2.4} fill={ART.leaf[i % 2]} transform={`rotate(${a} ${x} ${y})`} />
          ))
        : null}
      {heads.map(([x, y, s, c], i) => {
        const [base, deep, pale] = ART.flowers[c];
        return (
          <G key={`h${i}`}>
            <Circle cx={x} cy={y} r={s} fill={base} />
            <Circle cx={x + away * s * 0.08} cy={y + s * 0.06} r={s * 0.68} fill={deep} opacity={0.55} />
            <Circle cx={x - away * s * 0.12} cy={y - s * 0.1} r={s * 0.38} fill={pale} />
            <Circle cx={x} cy={y} r={s} fill="url(#vaseHead)" />
          </G>
        );
      })}

      {/* Tall terracotta floor vase. */}
      <Path d="M21,98 C10,89 8,70 17,60 L23,52 L43,52 L49,60 C58,70 56,89 45,98 Z" fill="url(#floorVase)" />
      <Ellipse cx={33} cy={52} rx={10} ry={2.2} fill={ART.vase[1]} />
      <Path d={lit ? 'M48,64 C53,72 53,84 49,92' : 'M18,64 C13,72 13,84 17,92'} stroke={ART.vaseShine} strokeWidth={1.8} strokeLinecap="round" fill="none" opacity={0.55} />
    </Svg>
  );
}

function FloorLantern({ height, rich }: { height: number; rich: boolean }) {
  const { r, light } = useRoom();
  const on = light === 'right'; // switched on at night: it is the evening light
  const lit = light === 'left' ? 0 : 1;
  const away = light === 'left' ? 1 : -1;
  const width = Math.round(height * 0.5);
  const paper = on ? ART.paperOn : ART.paper;
  return (
    <View style={{ width, height }}>
      {on ? (
        // Warm light pooling on the floor and the corner of the case around it.
        <View style={{ position: 'absolute', left: -width * 2.2, top: -height * 0.9, width: width * 4.4, height: height * 2.1 }} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox="0 0 220 210">
            <Defs>
              <RadialGradient id="lanternGlow" cx="0.5" cy="0.6" rx="0.5" ry="0.5">
                <Stop offset="0" stopColor={r.light} stopOpacity={rich ? 0.45 : 0.32} />
                <Stop offset="1" stopColor={r.light} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={110} cy={126} rx={110} ry={84} fill="url(#lanternGlow)" />
          </Svg>
        </View>
      ) : null}
      <Svg width={width} height={height} viewBox="0 0 50 100">
        <Defs>
          <RadialGradient id="lanternCast" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor={r.shadow} stopOpacity={0.9} />
            <Stop offset="1" stopColor={r.shadow} stopOpacity={0} />
          </RadialGradient>
          {on ? (
            <RadialGradient id="paper" cx="0.5" cy="0.5" rx="0.6" ry="0.6">
              <Stop offset="0" stopColor={paper[0]} />
              <Stop offset="1" stopColor={paper[1]} />
            </RadialGradient>
          ) : (
            <LinearGradient id="paper" x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
              <Stop offset="0" stopColor={paper[0]} />
              <Stop offset="1" stopColor={paper[1]} />
            </LinearGradient>
          )}
        </Defs>

        {/* By day a shadow thrown along the floor; at night it is the light. */}
        {!on ? <Ellipse cx={25 + away * 14} cy={96} rx={22} ry={4} fill="url(#lanternCast)" /> : null}
        <Ellipse cx={25} cy={98} rx={15} ry={2.4} fill={r.ao} opacity={on ? 0.45 : 0.75} />

        {/* Wooden legs. */}
        <Path d="M15,98 L19,84 M35,98 L31,84 M17,92 H33" stroke={ART.wood} strokeWidth={1.6} strokeLinecap="round" />

        {/* Paper body, its ribs, the wooden cap and ring. */}
        <Rect x={7} y={16} width={36} height={70} rx={9} fill="url(#paper)" />
        {Array.from({ length: rich ? 9 : 5 }, (_, i) => {
          const n = rich ? 9 : 5;
          const y = 22 + ((86 - 28) / (n - 1)) * i;
          return <Path key={i} d={`M8,${y.toFixed(1)} Q25,${(y + 2.2).toFixed(1)} 42,${y.toFixed(1)}`} stroke={ART.rib} strokeWidth={0.7} fill="none" opacity={on ? 0.5 : 0.6} />;
        })}
        <Rect x={13} y={12} width={24} height={4.5} rx={1.5} fill={ART.wood} />
        <Rect x={13} y={85} width={24} height={3} rx={1.5} fill={ART.wood} />
        {!on ? <Rect x={lit ? 39 : 9} y={20} width={2} height={60} rx={1} fill="#FFFFFF" opacity={0.25} /> : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: CASE.margin - 12,
    right: CASE.margin - 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
});
