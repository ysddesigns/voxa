import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';

/** PRD ST-1: dark mode follows the system or is set manually. */
export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeValue = {
  colors: Palette;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined,
): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function VoxaThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');
  const value = useMemo<ThemeValue>(() => {
    const scheme = resolveScheme(preference, system);
    return { colors: scheme === 'dark' ? dark : light, scheme, preference, setPreference };
  }, [preference, system]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside VoxaThemeProvider');
  return value;
}
