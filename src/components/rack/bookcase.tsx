import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { fontFamily } from '@/design/type';
import { SHELF_CHROME } from '@/features/library-rack/pockets';
import { useRoom } from './room';

/** Bookcase geometry, shared by the screen and the drawing. */
export const CASE = {
  /** Screen edge to the case's sides. */
  margin: 16,
  /** The oak top sticks out this far past the sides. */
  overhang: 6,
  /** Thickness of the side panels, seen from the front. */
  side: 12,
  /** Inner face of a side, seen in perspective. */
  face: 7,
  /** Sides to the first and last stack. */
  inset: 8,
  gap: 10,
  /** Oak top plus the top rail; the plinth with its arched cut-out. */
  top: 30,
  base: 28,
} as const;

/**
 * The floor's least height under the case, above the tab bar: room for the rack dots, and for
 * the floor vase and lantern to stand in front of the case (see decor).
 */
export const FLOOR_MIN = 76;

/** Where a shelf sits against the eye: we see the underside of shelves above it, the top of those below. */
export type EyeLevel = 'above' | 'level' | 'below';

export function eyeLevel(row: number, rows: number): EyeLevel {
  const mid = (rows - 1) / 2;
  return row < mid ? 'above' : row > mid ? 'below' : 'level';
}

/** Light shading for a face: `towards` faces turn to the light. */
function useShading() {
  const { r, light } = useRoom();
  return { r, light, lit: light === 'left' ? 0 : 1 };
}

/** The oak top and the white rail under it. Spans the screen; draws only over the case. */
export const CaseTop = memo(function CaseTop({ screenW }: { screenW: number }) {
  const { r, lit } = useShading();
  const x0 = CASE.margin - CASE.overhang;
  const w = screenW - 2 * x0;
  const caseW = screenW - 2 * CASE.margin;
  const crown = 14;
  // Faint grain along the oak, the same every time.
  let grain = '';
  for (let i = 0; i < 5; i++) {
    const y = 2.5 + i * 2.1;
    grain += `M${x0},${y.toFixed(1)} C${(x0 + w * 0.3).toFixed(1)},${(y + 0.8).toFixed(1)} ${(x0 + w * 0.6).toFixed(1)},${(y - 0.8).toFixed(1)} ${x0 + w},${y.toFixed(1)}`;
  }
  return (
    <View style={{ height: CASE.top }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={screenW} height={CASE.top}>
        <Defs>
          <LinearGradient id="oakFront" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.oakLight} />
            <Stop offset="0.45" stopColor={r.oak} />
            <Stop offset="1" stopColor={r.oakDark} />
          </LinearGradient>
          <LinearGradient id="oakSide" x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
            <Stop offset="0" stopColor={r.light} stopOpacity={0.25} />
            <Stop offset="0.5" stopColor={r.light} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="railShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.ao} stopOpacity={0.9} />
            <Stop offset="1" stopColor={r.ao} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Top surface, seen just from below its front edge, then the front face. */}
        <Rect x={x0} y={0} width={w} height={crown} rx={1.5} fill="url(#oakFront)" />
        <Rect x={x0} y={0} width={w} height={crown} rx={1.5} fill="url(#oakSide)" />
        <Path d={grain} stroke={r.oakDark} strokeWidth={0.6} opacity={0.35} fill="none" />
        <Rect x={x0} y={0.5} width={w} height={1} fill={r.oakLight} opacity={0.9} />
        <Rect x={x0 + 1} y={crown - 2} width={w - 2} height={2} fill={r.oakDark} />
        {/* Rail under the top, in the top's shadow. */}
        <Rect x={CASE.margin} y={crown} width={caseW} height={CASE.top - crown} fill={r.paint} />
        <Rect x={CASE.margin} y={crown} width={caseW} height={7} fill="url(#railShade)" />
        <Rect x={CASE.margin} y={CASE.top - 1} width={caseW} height={1} fill={r.paintShade} />
      </Svg>
    </View>
  );
});

/**
 * One shelf of the case: back panel in the shadow of the shelf above, the sides' inner faces
 * (one lit, one shaded) with shelf-pin holes, the shelf seen from above or below as the eye
 * sees it, and the front edge carrying a tag under each stack.
 */
export function CaseShelf({
  screenW,
  posterW,
  posterH,
  eye,
  tags,
  rich,
  children,
}: {
  screenW: number;
  posterW: number;
  posterH: number;
  eye: EyeLevel;
  /** Tag text under each pocket, left to right (null: no tag). */
  tags: (string | null)[];
  /** Pin holes and grain (off on Lite phones). */
  rich: boolean;
  children: ReactNode;
}) {
  const { r } = useRoom();
  const interior = SHELF_CHROME.top + SHELF_CHROME.peek + posterH;
  const height = interior + SHELF_CHROME.edge;
  return (
    <View style={{ height }}>
      <ShelfDrawing screenW={screenW} interior={interior} eye={eye} rich={rich} />
      <View style={[styles.row, { top: SHELF_CHROME.top }]}>{children}</View>
      <View style={[styles.row, styles.tags, { top: interior, height: SHELF_CHROME.edge }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {tags.map((t, i) => (
          <View key={i} style={{ width: posterW, alignItems: 'center' }}>
            {t ? (
              <View style={[styles.tag, { backgroundColor: r.tagBg, borderColor: r.tagBorder }]}>
                <Text style={[styles.tagText, { color: r.tagText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.15}>
                  {t}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const ShelfDrawing = memo(function ShelfDrawing({ screenW, interior, eye, rich }: { screenW: number; interior: number; eye: EyeLevel; rich: boolean }) {
  const { r, light, lit } = useShading();
  const W = screenW - 2 * CASE.margin;
  const S = CASE.side;
  const F = CASE.face;
  const E = SHELF_CHROME.edge;
  const H = interior + E;
  const id = `${eye}-${interior}`;

  // The inner face of the side nearest the light is in shade; the far one is lit.
  const nearFace = light === 'left' ? r.paintShade : r.paint;
  const farFace = light === 'left' ? r.paint : r.paintShade;

  let holes: ReactNode = null;
  if (rich) {
    const ys: number[] = [];
    for (let y = 14; y < interior - 10; y += 18) ys.push(y);
    holes = ys.flatMap((y) => [
      <Circle key={`l${y}`} cx={S + F / 2} cy={y} r={1.1} fill={r.ao} />,
      <Circle key={`r${y}`} cx={W - S - F / 2} cy={y} r={1.1} fill={r.ao} />,
    ]);
  }

  return (
    <View style={[StyleSheet.absoluteFill, { left: CASE.margin, width: W }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id={`back-${id}`} x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
            <Stop offset="0" stopColor={r.back} />
            <Stop offset="1" stopColor={r.backShade} />
          </LinearGradient>
          <LinearGradient id={`under-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.ao} stopOpacity={eye === 'above' ? 1 : 0.85} />
            <Stop offset="1" stopColor={r.ao} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`floorAo-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.ao} stopOpacity={0} />
            <Stop offset="1" stopColor={r.ao} stopOpacity={0.7} />
          </LinearGradient>
          <LinearGradient id={`edge-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={r.paintEdge} />
            <Stop offset="0.5" stopColor={r.paint} />
            <Stop offset="1" stopColor={r.paintShade} />
          </LinearGradient>
          <LinearGradient id={`sideNear-${id}`} x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
            <Stop offset="0" stopColor={r.paintEdge} />
            <Stop offset="1" stopColor={r.paint} />
          </LinearGradient>
          <LinearGradient id={`sideFar-${id}`} x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
            <Stop offset="0" stopColor={r.paint} />
            <Stop offset="1" stopColor={r.paintShade} />
          </LinearGradient>
        </Defs>

        {/* Back panel, darker away from the light. */}
        <Rect x={S} y={0} width={W - 2 * S} height={interior} fill={`url(#back-${id})`} />
        {/* The shelf above shades the top of the back panel; the shelf meets it at the bottom. */}
        <Rect x={S} y={0} width={W - 2 * S} height={Math.min(30, interior)} fill={`url(#under-${id})`} />
        <Rect x={S} y={interior - 10} width={W - 2 * S} height={10} fill={`url(#floorAo-${id})`} />

        {/* The sides' inner faces, in perspective. */}
        <Polygon points={`${S},0 ${S + F},${F * 0.6} ${S + F},${interior - F * 0.4} ${S},${interior}`} fill={nearFace} />
        <Polygon points={`${W - S},0 ${W - S - F},${F * 0.6} ${W - S - F},${interior - F * 0.4} ${W - S},${interior}`} fill={farFace} />
        {holes}

        {/* Above the eye we see the shelf's underside; below it, its top, where the posters stand. */}
        {eye === 'above' ? <Polygon points={`${S},0 ${W - S},0 ${W - S - F},5 ${S + F},5`} fill={r.paintShade} /> : null}
        {eye === 'below' ? (
          <>
            <Polygon points={`${S + F},${interior - 7} ${W - S - F},${interior - 7} ${W - S},${interior} ${S},${interior}`} fill={r.paint} />
            <Rect x={S + F} y={interior - 7} width={W - 2 * S - 2 * F} height={1} fill={r.ao} opacity={0.6} />
          </>
        ) : null}

        {/* Front edge of the shelf board. */}
        <Rect x={S} y={interior} width={W - 2 * S} height={E} fill={`url(#edge-${id})`} />
        <Rect x={S} y={interior} width={W - 2 * S} height={1} fill={r.paintEdge} />
        <Rect x={S} y={H - 1} width={W - 2 * S} height={1} fill={r.ao} opacity={0.5} />

        {/* Sides: the one facing the light is brighter. */}
        <Rect x={0} y={0} width={S} height={H} fill={light === 'left' ? `url(#sideNear-${id})` : `url(#sideFar-${id})`} />
        <Rect x={W - S} y={0} width={S} height={H} fill={light === 'left' ? `url(#sideFar-${id})` : `url(#sideNear-${id})`} />
        <Rect x={light === 'left' ? 0 : W - 1} y={0} width={1} height={H} fill={r.paintEdge} />
        <Rect x={light === 'left' ? W - 1 : 0} y={0} width={1} height={H} fill={r.ao} opacity={0.35} />
        {rich ? (
          <Path
            d={`M3,0 V${H} M7.5,0 V${H} M${W - 4},0 V${H} M${W - 8.5},0 V${H}`}
            stroke={r.paintShade}
            strokeWidth={0.5}
            opacity={0.45}
          />
        ) : null}
      </Svg>
    </View>
  );
});

/** The plinth: sides down to the floor, a kick board with an arched cut-out, the floor's shadow under it. */
export const CaseBase = memo(function CaseBase({ screenW }: { screenW: number }) {
  const { r, light, lit } = useShading();
  const W = screenW - 2 * CASE.margin;
  const S = CASE.side;
  const H = CASE.base;
  const a = S + 18;
  const b = W - S - 18;
  const arch = 11;
  return (
    <View style={{ height: H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={screenW} height={H}>
        <Defs>
          <LinearGradient id="kick" x1={String(lit)} y1="0" x2={String(1 - lit)} y2="0">
            <Stop offset="0" stopColor={r.paint} />
            <Stop offset="1" stopColor={r.paintShade} />
          </LinearGradient>
        </Defs>
        <Rect x={CASE.margin} y={0} width={W} height={H} fill="url(#kick)" />
        {/* Bottom shelf's front edge. */}
        <Rect x={CASE.margin + S} y={0} width={W - 2 * S} height={1} fill={r.paintEdge} />
        <Rect x={CASE.margin + S} y={8} width={W - 2 * S} height={1} fill={r.paintShade} />
        {/* The arch, showing the shadow under the case. */}
        <Path
          d={`M${CASE.margin + a},${H} V${H - 4} Q${CASE.margin + a},${H - arch} ${CASE.margin + a + 14},${H - arch} H${CASE.margin + b - 14} Q${CASE.margin + b},${H - arch} ${CASE.margin + b},${H - 4} V${H} Z`}
          fill={r.floorDark}
        />
        <Path d={`M${CASE.margin + a + 14},${H - arch} H${CASE.margin + b - 14}`} stroke={r.ao} strokeWidth={2} opacity={0.8} />
        <Rect x={light === 'left' ? CASE.margin : CASE.margin + W - 1} y={0} width={1} height={H} fill={r.paintEdge} />
        <Rect x={CASE.margin} y={H - 1} width={W} height={1} fill={r.ao} />
      </Svg>
    </View>
  );
});

/** The rack dots, on a little paper tag resting on the floor. */
export function FloorDots({ count, current, dimmed, onPick }: { count: number; current: number; dimmed: (i: number) => boolean; onPick: (i: number) => void }) {
  const { r } = useRoom();
  return (
    <View style={[styles.dots, { backgroundColor: r.tagBg, borderColor: r.tagBorder }]}>
      {Array.from({ length: count }, (_, i) => (
        <Pressable key={i} onPress={() => onPick(i)} hitSlop={{ top: 7, bottom: 7 }} style={styles.dotHit} accessibilityRole="button" accessibilityLabel={`Rack ${i + 1}`}>
          <View style={[styles.dot, { backgroundColor: i === current ? r.accent : r.tagText, opacity: i === current ? 1 : dimmed(i) ? 0.15 : 0.4 }]} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: CASE.margin + CASE.side + CASE.inset,
    right: CASE.margin + CASE.side + CASE.inset,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: CASE.gap,
  },
  tags: { alignItems: 'center' },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 2, borderWidth: 1, maxWidth: '100%' },
  tagText: { fontFamily: fontFamily.bold, fontSize: 9, letterSpacing: 0.9, lineHeight: 12 },
  dots: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: 999, borderWidth: 1 },
  dotHit: { width: 26, height: 30, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
