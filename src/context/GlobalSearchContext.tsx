import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import GlobalSearchDialog from '../components/GlobalSearchDialog';
import { clearSearchIndex, warmSearchIndex } from '../lib/globalSearch';
import { useAuth } from './AuthContext';

interface GlobalSearchContextValue {
  openSearch: () => void;
  /** "Ctrl K" or the Mac equivalent, for the hint next to search fields. */
  shortcutLabel: string;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | undefined>(undefined);

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

/** Owns the open/closed state of the search palette and the global Ctrl/Cmd+K shortcut. Mount it
 * once inside the authenticated shell; anything below can call `useGlobalSearch().openSearch()`. */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // The cached index is per-viewer (drafts are admin-only), so drop it when the user changes.
  const userId = user?.id;
  useEffect(() => () => clearSearchIndex(), [userId]);

  // Build the index in an idle moment after login so the first Ctrl+K isn't a cold fetch.
  useEffect(() => (userId ? warmSearchIndex() : undefined), [userId]);

  const value = useMemo<GlobalSearchContextValue>(
    () => ({ openSearch, shortcutLabel: isMac() ? '⌘ K' : 'Ctrl K' }),
    [openSearch],
  );

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      {open && <GlobalSearchDialog onClose={closeSearch} />}
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch(): GlobalSearchContextValue {
  const context = useContext(GlobalSearchContext);
  if (!context) {
    throw new Error('useGlobalSearch must be used within a GlobalSearchProvider');
  }
  return context;
}
