import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createMockEngines } from './mock';
import type { Engines } from './types';

const EngineContext = createContext<Engines | null>(null);

/**
 * Picks the engine implementation at start-up. Until modules/voxa-engine lands
 * (phase 0, sprint 3), every build uses the TypeScript mocks.
 */
export function EngineProvider({ children, engines }: { children: ReactNode; engines?: Engines }) {
  const value = useMemo(() => engines ?? createMockEngines(), [engines]);
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngines(): Engines {
  const value = useContext(EngineContext);
  if (!value) throw new Error('useEngines must be used inside EngineProvider');
  return value;
}
