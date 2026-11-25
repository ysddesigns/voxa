import { useReducedMotion } from 'react-native-reanimated';
import { useDeviceTier } from '@/device/use-device-tier';
import { useTheme } from './theme';
import { rackDark, rackLight, type RackPalette } from './tokens';

/**
 * The scene: Voxa's drawn rooms (first the Library's Rack) share one light. By day it is sun
 * from a window on the left; by night a warm lamp on the right. Every shadow, gloss and shaded
 * face is worked out from this one side, so anything drawn with it sits in the same room.
 */
export type LightSide = 'left' | 'right';

export type Scene = {
  /** The room's palette: plaster, paint, oak, paper and the light itself. */
  r: RackPalette;
  /** Where the light comes from. */
  light: LightSide;
  /** Gradient start (0 = left, 1 = right) for a face lit from the light's side. */
  lit: 0 | 1;
  /** Which way shadows fall along x: away from the light (1 = right, -1 = left). */
  away: 1 | -1;
};

export function sceneFor(scheme: 'light' | 'dark'): Scene {
  const dark = scheme === 'dark';
  return dark ? { r: rackDark, light: 'right', lit: 1, away: -1 } : { r: rackLight, light: 'left', lit: 0, away: 1 };
}

const DAY = sceneFor('light');
const NIGHT = sceneFor('dark');

/** The room's palette and light side, following the app's light or dark scheme. */
export function useScene(): Scene {
  return useTheme().scheme === 'dark' ? NIGHT : DAY;
}

export type SceneQuality = {
  /** Extra layers: soft shadows, gloss, grain, pin holes. Off on Lite phones. */
  rich: boolean;
  /** Lifts, turns and drifting light. Off on Lite phones and with Reduce Motion. */
  motion: boolean;
};

/** How much of a scene to draw on this phone (PRD: 2 GB phones must stay smooth). */
export function useSceneQuality(): SceneQuality {
  const rich = useDeviceTier() !== 'lite';
  const reduceMotion = useReducedMotion();
  return { rich, motion: rich && !reduceMotion };
}
