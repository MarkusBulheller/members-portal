import { useEffect, useRef, useState } from 'react';
import { apiUrl } from './api';
import { isPageHidden, type PageActivity, subscribeToPageActivity } from './pageActivity';

export type LivePlanKind = 'stints' | 'team' | 'drivers' | 'event';

/** A change notice from the backend's team-plan SSE stream. It carries no plan data — the page
 * refetches what it shows through the normal REST endpoints. */
export interface LivePlanMessage {
  eventId: string;
  teamId: string;
  kind: LivePlanKind;
  byUserId: string | null;
  at: string;
}

export type LiveConnection = 'connecting' | 'live' | 'reconnecting';

/** One person currently viewing the plan (server-side `presence` SSE event; one entry per user
 * however many tabs they have open). `avatarUrl` is the stored path — run it through resolveAssetUrl. */
export interface PresenceUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface LivePlanState {
  connection: LiveConnection;
  /** Who has this plan open right now, in server order (join order). Empty while not connected. */
  presence: PresenceUser[];
}

/** A burst of changes (a plan being generated is dozens of writes) collapses into one callback: it
 * fires this long after the LAST message of the burst (a real trailing debounce)... */
const DEBOUNCE_MS = 250;
/** ...but never later than this after the FIRST message of the burst, so a long continuous burst
 * still refreshes the page about once a second instead of not at all until it ends. */
const MAX_WAIT_MS = 1_000;
/** While the stream is down, poll at this interval so the page still converges. */
const POLL_INTERVAL_MS = 15_000;
/** Consecutive failed attempts before the polling fallback starts. */
const POLL_AFTER_ERRORS = 2;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** Random 0..this added to every reconnect delay so a restarted backend isn't hit by every tab at once. */
const RETRY_JITTER_MS = 1_000;
/** The server sends a `heartbeat` event every 25s; this long with no message, heartbeat or open
 * means the connection is dead even if the browser still reports it as open (sleep, silent proxy). */
const STALE_AFTER_MS = 60_000;
const WATCHDOG_INTERVAL_MS = 15_000;
/** Back in the tab after hiding it for longer than this: resync once (shorter absences kept the
 * stream and its heartbeat alive, so nothing was missed). */
const RESYNC_AFTER_HIDDEN_MS = 30_000;

function parseMessage(raw: unknown): LivePlanMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const value = JSON.parse(raw) as Partial<LivePlanMessage> | null;
    if (!value || typeof value.kind !== 'string') return null;
    return {
      eventId: String(value.eventId ?? ''),
      teamId: String(value.teamId ?? ''),
      kind: value.kind,
      byUserId: typeof value.byUserId === 'string' ? value.byUserId : null,
      at: String(value.at ?? ''),
    };
  } catch {
    return null;
  }
}

/** Parses a `presence` event body: a JSON array of users. Returns null for anything that isn't one
 * (so the previous list is kept); entries that don't have the expected shape are skipped. */
function parsePresence(raw: unknown): PresenceUser[] | null {
  if (typeof raw !== 'string') return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const users: PresenceUser[] = [];
    for (const item of value as unknown[]) {
      if (typeof item !== 'object' || item === null) continue;
      const u = item as Partial<Record<keyof PresenceUser, unknown>>;
      if (typeof u.userId !== 'string' || !u.userId || typeof u.name !== 'string') continue;
      users.push({
        userId: u.userId,
        name: u.name,
        avatarUrl: typeof u.avatarUrl === 'string' && u.avatarUrl ? u.avatarUrl : null,
        isAdmin: u.isAdmin === true,
      });
    }
    return users;
  } catch {
    return null;
  }
}

const EMPTY_PRESENCE: PresenceUser[] = [];

/**
 * Keeps a team's stint-plan page in sync with other people's edits. Opens a Server-Sent Events
 * stream and calls `onChange` (trailing debounce with a max wait, coalescing bursts) with the
 * change notices that arrived. While the tab is hidden, deliveries are held until it is visible.
 * An EMPTY array means "just resync": the stream came back after a drop, the tab was hidden for a
 * while, or the 15s polling fallback fired (EventSource unavailable, or erroring repeatedly).
 *
 * EventSource reconnects by itself while the connection merely dropped; when the server answered
 * with an error status the browser gives up (readyState CLOSED), so that case is retried here with
 * exponential backoff plus jitter. A watchdog reconnects a stream that has gone silent (no message
 * or `heartbeat` for 60s) even though the browser still calls it open. `onChange` may change
 * identity every render — the latest one is always used.
 *
 * Same hook, but also exposes who else has the page open (the stream's named `presence` event).
 * Presence never triggers `onChange`; it only counts as proof of life for the watchdog, and is
 * cleared whenever the stream drops.
 */
export function useLivePlanState(
  eventId: string | undefined,
  teamId: string | undefined,
  onChange: (messages: LivePlanMessage[]) => void,
): LivePlanState {
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const [presence, setPresence] = useState<PresenceUser[]>(EMPTY_PRESENCE);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!eventId || !teamId) return;

    let disposed = false;
    let source: EventSource | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setInterval> | undefined;
    // Latest message per (kind, sender): the page only reads the set of kinds and the last sender
    // from someone else, so a 100-write burst collapses to a handful of entries.
    let pending = new Map<string, LivePlanMessage>();
    // Something is waiting to be delivered — possibly just a bare "resync" with no message.
    let dirty = false;
    let burstStartedAt = 0;
    let failures = 0;
    let lastActivityAt = Date.now();

    const deliver = () => {
      debounceTimer = undefined;
      if (disposed || !dirty) return;
      // A hidden tab holds its refetch until the user is back (see onPageActivity).
      if (isPageHidden()) return;
      const batch = [...pending.values()];
      pending = new Map();
      dirty = false;
      burstStartedAt = 0;
      onChangeRef.current(batch);
    };
    const schedule = (message?: LivePlanMessage | null) => {
      if (message) {
        const key = `${message.kind}|${message.byUserId ?? ''}`;
        pending.delete(key); // re-insert so the Map keeps "latest last"
        pending.set(key, message);
      }
      const now = Date.now();
      if (!dirty) burstStartedAt = now;
      dirty = true;
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(deliver, Math.max(0, Math.min(DEBOUNCE_MS, burstStartedAt + MAX_WAIT_MS - now)));
    };

    const startPolling = () => {
      if (pollTimer === undefined) pollTimer = setInterval(() => schedule(), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer !== undefined) clearInterval(pollTimer);
      pollTimer = undefined;
    };
    const retryDelay = () =>
      Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(failures, 6)) + Math.random() * RETRY_JITTER_MS;

    const clearPresence = () => setPresence((prev) => (prev.length === 0 ? prev : EMPTY_PRESENCE));

    const closeSource = () => {
      if (source) {
        source.onopen = null;
        source.onmessage = null;
        source.onerror = null;
        source.close();
      }
      source = null;
    };

    const connect = () => {
      retryTimer = undefined;
      if (disposed) return;
      if (typeof EventSource === 'undefined') {
        setConnection('reconnecting');
        clearPresence();
        startPolling();
        return;
      }
      const es = new EventSource(apiUrl(`/events/${eventId}/teams/${teamId}/stream`), { withCredentials: true });
      source = es;
      lastActivityAt = Date.now();
      es.onopen = () => {
        lastActivityAt = Date.now();
        stopPolling();
        setConnection('live');
        // Anything that happened while we were away is missed — catch up once.
        if (failures > 0) {
          failures = 0;
          schedule();
        }
      };
      es.onmessage = (e: MessageEvent) => {
        lastActivityAt = Date.now();
        // An unparseable payload still means "something changed" — resync rather than ignore it.
        const message = parseMessage(e.data);
        schedule(message);
      };
      // The server's keep-alive is a NAMED event, which onmessage never sees.
      es.addEventListener('heartbeat', () => {
        lastActivityAt = Date.now();
      });
      // Also a NAMED event, so onChange is untouched; it is proof of life like the heartbeat.
      es.addEventListener('presence', (e) => {
        lastActivityAt = Date.now();
        const next = parsePresence((e as MessageEvent).data);
        if (!next) return; // malformed: keep what we had
        setPresence((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
      es.onerror = () => {
        failures += 1;
        setConnection('reconnecting');
        clearPresence();
        if (failures >= POLL_AFTER_ERRORS) startPolling();
        if (es.readyState === EventSource.CLOSED) {
          // The browser won't retry a rejected connection (e.g. 401/404/proxy error) — do it ourselves.
          closeSource();
          retryTimer = setTimeout(connect, retryDelay());
        }
      };
    };

    /** Drops a connection that looks open but has gone silent and opens a fresh one; the catch-up
     * resync happens in onopen (failures > 0). */
    const reconnectStale = () => {
      if (disposed) return;
      failures = Math.max(failures, 1);
      setConnection('reconnecting');
      clearPresence();
      closeSource();
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, Math.random() * RETRY_JITTER_MS);
    };
    const isStale = () => source !== null && Date.now() - lastActivityAt > STALE_AFTER_MS;

    // No watchdog check runs while the tab is hidden; it happens as soon as the user is back.
    watchdogTimer = setInterval(() => {
      if (!isPageHidden() && isStale()) reconnectStale();
    }, WATCHDOG_INTERVAL_MS);

    const onPageActivity = ({ hiddenForMs }: PageActivity) => {
      if (isStale()) {
        reconnectStale();
        return;
      }
      // A long absence may have missed messages; otherwise just flush what was held back.
      if (hiddenForMs > RESYNC_AFTER_HIDDEN_MS || dirty) schedule();
    };
    const unsubscribeActivity = subscribeToPageActivity(onPageActivity);

    connect();

    return () => {
      disposed = true;
      unsubscribeActivity();
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      if (watchdogTimer !== undefined) clearInterval(watchdogTimer);
      stopPolling();
      closeSource();
      clearPresence();
    };
  }, [eventId, teamId]);

  return { connection, presence };
}

/** Backwards-compatible form of useLivePlanState: just the connection state. */
export function useLivePlan(
  eventId: string | undefined,
  teamId: string | undefined,
  onChange: (messages: LivePlanMessage[]) => void,
): LiveConnection {
  return useLivePlanState(eventId, teamId, onChange).connection;
}
