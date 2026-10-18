import { useEffect, useState } from 'react';
import { adminApi } from './api/admin';
import { contactInquiriesApi } from './api/contactInquiries';
import { driversApi } from './api/drivers';
import { eventsApi } from './api/events';
import { isSignupOpen } from './eventSignups';
import { EMPTY_BADGE_COUNTS, type BadgeCounts } from '../components/navConfig';
import type { User } from '../types/user';

const BADGE_POLL_INTERVAL_MS = 60_000;

/** Data the desktop sidebar and the mobile nav share: the nav badge counts and the viewer's own
 * avatar. Loaded once by the shell so both navs show the same numbers without double-fetching. */
export function useNavData(user: User | null): { badgeCounts: BadgeCounts; ownAvatarUrl: string | null } {
  const [badgeCounts, setBadgeCounts] = useState<BadgeCounts>(EMPTY_BADGE_COUNTS);
  const [ownAvatarUrl, setOwnAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void driversApi
      .getOwn()
      .then((profile) => setOwnAvatarUrl(profile.avatarUrl))
      .catch(() => undefined);
  }, [user]);

  // Events with signups still open — the one thing every member is expected to act on.
  useEffect(() => {
    if (!user) return;
    void eventsApi
      .list()
      .then((events) => {
        const open = events.filter((e) => isSignupOpen(e)).length;
        setBadgeCounts((prev) => ({ ...prev, openSignups: open }));
      })
      .catch(() => undefined);
  }, [user]);

  const isAdmin = user?.role === 'ADMIN';
  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    // A setTimeout chain (not setInterval): the next poll is only scheduled once the current one
    // has settled, never while the tab is hidden, and never twice.
    function scheduleNext() {
      clearTimer();
      if (cancelled || document.hidden) return;
      timer = setTimeout(() => void poll(), BADGE_POLL_INTERVAL_MS);
    }

    async function poll() {
      clearTimer();
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        // Two cheap COUNT endpoints instead of downloading the full member and inquiry lists.
        const [counts, unreviewed] = await Promise.allSettled([
          adminApi.counts(),
          contactInquiriesApi.unreviewedCount(),
        ]);
        if (cancelled) return;
        setBadgeCounts((prev) => ({
          ...prev,
          pendingMembers: counts.status === 'fulfilled' ? counts.value.PENDING : prev.pendingMembers,
          unreviewedInquiries: unreviewed.status === 'fulfilled' ? unreviewed.value.count : prev.unreviewedInquiries,
        }));
      } finally {
        inFlight = false;
        scheduleNext();
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        clearTimer();
      } else {
        void poll(); // refresh immediately on coming back, then resume the cadence
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) void poll();
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAdmin]);

  return { badgeCounts, ownAvatarUrl };
}
