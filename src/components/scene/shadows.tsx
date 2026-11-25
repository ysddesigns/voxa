import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useScene } from '@/design/scene';

/** Offsets and strengths of the soft shadow's layers: wider ones fainter. */
const SOFT = [
  { d: 3, opacity: 0.9 },
  { d: 6, opacity: 0.55 },
  { d: 10, opacity: 0.3 },
];
const PLAIN = [{ d: 4, opacity: 1 }];

/**
 * The shadow a sheet of paper (a poster, a card, a note) casts on the wall behind it: offset
 * away from the room's light and a little down. Layered offsets instead of blur, so it costs
 * almost nothing; one layer when not `rich`. Place it first inside the sheet's box.
 */
export function PaperShadow({ scale = 1, rich = true, radius = 3 }: { scale?: number; rich?: boolean; radius?: number }) {
  const { r, away } = useScene();
  return (
    <>
      {(rich ? SOFT : PLAIN).map(({ d, opacity }) => (
        <View
          key={d}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius, backgroundColor: r.shadow, opacity, transform: [{ translateX: away * d * scale }, { translateY: d * 0.4 * scale }] },
          ]}
        />
      ))}
    </>
  );
}

/** The soft dark ellipse where something stands on a surface (a stack on a shelf, a pot on the floor). */
export function ContactShadow({ width, bottom = 0, spread = 8 }: { width: number; bottom?: number; spread?: number }) {
  const { r } = useScene();
  const w = width + 2 * spread;
  return (
    <View style={{ position: 'absolute', left: -spread, bottom: bottom - 4, width: w, height: 10 }} pointerEvents="none">
      <Svg width={w} height={10}>
        <Defs>
          <RadialGradient id="contact" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor={r.ao} stopOpacity={1} />
            <Stop offset="1" stopColor={r.ao} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={w / 2} cy={5} rx={w / 2} ry={5} fill="url(#contact)" />
      </Svg>
    </View>
  );
}
