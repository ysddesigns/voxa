import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { VoxaEngine } from '../../../modules/voxa-engine';

export type LiveUpdates = {
  /** This phone has Android 16 Live Updates (the status-bar chip while listening). */
  supported: boolean;
  /** They are on for Voxa. */
  allowed: boolean;
  /** Opens the phone's switch for them; false when it could not. */
  open: () => boolean;
};

const read = () => (Platform.OS === 'android' && VoxaEngine?.liveUpdateStatus ? VoxaEngine.liveUpdateStatus() : { supported: false, allowed: false });

/** Live Updates status, re-read when the person comes back from the phone's settings. */
export function useLiveUpdates(): LiveUpdates {
  const [status, setStatus] = useState(read);
  useEffect(() => {
    if (!status.supported) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setStatus(read());
    });
    return () => sub.remove();
  }, [status.supported]);
  return { ...status, open: () => VoxaEngine?.openLiveUpdateSettings?.() ?? false };
}
