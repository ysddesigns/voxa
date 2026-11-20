import { useMemo } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type { Tier } from '@/engines/types';
import { tierFromFacts } from './tier';

export function useDeviceTier(): Tier {
  return useMemo(
    () =>
      tierFromFacts({
        totalMemoryBytes: Device.totalMemory,
        supportedCpuArchitectures: Device.supportedCpuArchitectures,
        platform: Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'other',
      }),
    [],
  );
}
