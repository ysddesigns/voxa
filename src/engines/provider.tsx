import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createMockEngines } from './mock';
import { getNativeEngines } from './native';
import type { Engines } from './types';

export type EngineMode = 'device' | 'mock';

type EngineModeValue = {
  mode: EngineMode;
  setMode: (mode: EngineMode) => void;
  /** True when this build includes modules/voxa-engine (Android builds made after the spike). */
  deviceAvailable: boolean;
};

const EngineContext = createContext<Engines | null>(null);
const EngineModeContext = createContext<EngineModeValue | null>(null);

/**
 * Picks the engine implementation. Uses the on-device engines when the native
 * module is in the build, otherwise the TypeScript mocks. The Engine lab screen can
 * switch between them. Tests pass `engines` to force one.
 */
export function EngineProvider({ children, engines }: { children: ReactNode; engines?: Engines }) {
  const native = useMemo(() => (engines ? null : getNativeEngines()), [engines]);
  const mock = useMemo(() => createMockEngines(), []);
  const [mode, setMode] = useState<EngineMode>(native ? 'device' : 'mock');
  const active: EngineMode = native && mode === 'device' ? 'device' : 'mock';
  const value = engines ?? (active === 'device' && native ? native : mock);
  const modeValue = useMemo(() => ({ mode: active, setMode, deviceAvailable: !!native }), [active, native]);
  return (
    <EngineModeContext.Provider value={modeValue}>
      <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
    </EngineModeContext.Provider>
  );
}

export function useEngines(): Engines {
  const value = useContext(EngineContext);
  if (!value) throw new Error('useEngines must be used inside EngineProvider');
  return value;
}

export function useEngineMode(): EngineModeValue {
  const value = useContext(EngineModeContext);
  if (!value) throw new Error('useEngineMode must be used inside EngineProvider');
  return value;
}
