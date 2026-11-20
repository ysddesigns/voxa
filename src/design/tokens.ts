/**
 * Voxa design tokens. Source of truth: the Voxa design canvas and the PRD's
 * "Design requirements" token table. Keep names semantic, never raw hex in screens.
 */
export type Palette = {
  background: string;
  card: string;
  chip: string;
  chipPressed: string;
  separator: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentText: string;
  onAccent: string;
  warning: string;
  primaryFill: string;
  onPrimary: string;
  waveUnplayed: string;
  tabBar: string;
  tabActiveFill: string;
  shadow: string;
};

export const light: Palette = {
  background: '#FBF4F0',
  card: '#FFFFFF',
  chip: '#F0EBE7',
  chipPressed: '#E3DCD7',
  separator: '#F0EAE6',
  text: '#111111',
  textSecondary: '#5E5E63',
  textTertiary: '#6E6E73',
  accent: '#FF5A36',
  accentText: '#C23B14',
  onAccent: '#FFFFFF',
  warning: '#FDE3DE',
  primaryFill: '#111111',
  onPrimary: '#FFFFFF',
  waveUnplayed: '#D9D9DE',
  tabBar: '#FFFFFF',
  tabActiveFill: '#FDE3DE',
  shadow: 'rgba(17,17,17,0.14)',
};

export const dark: Palette = {
  background: '#0E0E0F',
  card: '#1C1C1E',
  chip: '#2C2C2E',
  chipPressed: '#39393D',
  separator: '#2C2C2E',
  text: '#F5F5F7',
  textSecondary: '#A1A1A6',
  textTertiary: '#A1A1A6',
  accent: '#FF5A36',
  accentText: '#FF8A6B',
  onAccent: '#FFFFFF',
  warning: '#3A2420',
  // Main action pill turns white with ink text in dark mode.
  primaryFill: '#F5F5F7',
  onPrimary: '#111111',
  waveUnplayed: '#3A3A3C',
  tabBar: '#1C1C1E',
  tabActiveFill: '#3A2420',
  shadow: 'rgba(0,0,0,0.4)',
};

export const radius = {
  chip: 999,
  pill: 999,
  card: 22,
  hero: 28,
  tile: 24,
  icon: 12,
} as const;

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
