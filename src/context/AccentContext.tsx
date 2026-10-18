import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { applyAccent, getStoredAccent, type Accent } from '../lib/accent';

interface AccentContextValue {
  accent: Accent;
  setAccent: (accent: Accent) => void;
}

const AccentContext = createContext<AccentContextValue | null>(null);

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(getStoredAccent);

  const setAccent = useCallback((next: Accent) => {
    applyAccent(next, true);
    setAccentState(next);
  }, []);

  const value = useMemo(() => ({ accent, setAccent }), [accent, setAccent]);

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within an AccentProvider');
  return ctx;
}
