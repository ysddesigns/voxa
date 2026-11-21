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

/** Pass preference and onPreferenceChange to keep the choice somewhere (Settings saves it); otherwise it lives in memory. */
export function VoxaThemeProvider({
  children,
  preference: controlled,
  onPreferenceChange,
}: {
  children: ReactNode;
  preference?: ThemePreference;
  onPreferenceChange?: (p: ThemePreference) => void;
}) {
  const system = useColorScheme();
  const [own, setOwn] = useState<ThemePreference>('system');
  const preference = controlled ?? own;
  const setPreference = onPreferenceChange ?? setOwn;
  const value = useMemo<ThemeValue>(() => {
    const scheme = resolveScheme(preference, system);
    return { colors: scheme === 'dark' ? dark : light, scheme, preference, setPreference };
  }, [preference, system, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside VoxaThemeProvider');
  return value;
}
