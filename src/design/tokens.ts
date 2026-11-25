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
 * Library v2 ("The Rack"): a white bookcase with an oak top in a room, drawn in code with
 * one light source. By day, sun from a window on the left; by night, a warm lamp on the right.
 * Kept here so screens never hold raw hex. The one orange (accent) is the Open button and the
 * current-rack dot.
 */
export type RackPalette = {
  /** Plaster wall: base and its shaded lower part. */
  wall: string;
  wallShade: string;
  /** The room's light (window sun, or lamp glow), drawn at low opacity. */
  light: string;
  /** Painted wood of the case: lit face, shaded face, highlight on edges. */
  paint: string;
  paintShade: string;
  paintEdge: string;
  /** The back panel inside the shelves, lit and in shadow. */
  back: string;
  backShade: string;
  /** Oak: the case top and the floor. */
  oak: string;
  oakDark: string;
  oakLight: string;
  floor: string;
  floorDark: string;
  floorLine: string;
  /** Soft cast shadows, and the darkening where surfaces meet (ambient occlusion). */
  shadow: string;
  ao: string;
  /** Shelf tags: paper in a brass holder. */
  tagBg: string;
  tagBorder: string;
  tagText: string;
  title: string;
  overline: string;
  /** Borders of the round header buttons and the search field. */
  control: string;
  accent: string;
  /** Drawn over the posters to sit them in the room's light. */
  posterVeil: string;
  /** Paper gloss on the posters. */
  sheen: string;
  /** Dims the room behind a stack pulled off its shelf, and the text on it. */
  scrim: string;
  onScrim: string;
  onScrimSecondary: string;
};

export const rackLight: RackPalette = {
  wall: '#ECE4D6',
  wallShade: '#DCD2C1',
  light: '#FFF6E0',
  paint: '#F8F6F1',
  paintShade: '#E2DDD3',
  paintEdge: '#FFFFFF',
  back: '#F0ECE4',
  backShade: '#D6CFC3',
  oak: '#C99A5B',
  oakDark: '#A2713A',
  oakLight: '#E4BC80',
  floor: '#C48E57',
  floorDark: '#9C6A3A',
  floorLine: 'rgba(92,56,24,0.32)',
  shadow: 'rgba(72,52,30,0.22)',
  ao: 'rgba(60,44,28,0.30)',
  tagBg: '#FBF7EE',
  tagBorder: '#A8834A',
  tagText: '#3A3128',
  title: '#2A2118',
  overline: '#5C4B36',
  control: '#7D7264',
  accent: '#D63F1C',
  posterVeil: 'rgba(0,0,0,0)',
  sheen: '#FFFFFF',
  scrim: 'rgba(42,33,24,0.82)',
  onScrim: '#FFF7E2',
  onScrimSecondary: '#E3D6BC',
};

/** Evening: the same room by lamplight. */
export const rackDark: RackPalette = {
  wall: '#231E1A',
  wallShade: '#16120F',
  light: '#FFB561',
  paint: '#C9C1B4',
  paintShade: '#958C80',
  paintEdge: '#E3DBCE',
  back: '#8E867A',
  backShade: '#544D45',
  oak: '#8A6238',
  oakDark: '#583B1D',
  oakLight: '#AD7E4D',
  floor: '#563A23',
  floorDark: '#352214',
  floorLine: 'rgba(0,0,0,0.38)',
  shadow: 'rgba(0,0,0,0.42)',
  ao: 'rgba(0,0,0,0.48)',
  tagBg: '#E9E1D2',
  tagBorder: '#8F6E3E',
  tagText: '#2E261E',
  title: '#F3EBD9',
  overline: '#B9AE9A',
  control: '#8D8578',
  accent: '#D63F1C',
  posterVeil: 'rgba(24,14,4,0.16)',
  sheen: '#FFE2B8',
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
