import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import { VoxaEngine } from '../../../modules/voxa-engine';
import { guideFor, type BatteryGuide } from './battery-guide';

export type BatteryState = {
  android: boolean;
  /** Android's battery optimisation is off for Voxa; null when this build cannot tell. */
  unrestricted: boolean | null;
  guide: BatteryGuide;
  /** Opens the phone's battery settings; false when it could not. */
  open: (which: 'optimisation' | 'app') => boolean;
};

const read = () => (VoxaEngine?.batteryStatus ? VoxaEngine.batteryStatus().unrestricted : null);

/** Battery-saver status for Voxa, re-read when the person comes back from the phone's settings. */
export function useBattery(): BatteryState {
  const android = Platform.OS === 'android';
  const [unrestricted, setUnrestricted] = useState<boolean | null>(() => (android ? read() : null));
  useEffect(() => {
    if (!android) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setUnrestricted(read());
    });
    return () => sub.remove();
  }, [android]);
  return {
    android,
    unrestricted,
    guide: guideFor(Device.manufacturer, Device.brand),
    open: (which) => VoxaEngine?.openBatterySettings?.(which) ?? false,
  };
}
