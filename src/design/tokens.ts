/**
 * Voxa design tokens: Apple's system palette (iOS grouped backgrounds, system greys, labels)
 * with one brand accent. Keep names semantic, never raw hex in screens.
 *
 * Rules (anti-slop locks):
 * - One accent: Voxa orange, spent on the primary action, active state and progress only.
 * - One grey family: Apple's cool system greys. No warm greys.
 * - Shape: actions are pills; cards, tiles and sheets 20; grouped lists 12; inputs and icon tiles 10.
 *   Every rounded rectangle uses continuous corners (see `squircle`).
 * - Text passes AA (4.5:1) on every surface it sits on: src/design/__tests__/contrast.test.ts.
 */
export type Palette = {
  /** systemGroupedBackground: the page behind cards and grouped lists. */
  background: string;
  /** secondarySystemGroupedBackground: cards, grouped rows, sheets. */
  card: string;
  /** Filled controls on a card: chips, segmented controls, gray buttons. */
  chip: string;
  chipPressed: string;
  separator: string;
  /** label / secondaryLabel / tertiaryLabel, darkened where Apple's fail AA. */
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentText: string;
  onAccent: string;
  /** Tinted background for notices (accent at low strength). */
  warning: string;
  primaryFill: string;
  onPrimary: string;
  waveUnplayed: string;
  tabBar: string;
  tabActiveFill: string;
  shadow: string;
  /** Background of the word being spoken. */
  highlight: string;
  /** Player artwork. */
  art: string;
};

export const light: Palette = {
  background: '#F2F2F7',
  card: '#FFFFFF',
  chip: '#E5E5EA',
  chipPressed: '#D1D1D6',
  separator: '#C6C6C8',
  text: '#000000',
  // Apple's secondaryLabel (#3C3C43 at 60%) is about 3.6:1 on white; this is the AA-safe step.
  textSecondary: '#55555A',
  textTertiary: '#55555A',
  // Deepened from the canvas orange (#FF5A36, kept for the app icon) so white button text passes AA.
  accent: '#D63F1C',
  accentText: '#A02F0F',
  onAccent: '#FFFFFF',
  warning: '#FDE3DE',
  primaryFill: '#000000',
  onPrimary: '#FFFFFF',
  waveUnplayed: '#D1D1D6',
  tabBar: '#F9F9F9',
  tabActiveFill: '#FDE3DE',
  shadow: 'rgba(0,0,0,0.12)',
  highlight: '#FFE1D6',
  art: '#F58A84',
};

export const dark: Palette = {
  background: '#000000',
  card: '#1C1C1E',
  chip: '#2C2C2E',
  chipPressed: '#3A3A3C',
  separator: '#38383A',
  text: '#FFFFFF',
  textSecondary: '#AEAEB2',
  textTertiary: '#AEAEB2',
  accent: '#D63F1C',
  accentText: '#FF8A6B',
  onAccent: '#FFFFFF',
  warning: '#3A2420',
  // The main action turns white with black text in dark mode, as in Apple's own apps.
  primaryFill: '#FFFFFF',
  onPrimary: '#000000',
  waveUnplayed: '#3A3A3C',
  tabBar: '#161618',
  tabActiveFill: '#3A2420',
  shadow: 'rgba(0,0,0,0.5)',
  highlight: '#5A2A1E',
  art: '#7A3A30',
};

/**
 * Library v2 ("The Rack"): a sunlit wall with a wire brochure rack. Its own warm surface, kept
 * here so screens never hold raw hex. The lip is the Voxa accent, the one orange on the screen.
 */
export type RackPalette = {
  wall: string;
  /** Window light falling on the wall (drawn at low opacity). */
  wallLight: string;
  tile: string;
  /** Flat cast shadows of the rack, shelves and posters. */
  shade: string;
  wire: string;
  wireShine: string;
  lip: string;
  onLip: string;
  counter: string;
  counterEdge: string;
  title: string;
  overline: string;
  /** Drawn over the posters to sit them in the room's light. */
  posterVeil: string;
  /** Dims the rack behind a stack pulled out of its pocket, and the text on it. */
  scrim: string;
  onScrim: string;
  onScrimSecondary: string;
};

export const rackLight: RackPalette = {
  wall: '#EFE2C4',
  wallLight: '#FFF7E2',
  tile: 'rgba(120,96,56,0.10)',
  shade: 'rgba(92,70,36,0.18)',
  wire: '#6F737B',
  wireShine: '#B9BCC2',
  lip: '#D63F1C',
  onLip: '#FFFFFF',
  counter: '#E8B66C',
  counterEdge: '#C98F45',
  title: '#2A2118',
  overline: '#5C4B36',
  posterVeil: 'rgba(0,0,0,0)',
  scrim: 'rgba(42,33,24,0.82)',
  onScrim: '#FFF7E2',
  onScrimSecondary: '#E3D6BC',
};

/** Night: the same room by moonlight. */
export const rackDark: RackPalette = {
  wall: '#17181F',
  wallLight: '#3A4A72',
  tile: 'rgba(255,255,255,0.05)',
  shade: 'rgba(0,0,0,0.45)',
  wire: '#8D919C',
  wireShine: '#C4C7CF',
  lip: '#D63F1C',
  onLip: '#FFFFFF',
  counter: '#3B2C1E',
  counterEdge: '#24190F',
  title: '#F3EBD9',
  overline: '#B9AE9A',
  posterVeil: 'rgba(8,10,20,0.22)',
  scrim: 'rgba(0,0,0,0.78)',
  onScrim: '#F3EBD9',
  onScrimSecondary: '#C9BFAC',
};

/** The shape scale. Old names (chip, hero, tile, icon) map onto it. */
export const radius = {
  pill: 999,
  chip: 999,
  /** Cards, tiles, the Home hero, sheets. */
  card: 20,
  hero: 20,
  tile: 20,
  /** Grouped (Settings-style) lists. */
  group: 12,
  /** Text fields, icon tiles, small badges. */
  icon: 10,
  input: 10,
} as const;

/** Continuous (squircle) corners for every rounded rectangle; ignored where unsupported. */
export const squircle = { borderCurve: 'continuous' } as const;

/** The one elevation: floating bars and the player's play button. */
export const elevation = (shadow: string) => ({ boxShadow: `0 8px 24px ${shadow}` }) as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

/** Minimum touch target, from the PRD's accessibility rules. */
export const minTouch = 44;
