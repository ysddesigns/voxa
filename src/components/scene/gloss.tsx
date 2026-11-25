import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useScene } from '@/design/scene';

/**
 * Light catching paper from the room's lit side: a faint sheen fading across the sheet.
 * Lay it last inside a sheet with `overflow: 'hidden'`. Skip it on Lite phones.
 */
export function Gloss() {
  const { r, light } = useScene();
  const x1 = light === 'left' ? '0' : '1';
  const x2 = light === 'left' ? '1' : '0';
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
      <Defs>
        <LinearGradient id="gloss" x1={x1} y1="0" x2={x2} y2="1">
          <Stop offset="0" stopColor={r.sheen} stopOpacity={0.24} />
          <Stop offset="0.45" stopColor={r.sheen} stopOpacity={0.04} />
          <Stop offset="1" stopColor={r.sheen} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={10} height={10} fill="url(#gloss)" />
    </Svg>
  );
}
