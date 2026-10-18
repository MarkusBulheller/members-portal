import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Side effects (DOM attribute + localStorage) belong in an effect, not in a state updater.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
