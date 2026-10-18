import type { NavIconName } from '../components/NavIcon';
import { carsApi } from './api/cars';
import { driversApi } from './api/drivers';
import { eventsApi } from './api/events';
import { iracingSeriesApi } from './api/iracingSeries';
import { tracksApi } from './api/tracks';

export type SearchKind = 'event' | 'driver' | 'series' | 'car' | 'track';

export interface SearchEntry {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  to: string;
  /** Lower-cased title + subtitle, precomputed once for matching. */
  haystack: string;
  /** Sort tie-breaker inside a group (e.g. active series before archived, upcoming events first). */
  weight: number;
}

/** Group order in the palette, with the heading and nav icon each one uses. */
export const SEARCH_GROUPS: { kind: SearchKind; label: string; icon: NavIconName }[] = [
  { kind: 'event', label: 'Events', icon: 'events' },
  { kind: 'driver', label: 'Drivers', icon: 'drivers' },
  { kind: 'series', label: 'Series', icon: 'series' },
  { kind: 'car', label: 'Cars', icon: 'cars' },
  { kind: 'track', label: 'Tracks', icon: 'tracks' },
];

export const MAX_RESULTS_PER_GROUP = 5;

function entry(kind: SearchKind, id: string, title: string, subtitle: string, to: string, weight = 0): SearchEntry {
  return { kind, id, title, subtitle, to, haystack: `${title} ${subtitle}`.toLowerCase(), weight };
}

// One formatter for every event row (constructing one per toLocaleDateString call is slow).
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** Fetches the five list endpoints and flattens them into one searchable list. Each source fails
 * independently — if e.g. the series list is down, everything else is still searchable. */
async function buildIndex(): Promise<{ entries: SearchEntry[]; complete: boolean }> {
  const [events, drivers, series, cars, tracks] = await Promise.allSettled([
    eventsApi.list(),
    driversApi.list(),
    iracingSeriesApi.list(),
    carsApi.list(),
    tracksApi.list(),
  ]);
  const entries: SearchEntry[] = [];
  const complete = [events, drivers, series, cars, tracks].every((r) => r.status === 'fulfilled');

  if (events.status === 'fulfilled') {
    const now = Date.now();
    for (const e of events.value) {
      // Upcoming events first, then the most recent past ones.
      const startsAt = new Date(e.startsAt).getTime();
      const weight = startsAt >= now ? -1e15 + startsAt : now - startsAt;
      const draft = e.status === 'DRAFT' ? ' · Draft' : '';
      entries.push(entry('event', e.id, e.title, `${e.track?.name ?? ''} · ${formatDate(e.startsAt)}${draft}`, `/events/${e.id}`, weight));
    }
  }
  if (drivers.status === 'fulfilled') {
    for (const d of drivers.value) {
      const sub = [d.iracingName && d.iracingName !== d.displayName ? d.iracingName : null, d.country].filter(Boolean).join(' · ');
      entries.push(entry('driver', d.id, d.displayName, sub, `/drivers/${d.id}`));
    }
  }
  if (series.status === 'fulfilled') {
    for (const s of series.value) {
      const sub = [s.seasonName, s.category, s.active ? null : 'Archived'].filter(Boolean).join(' · ');
      entries.push(entry('series', String(s.seasonId), s.seriesName, sub, `/series/${s.seasonId}`, s.active ? 0 : 1));
    }
  }
  if (cars.status === 'fulfilled') {
    for (const c of cars.value) entries.push(entry('car', c.id, c.name, c.carClass, `/cars/${c.id}`));
  }
  if (tracks.status === 'fulfilled') {
    for (const t of tracks.value) {
      entries.push(entry('track', t.id, t.name, [t.location, t.category].filter(Boolean).join(' · '), `/tracks/${t.id}`));
    }
  }
  return { entries, complete };
}

const CACHE_TTL_MS = 5 * 60_000;
/** A build where some source failed is only reused briefly, so a blip doesn't leave e.g. every
 * series unsearchable for five minutes. */
const PARTIAL_CACHE_TTL_MS = 20_000;
let cache: { at: number; ttl: number; promise: Promise<SearchEntry[]> } | null = null;

/** Lazy, in-memory cache: the first palette open fetches, later opens reuse the result and quietly
 * refresh once it's older than five minutes (20 seconds if a source failed). Pass `force` to
 * ignore the cache. */
export function loadSearchIndex(force = false): Promise<SearchEntry[]> {
  if (!force && cache && Date.now() - cache.at < cache.ttl) return cache.promise;
  const build = buildIndex();
  const promise = build.then((r) => r.entries);
  // While the build is in flight, concurrent callers share it; the real TTL is set when it settles.
  const mine = { at: Date.now(), ttl: Infinity, promise };
  cache = mine;
  build.then(
    (r) => {
      mine.at = Date.now();
      mine.ttl = r.complete ? CACHE_TTL_MS : PARTIAL_CACHE_TTL_MS;
    },
    () => {
      // A wholesale failure shouldn't be cached.
      if (cache === mine) cache = null;
    },
  );
  return promise;
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Pre-builds the index when the browser is first idle (call after login), so the first palette
 * open is instant. Returns a cancel function. Skipped when the user has asked to save data. */
export function warmSearchIndex(): () => void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return () => undefined;
  const w = window as IdleWindow;
  const run = () => {
    if (!cache) loadSearchIndex().catch(() => undefined);
  };
  if (typeof w.requestIdleCallback === 'function') {
    const handle = w.requestIdleCallback(run, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(run, 2000);
  return () => window.clearTimeout(handle);
}

/** The cached index if there is one (even a stale one), for instant first paint on re-open. */
export function peekSearchIndex(): Promise<SearchEntry[]> | null {
  return cache?.promise ?? null;
}

/** Drops the cache, e.g. on logout so the next user doesn't see the previous user's data. */
export function clearSearchIndex() {
  cache = null;
}

function score(entry: SearchEntry, tokens: string[], phrase: string): number {
  const title = entry.title.toLowerCase();
  let s = 0;
  if (title === phrase) s += 100;
  else if (title.startsWith(phrase)) s += 60;
  else if (title.includes(phrase)) s += 40;
  for (const t of tokens) {
    if (title.startsWith(t)) s += 8;
    else if (title.split(/[\s\-–·/()]+/).some((w) => w.startsWith(t))) s += 5;
    else if (title.includes(t)) s += 2;
  }
  return s;
}

/** Every whitespace-separated token must appear in the title or subtitle (any order). Returns the
 * matches ordered best-first within each kind; callers cap each group. */
export function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const phrase = query.trim().toLowerCase();
  if (!phrase) return [];
  const tokens = phrase.split(/\s+/);
  return entries
    .filter((e) => tokens.every((t) => e.haystack.includes(t)))
    .map((e) => ({ e, s: score(e, tokens, phrase) }))
    .sort((a, b) => b.s - a.s || a.e.weight - b.e.weight || a.e.title.localeCompare(b.e.title))
    .map(({ e }) => e);
}

/** Search results arranged for display: fixed group order, capped per group. */
export function groupResults(
  entries: SearchEntry[],
  query: string,
): { kind: SearchKind; label: string; icon: NavIconName; items: SearchEntry[] }[] {
  const matches = searchEntries(entries, query);
  return SEARCH_GROUPS.map((g) => ({
    ...g,
    items: matches.filter((m) => m.kind === g.kind).slice(0, MAX_RESULTS_PER_GROUP),
  })).filter((g) => g.items.length > 0);
}
