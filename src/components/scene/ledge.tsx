import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useScene } from '@/design/scene';

/** A ledge's parts, top to bottom: the surface things stand on, its front edge, the shadow under it. */
export const LEDGE = { surface: 10, edge: 16, under: 8 } as const;
export const LEDGE_HEIGHT = LEDGE.surface + LEDGE.edge + LEDGE.under;

/**
 * An oak ledge across the wall, seen from just above: the top surface things stand on, the
 * front edge (where tags hang), and its shadow on the wall. Lit from the room's light side.
 * Draw it behind what stands on it, with its top where their feet are.
 */
export const Ledge = memo(function Ledge({ width, top, rich = true }: { width: number; top: number; rich?: boolean }) {
  const { r, lit } = useScene();
  if (width <= 0) return null;
  const { surface: S, edge: E, under: U } = LEDGE;
  return (
    <View style={{ position: 'absolute', left: 0, top, width, height: LEDGE_HEIGHT }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={LEDGE_HEIGHT}>
        <Defs>
          <LinearGradient id="ledgeTop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.oakDark} />
            <Stop offset="1" stopColor={r.oakLight} />
          </LinearGradient>
          <LinearGradient id="ledgeFront" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.oakLight} />
            <Stop offset="0.4" stopColor={r.oak} />
            <Stop offset="1" stopColor={r.oakDark} />
          </LinearGradient>
          <LinearGradient id="ledgeSide" x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
            <Stop offset="0" stopColor={r.light} stopOpacity={0.22} />
            <Stop offset="0.6" stopColor={r.light} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="ledgeUnder" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.shadow} stopOpacity={1} />
            <Stop offset="1" stopColor={r.shadow} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Top surface, its back meeting the wall in shadow. */}
        <Rect x={0} y={0} width={width} height={S} fill="url(#ledgeTop)" />
        <Rect x={0} y={0} width={width} height={2} fill={r.ao} opacity={0.5} />
        {/* Front edge, catching the light along its top. */}
        <Rect x={0} y={S} width={width} height={E} fill="url(#ledgeFront)" />
        {rich ? <Rect x={0} y={S} width={width} height={E} fill="url(#ledgeSide)" /> : null}
        <Rect x={0} y={S} width={width} height={1} fill={r.oakLight} />
        <Rect x={0} y={S + E - 1.5} width={width} height={1.5} fill={r.oakDark} />
        {/* Its shadow on the wall below. */}
        <Rect x={0} y={S + E} width={width} height={U} fill="url(#ledgeUnder)" />
      </Svg>
    </View>
  );
});
