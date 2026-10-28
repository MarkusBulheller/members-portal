import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';
import { eventTeamLeadsApi } from './api/eventTeamLeads';

/** The leads of ONE event crew, for the plan page's driver list (admin only - the endpoints are
 * admin-only, so pass `enabled: false` for everyone else). A lead only ever affects this crew in
 * this event. */
export function useTeamLeadSet(eventId: string | undefined, teamId: string | undefined, enabled: boolean) {
  const active = enabled && !!eventId && !!teamId;
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !eventId || !teamId) return;
    let cancelled = false;
    eventTeamLeadsApi
      .list(eventId, teamId)
      .then((list) => {
        if (cancelled) return;
        setLeadIds(list.map((l) => l.userId));
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load the team lead.');
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, eventId, teamId]);

  const toggle = useCallback(
    async (userId: string) => {
      if (!eventId || !teamId) return;
      const next = leadIds.includes(userId) ? leadIds.filter((id) => id !== userId) : [...leadIds, userId];
      setError(null);
      setBusy(true);
      try {
        const saved = await eventTeamLeadsApi.replace(eventId, teamId, next);
        setLeadIds(saved.map((l) => l.userId));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to save the team lead.');
      } finally {
        setBusy(false);
      }
    },
    [eventId, teamId, leadIds],
  );

  return { active, loaded, busy, error, isLead: (userId: string) => leadIds.includes(userId), toggle };
}
