import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { VoxaEngine } from '../../modules/voxa-engine';
import { useDeviceTier } from '@/device/use-device-tier';
import { useEngineMode } from '@/engines/provider';
import { packIdOf } from '@/engines/native';
import { useModels } from '@/features/packs/models';
import { usePrefs } from '@/features/settings/prefs';
import type { LastUsed } from '@/storage/prefs';
import type { Tier } from './types';

/** Waits this long after the first screen settles, so start-up itself stays quick. */
export const WARM_DELAY_MS = 1500;

/**
 * What to load ahead of time, most likely first. A Lite phone (2-3 GB) holds only one big model
 * at once, so it warms just the one the person used last (listening when unknown and downloaded).
 * Bigger phones warm both, one after another (never side by side: that doubles the memory peak).
 */
export function warmUpJobs(o: { tier: Tier; listenReady: boolean; lastUsed: LastUsed; voicePack: string }): string[] {
  const listen = o.listenReady ? ['listen'] : [];
  const voice = [`voice:${o.voicePack}`];
  const ordered = o.lastUsed === 'speak' ? [...voice, ...listen] : [...listen, ...voice];
  return o.tier === 'lite' ? ordered.slice(0, 1) : ordered;
}

/**
 * Loads the listening model and voice in the background after start-up, so tapping Listen or
 * Play starts at once. Runs again when the app comes back to the front, because Android may have
 * freed idle models while it was away (the native side skips anything already loaded, and
 * anything the phone has no free memory for).
 */
export function useStartupWarmUp() {
  const { mode } = useEngineMode();
  const { prefs, loaded } = usePrefs();
  const models = useModels();
  const tier = useDeviceTier();
  const jobs = warmUpJobs({ tier, listenReady: models.ready.listen, lastUsed: prefs.lastUsed, voicePack: packIdOf(prefs.voiceId) });
  // Read when the warm-up runs: what the person does meanwhile must not start another load.
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  });
  const listenReady = models.ready.listen;
  const enabled = loaded && mode === 'device' && !!VoxaEngine?.prewarm;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let idle: number | null = null;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      if (idle !== null) globalThis.cancelIdleCallback?.(idle);
      timer = null;
      idle = null;
    };
    const run = () => {
      idle = null;
      if (AppState.currentState === 'active') VoxaEngine?.prewarm?.(jobsRef.current).catch(() => {});
    };
    // After the delay, wait for a quiet moment on the JS thread (no animation or list rendering).
    const schedule = () => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        if (typeof globalThis.requestIdleCallback === 'function') idle = globalThis.requestIdleCallback(run, { timeout: 3000 });
        else run();
      }, WARM_DELAY_MS);
    };
    schedule();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') schedule();
      else cancel();
    });
    return () => {
      sub.remove();
      cancel();
    };
    // listenReady: warm the listening model as soon as its download finishes.
  }, [enabled, listenReady]);
}
