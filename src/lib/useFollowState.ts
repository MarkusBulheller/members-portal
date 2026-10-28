import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ApiError } from './api';
import { publicFollowApi } from './api/publicFollow';
import { computeFollowView, type FollowView } from './followState';
import { isPageHidden, subscribeToPageActivity } from './pageActivity';
import type { FollowState } from '../types/follow';

export type FollowConnection = 'connecting' | 'live' | 'reconnecting';
/** 'inactive': unknown / switched-off / regenerated link (404 or a `revoked` message).
 * 'failed': nothing to show yet and the backend can't be reached (retried in the background). */
export type FollowError = 'inactive' | 'failed';

export interface UseFollowState {
  /** Latest plan from the backend; null until the first load (and after the link became inactive). */
  state: FollowState | null;
  /** Structure derived from `state` (phase, current/next stint, statuses). It only changes when
   * the data changes or a stint/race boundary passes, NOT every second — clocks are ticked by the
   * small components that show them (see useFollowNow). */
  view: FollowView | null;
  connection: FollowConnection;
  error: FollowError | null;
  /** serverNow - local clock at fetch time; add it to Date.now() to get the server's time. */
  offsetMs: number;
}

const POLL_INTERVAL_MS = 15_000;
/** Consecutive stream failures before the polling fallback starts. */
const POLL_AFTER_ERRORS = 2;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const RETRY_JITTER_MS = 1_000;
/** Server heartbeats arrive every ~25s; this long with nothing means the stream is dead. */
const STALE_AFTER_MS = 60_000;
const WATCHDOG_INTERVAL_MS = 15_000;
const RESYNC_AFTER_HIDDEN_MS = 30_000;
const REFETCH_DEBOUNCE_MS = 150;
const MAX_TIMEOUT_MS = 2_147_483_647;

interface Snapshot {
  token: string;
  state: FollowState;
  offsetMs: number;
}

/**
 * Data hook shared by the follow page and the OBS overlay: loads the public plan, keeps it fresh
 * through the SSE change stream (`{"changed":true}` -> refetch, `{"revoked":true}` -> inactive),
 * falls back to 15s polling while the stream is down or refused (e.g. 429), and measures the
 * server/viewer clock offset on every fetch. No cookies are sent anywhere.
 *
 * Hidden tabs don't refetch; they catch up once when shown again.
 */
export function useFollowState(token: string | undefined): UseFollowState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failure, setFailure] = useState<{ token: string; kind: FollowError } | null>(null);
  const [conn, setConn] = useState<{ token: string; value: FollowConnection } | null>(null);
  const [boundaryKey, setBoundaryKey] = useState(0);

  useEffect(() => {
    if (!token) return;

    let disposed = false;
    let source: EventSource | null = null;
    let abort: AbortController | null = null;
    let fetchSeq = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setInterval> | undefined;
    let streamFailures = 0;
    let streamDown = false; // stream refused / repeatedly failing -> poll
    let loadFailing = false; // last fetch failed -> poll
    let dirty = false; // a refetch was wanted while the tab was hidden
    let lastActivityAt = Date.now();

    const setConnection = (value: FollowConnection) => setConn({ token, value });

    const stopAll = () => {
      disposed = true;
      abort?.abort();
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      if (pollTimer !== undefined) clearInterval(pollTimer);
      if (watchdogTimer !== undefined) clearInterval(watchdogTimer);
      pollTimer = undefined;
      closeSource();
    };

    const markInactive = () => {
      setFailure({ token, kind: 'inactive' });
      setSnapshot((prev) => (prev && prev.token === token ? null : prev));
      stopAll();
    };

    const load = async () => {
      if (disposed) return;
      if (isPageHidden()) {
        dirty = true;
        return;
      }
      dirty = false;
      const seq = ++fetchSeq;
      abort?.abort();
      const controller = new AbortController();
      abort = controller;
      const sentAt = Date.now();
      try {
        const data = await publicFollowApi.getState(token, controller.signal);
        if (disposed || seq !== fetchSeq) return;
        const receivedAt = Date.now();
        const serverMs = Date.parse(data.serverNow);
        // Half the round trip is how stale serverNow already is when it arrives.
        const offsetMs = Number.isNaN(serverMs) ? 0 : serverMs - Math.round((sentAt + receivedAt) / 2);
        setSnapshot({ token, state: data, offsetMs });
        setFailure((prev) => (prev ? null : prev));
        loadFailing = false;
      } catch (err) {
        if (disposed || seq !== fetchSeq || controller.signal.aborted) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          markInactive();
          return;
        }
        loadFailing = true;
        setFailure({ token, kind: 'failed' });
      }
      syncPolling();
    };

    const scheduleLoad = () => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void load(), REFETCH_DEBOUNCE_MS);
    };

    const syncPolling = () => {
      if (disposed) return;
      const needed = streamDown || loadFailing;
      if (needed && pollTimer === undefined) pollTimer = setInterval(() => void load(), POLL_INTERVAL_MS);
      if (!needed && pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    function closeSource() {
      if (source) {
        source.onopen = null;
        source.onmessage = null;
        source.onerror = null;
        source.close();
      }
      source = null;
    }

    const retryDelay = () =>
      Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(streamFailures, 6)) + Math.random() * RETRY_JITTER_MS;

    const connect = () => {
      retryTimer = undefined;
      if (disposed) return;
      if (typeof EventSource === 'undefined') {
        streamDown = true;
        setConnection('reconnecting');
        syncPolling();
        return;
      }
      // No withCredentials: the link token in the URL is the only credential.
      const es = new EventSource(publicFollowApi.streamUrl(token));
      source = es;
      lastActivityAt = Date.now();
      es.onopen = () => {
        lastActivityAt = Date.now();
        setConnection('live');
        streamDown = false;
        syncPolling();
        if (streamFailures > 0) {
          streamFailures = 0;
          scheduleLoad(); // catch up on anything missed while away
        }
      };
      es.onmessage = (e: MessageEvent) => {
        lastActivityAt = Date.now();
        try {
          const msg = JSON.parse(e.data as string) as { changed?: unknown; revoked?: unknown } | null;
          if (msg && msg.revoked === true) {
            markInactive();
            return;
          }
        } catch {
          // unparseable still means "something happened" - resync below
        }
        scheduleLoad();
      };
      es.addEventListener('heartbeat', () => {
        lastActivityAt = Date.now();
      });
      es.onerror = () => {
        streamFailures += 1;
        setConnection('reconnecting');
        if (streamFailures >= POLL_AFTER_ERRORS) streamDown = true;
        if (es.readyState === EventSource.CLOSED) {
          // The browser gives up on a rejected connection (404 / 429 / proxy error): poll and retry ourselves.
          streamDown = true;
          closeSource();
          retryTimer = setTimeout(connect, retryDelay());
        }
        syncPolling();
      };
    };

    const reconnectStale = () => {
      if (disposed) return;
      streamFailures = Math.max(streamFailures, 1);
      setConnection('reconnecting');
      closeSource();
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, Math.random() * RETRY_JITTER_MS);
    };
    const isStale = () => source !== null && Date.now() - lastActivityAt > STALE_AFTER_MS;

    watchdogTimer = setInterval(() => {
      if (!isPageHidden() && isStale()) reconnectStale();
    }, WATCHDOG_INTERVAL_MS);

    const unsubscribeActivity = subscribeToPageActivity(({ hiddenForMs }) => {
      if (isStale()) reconnectStale();
      if (dirty || hiddenForMs > RESYNC_AFTER_HIDDEN_MS) void load();
    });

    void load();
    connect();

    return () => {
      unsubscribeActivity();
      stopAll();
    };
  }, [token]);

  const current = snapshot && snapshot.token === token ? snapshot : null;
  const failureKind = failure && failure.token === token ? failure.kind : null;
  const inactive = !token || failureKind === 'inactive';
  const state = inactive ? null : (current?.state ?? null);
  const offsetMs = current?.offsetMs ?? 0;
  const error: FollowError | null = inactive ? 'inactive' : failureKind === 'failed' && !state ? 'failed' : null;
  const connection: FollowConnection = conn && conn.token === token ? conn.value : 'connecting';

  // Structure re-evaluates when the data changes or a stint/race boundary passes, not every second.
  const view = useMemo(
    () => (state ? computeFollowView(state, Date.now() + offsetMs) : null),
    // boundaryKey is the "a boundary passed / the tab came back" trigger, not a value used inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, offsetMs, boundaryKey],
  );

  useEffect(() => {
    if (!view || view.nextBoundaryMs === null) return;
    const wait = view.nextBoundaryMs - (Date.now() + offsetMs) + 30;
    const timer = setTimeout(() => setBoundaryKey((k) => k + 1), Math.min(MAX_TIMEOUT_MS, Math.max(50, wait)));
    return () => clearTimeout(timer);
  }, [view, offsetMs]);

  // Background tabs throttle timers: re-evaluate the moment the viewer is back.
  useEffect(() => subscribeToPageActivity(() => setBoundaryKey((k) => k + 1)), []);

  return { state, view, connection, error, offsetMs };
}

// ---- One shared 1 Hz tick for every clock on the page ---------------------------------------------

let tickCount = 0;
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | undefined;
let tickActivityUnsub: (() => void) | undefined;

function emitTick() {
  tickCount += 1;
  for (const listener of [...tickListeners]) listener();
}

function subscribeToTick(listener: () => void): () => void {
  tickListeners.add(listener);
  if (tickTimer === undefined) {
    tickTimer = setInterval(() => {
      if (!isPageHidden()) emitTick(); // paused while the tab is hidden
    }, 1000);
    tickActivityUnsub = subscribeToPageActivity(emitTick); // refresh immediately on return
  }
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer !== undefined) {
      clearInterval(tickTimer);
      tickTimer = undefined;
      tickActivityUnsub?.();
      tickActivityUnsub = undefined;
    }
  };
}

/** The server-corrected "now" (ms), refreshed once a second. Only the component that calls this
 * re-renders on each tick, so keep the call inside small clock components. */
export function useFollowNow(offsetMs: number): number {
  useSyncExternalStore(
    subscribeToTick,
    () => tickCount,
    () => 0,
  );
  return Date.now() + offsetMs;
}
