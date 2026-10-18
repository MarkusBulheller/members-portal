import { useCallback, useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query (one matchMedia listener per hook instance, removed on
 * unmount). Used to avoid mounting heavy subtrees that CSS would only hide. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
