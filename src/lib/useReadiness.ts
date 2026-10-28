import { useCallback, useEffect, useState } from 'react';
import { eventsApi } from './api/events';
import type { ReadinessResult } from '../types/readiness';

interface Options {
  /** False skips the request entirely (e.g. nothing to look at yet). Default true. */
  enabled?: boolean;
  /** Change this value to trigger a refetch (e.g. after a save or a live-feed change). */
  refreshKey?: number | string;
}

interface Settled {
  key: string;
  error: string | null;
}

/** Loads the informational race-readiness check for an event. No polling: it fetches on mount,
 * when `eventId`/`refreshKey` change, and on `refresh()`. The previous result stays on screen while
 * a refetch is in flight; a response that no longer matches the current request (stale guard) is
 * dropped. */
export function useReadiness(eventId: string | undefined, { enabled = true, refreshKey }: Options = {}) {
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [manual, setManual] = useState(0);
  const active = !!eventId && enabled;
  const key = `${eventId ?? ''}|${refreshKey ?? ''}|${manual}`;

  useEffect(() => {
    if (!eventId || !enabled) return;
    let current = true; // flips when a newer request supersedes this one (or on unmount)
    eventsApi
      .getReadiness(eventId)
      .then((loaded) => {
        if (!current) return;
        setResult(loaded);
        setSettled({ key, error: null });
      })
      .catch((err: unknown) => {
        if (!current) return;
        setSettled({
          key,
          error: err instanceof Error && err.message ? err.message : 'Could not load the readiness check.',
        });
      });
    return () => {
      current = false;
    };
  }, [eventId, enabled, key]);

  const refresh = useCallback(() => setManual((n) => n + 1), []);

  // A different event must never show the previous event's result.
  const data = result && result.eventId === eventId ? result : null;
  const loading = active && settled?.key !== key;
  const error = active && settled?.key === key ? settled.error : null;
  return { data, loading, error, refresh };
}
