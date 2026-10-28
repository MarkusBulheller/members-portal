import type { FollowState } from '../types/follow';
import { formatClock } from './eventFormatting';

/**
 * Pure helpers behind the public "Follow the race" page and the OBS overlay.
 *
 * Everything here takes an explicit `nowMs` that the caller has ALREADY corrected for the
 * viewer's clock error (`offsetMs = Date.parse(serverNow) - Date.now()` captured at fetch time,
 * then `nowMs = Date.now() + offsetMs`). Nothing in this file reads the clock.
 *
 * Edge cases handled (all covered by the notes next to the code):
 *  - no race start (or an unparseable one)  -> phase 'unscheduled', no clocks, only `started` flags drive "current";
 *  - a stint with a null start/end           -> never matched by time; a missing end falls back to the next stint's
 *                                                start (or the race end for the last one);
 *  - a null driver                           -> "TBD" (`assigned: false`);
 *  - stints listed out of order              -> sorted by number;
 *  - a stint that runs over its planned end  -> still "driving" until the next stint is started, with a grace period.
 */

/** How long after a changeover was planned we keep showing the old driver while the crew has not
 * yet pressed "start" on the next stint, before showing "pit stop / driver change" instead. */
export const CHANGEOVER_GRACE_MS = 10 * 60_000;

export type FollowPhase = 'before' | 'live' | 'finished' | 'unscheduled';
export type FollowStintStatus = 'done' | 'live' | 'next' | 'upcoming';

export interface FollowStintView {
  number: number;
  /** Display name; "TBD" when nobody is assigned yet. */
  driverName: string;
  assigned: boolean;
  startMs: number | null;
  /** Planned end; when the backend sent none, the next stint's start (or the race end for the last one). */
  endMs: number | null;
  started: boolean;
  status: FollowStintStatus;
}

export interface ClockReadout {
  phase: FollowPhase;
  /** 'before' only: time to the green flag (>= 0). */
  untilStartMs: number | null;
  /** 'live' / 'finished': time since the green flag. */
  elapsedMs: number | null;
  /** 'live': time to the chequered flag; 0 once finished. */
  remainingMs: number | null;
  /** 0..1 through the race ('live' and 'finished' only). */
  progress: number | null;
}

export interface StintTiming {
  /** 0..1 through the current stint's planned window; 1 once it overran. null without a current stint or its times. */
  progress: number | null;
  /** Time to the planned end of the current stint (>= 0). */
  untilEndMs: number | null;
  /** The planned end has passed but the next stint has not been started yet. */
  overrun: boolean;
  /** Time to the next stint's planned start (>= 0; before the race: to the green flag). */
  untilNextMs: number | null;
  /** Time to the next driver change: the sooner of the current stint's end and the next stint's start. */
  untilChangeMs: number | null;
}

export interface FollowView {
  phase: FollowPhase;
  /** The `nowMs` this view was computed for. */
  evaluatedAtMs: number;
  raceStartMs: number | null;
  raceEndMs: number | null;
  stints: FollowStintView[];
  /** The driver on track. null before the start, after the finish, and during a changeover. */
  current: FollowStintView | null;
  /** The stint after the current one (or, with none current, the one coming up next). */
  next: FollowStintView | null;
  /** Live, no stint is on track and the next one is due: "pit stop / driver change". */
  changeover: boolean;
  /** Stints in the plan ("n of N"); never less than the list we were given. */
  stintCount: number;
  /** Clock readouts at `evaluatedAtMs`; re-evaluate with clockReadout()/stintTiming() for a later time. */
  clock: ClockReadout;
  timing: StintTiming;
  /** The next instant (> evaluatedAtMs) at which the structure above (phase, current, next, statuses) can
   * change on its own. Re-run computeFollowView then. null = nothing scheduled. */
  nextBoundaryMs: number | null;
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeFollowView(state: FollowState, nowMs: number): FollowView {
  const raceStartMs = parseMs(state.race.startsAt);
  const lengthMs = Number.isFinite(state.race.lengthMinutes) ? Math.max(0, state.race.lengthMinutes) * 60_000 : 0;
  const raceEndMs = raceStartMs === null ? null : (parseMs(state.race.endsAt) ?? raceStartMs + lengthMs);

  const phase: FollowPhase =
    raceStartMs === null || raceEndMs === null
      ? 'unscheduled'
      : nowMs < raceStartMs
        ? 'before'
        : nowMs < raceEndMs
          ? 'live'
          : 'finished';

  // ---- Stints, in plan order, with an effective end for each ---------------------------------
  const sorted = [...state.stints].sort((a, b) => a.number - b.number);
  const rows = sorted.map((s, i) => {
    const startMs = parseMs(s.startsAt);
    const endMs = parseMs(s.endsAt) ?? parseMs(sorted[i + 1]?.startsAt) ?? (i === sorted.length - 1 ? raceEndMs : null);
    const name = s.driverName?.trim() ?? '';
    return {
      number: s.number,
      driverName: name || 'TBD',
      assigned: name !== '',
      startMs,
      endMs,
      started: s.started === true,
    };
  });

  const inWindow = (r: { startMs: number | null; endMs: number | null }) =>
    r.startMs !== null && r.endMs !== null && nowMs >= r.startMs && nowMs < r.endMs;

  let lastStartedIdx = -1;
  rows.forEach((r, i) => {
    if (r.started) lastStartedIdx = i;
  });
  let windowIdx = -1; // the last stint whose planned window contains now (the latest wins on overlaps)
  rows.forEach((r, i) => {
    if (inWindow(r)) windowIdx = i;
  });

  // ---- Who is on track? -----------------------------------------------------------------------
  // The crew's "started" flag beats the plan: a stint that was started stays "current" past its
  // planned end until the NEXT stint is started - but only for CHANGEOVER_GRACE_MS after that next
  // stint was due to begin; after that we show "pit stop / driver change" instead. If the crew
  // skipped pressing start for a whole stint, the plan's own window takes over again.
  let currentIdx = -1;
  let changeover = false;
  if (phase === 'live' || phase === 'unscheduled') {
    if (lastStartedIdx >= 0) {
      const last = rows[lastStartedIdx];
      const following = rows[lastStartedIdx + 1];
      if (!following || last.endMs === null || nowMs < last.endMs) {
        currentIdx = lastStartedIdx; // still inside its window, or the final stint (runs to the flag)
      } else if (nowMs < (following.startMs ?? last.endMs) + CHANGEOVER_GRACE_MS) {
        currentIdx = lastStartedIdx; // overrunning: the next driver has not been started yet
      } else if (windowIdx > lastStartedIdx + 1) {
        currentIdx = windowIdx; // the plan has moved on by more than one stint
      } else {
        changeover = true;
      }
    } else if (windowIdx >= 0) {
      currentIdx = windowIdx;
    } else {
      // Nobody started and no window matches: a gap between two planned stints is a changeover.
      const doneBefore = rows.some((r) => r.endMs !== null && r.endMs <= nowMs);
      const upcoming = rows.some((r) => r.startMs !== null && r.startMs > nowMs);
      changeover = phase === 'live' && doneBefore && upcoming;
    }
  }

  // ---- Who is next? ---------------------------------------------------------------------------
  const firstUpcomingIdx = rows.findIndex((r) => r.startMs !== null && r.startMs > nowMs);
  let nextIdx = -1;
  if (phase === 'finished') nextIdx = -1;
  else if (currentIdx >= 0) nextIdx = currentIdx + 1 < rows.length ? currentIdx + 1 : -1;
  else if (changeover) nextIdx = lastStartedIdx >= 0 ? lastStartedIdx + 1 : firstUpcomingIdx;
  else if (phase === 'before' || phase === 'unscheduled') nextIdx = rows.length > 0 ? 0 : -1;
  else if (firstUpcomingIdx >= 0) nextIdx = firstUpcomingIdx;
  else nextIdx = rows.length > 0 && rows.every((r) => r.startMs === null) ? 0 : -1; // untimed plan: just the first stint

  // ---- Per-stint status -----------------------------------------------------------------------
  let doneUpTo: number;
  if (phase === 'finished') doneUpTo = rows.length;
  else if (currentIdx >= 0) doneUpTo = currentIdx;
  else if (changeover) doneUpTo = lastStartedIdx >= 0 ? lastStartedIdx + 1 : Math.max(nextIdx, 0);
  else if (phase === 'live') doneUpTo = rows.reduce((n, r, i) => (r.endMs !== null && r.endMs <= nowMs ? i + 1 : n), 0);
  else doneUpTo = 0;

  const stints: FollowStintView[] = rows.map((r, i) => ({
    ...r,
    status: i < doneUpTo ? 'done' : i === currentIdx ? 'live' : i === nextIdx ? 'next' : 'upcoming',
  }));

  // ---- Next structural change -----------------------------------------------------------------
  const boundaries: number[] = [];
  const consider = (t: number | null) => {
    if (t !== null && t > nowMs) boundaries.push(t);
  };
  consider(raceStartMs);
  consider(raceEndMs);
  for (const r of rows) {
    for (const t of [r.startMs, r.endMs]) {
      consider(t);
      if (t !== null) consider(t + CHANGEOVER_GRACE_MS);
    }
  }
  const nextBoundaryMs = boundaries.length > 0 ? Math.min(...boundaries) : null;

  const partial = {
    phase,
    raceStartMs,
    raceEndMs,
    current: currentIdx >= 0 ? stints[currentIdx] : null,
    next: nextIdx >= 0 ? stints[nextIdx] : null,
  };

  return {
    phase,
    evaluatedAtMs: nowMs,
    raceStartMs,
    raceEndMs,
    stints,
    current: partial.current,
    next: partial.next,
    changeover,
    stintCount: Math.max(state.stintCount, stints.length),
    clock: clockReadout(partial, nowMs),
    timing: stintTiming(partial, nowMs),
    nextBoundaryMs,
  };
}

/** Race clock numbers at `nowMs` for a view's phase. Cheap — call it every second. */
export function clockReadout(
  view: Pick<FollowView, 'phase' | 'raceStartMs' | 'raceEndMs'>,
  nowMs: number,
): ClockReadout {
  const { phase, raceStartMs, raceEndMs } = view;
  const none: ClockReadout = { phase, untilStartMs: null, elapsedMs: null, remainingMs: null, progress: null };
  if (phase === 'unscheduled' || raceStartMs === null || raceEndMs === null) return { ...none, phase: 'unscheduled' };
  const total = Math.max(raceEndMs - raceStartMs, 1);
  if (phase === 'before') return { ...none, untilStartMs: Math.max(0, raceStartMs - nowMs) };
  if (phase === 'finished') {
    return { ...none, elapsedMs: Math.max(0, raceEndMs - raceStartMs), remainingMs: 0, progress: 1 };
  }
  return {
    ...none,
    elapsedMs: clamp(nowMs - raceStartMs, 0, total),
    remainingMs: Math.max(0, raceEndMs - nowMs),
    progress: clamp((nowMs - raceStartMs) / total, 0, 1),
  };
}

/** Timing of the current stint and of the next change at `nowMs`. Cheap — call it every second. */
export function stintTiming(
  view: Pick<FollowView, 'phase' | 'raceStartMs' | 'current' | 'next'>,
  nowMs: number,
): StintTiming {
  const { current, next } = view;
  let progress: number | null = null;
  let untilEndMs: number | null = null;
  let overrun = false;
  if (current && current.endMs !== null) {
    untilEndMs = Math.max(0, current.endMs - nowMs);
    overrun = nowMs >= current.endMs;
    if (current.startMs !== null) {
      progress = clamp((nowMs - current.startMs) / Math.max(current.endMs - current.startMs, 1), 0, 1);
    }
  }
  // Before the race, the first stint "starts" at the green flag even if its own time is missing.
  const nextStartMs = next ? (next.startMs ?? (view.phase === 'before' ? view.raceStartMs : null)) : null;
  const untilNextMs = nextStartMs === null ? null : Math.max(0, nextStartMs - nowMs);
  const candidates = [overrun ? null : untilEndMs, untilNextMs].filter((v): v is number => v !== null);
  return {
    progress,
    untilEndMs,
    overrun,
    untilNextMs,
    untilChangeMs: candidates.length > 0 ? Math.min(...candidates) : null,
  };
}

// ---- Formatting ----------------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    totalHours: Math.floor(total / 3600),
  };
}

/** "HH:MM:SS" (hours keep growing past 99). */
export function formatHms(ms: number): string {
  const p = split(ms);
  return `${pad2(p.totalHours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
}

/** Green-flag countdown: "2d 03:14:05" from a day out, "03:14:05" inside the last day. */
export function formatCountdownLong(ms: number): string {
  const p = split(ms);
  return p.days > 0 ? `${p.days}d ${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}` : `${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
}

/** Compact "in ..." text: "24:10" under an hour, "1:24:10" under a day, "2d 03h" beyond. */
export function formatUntil(ms: number): string {
  const p = split(ms);
  if (p.days > 0) return `${p.days}d ${pad2(p.hours)}h`;
  if (p.hours > 0) return `${p.hours}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
  return `${pad2(p.minutes)}:${pad2(p.seconds)}`;
}

/** Local 24-hour "HH:MM". */
export function formatLocalTime(ms: number): string {
  return formatClock(new Date(ms));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** "Sat 14 Nov · 18:00" in the viewer's zone. */
export function formatLocalDayTime(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${formatClock(d)}`;
}

/** A stint's window as local times: "18:00 – 19:10". With `withDay` (races that span midnight) the
 * start gets its weekday ("Sat 23:00 – Sun 00:10"; the end only if it falls on another day). A
 * missing time is "–". */
export function formatStintRange(startMs: number | null, endMs: number | null, withDay: boolean): string {
  const part = (ms: number | null, showDay: boolean) =>
    ms === null ? '–' : showDay ? `${WEEKDAYS[new Date(ms).getDay()]} ${formatLocalTime(ms)}` : formatLocalTime(ms);
  const endShowsDay = withDay && startMs !== null && endMs !== null && !sameLocalDay(startMs, endMs);
  return `${part(startMs, withDay)} – ${part(endMs, endShowsDay)}`;
}

/** Whether the plan crosses a local midnight (so times should carry weekdays). */
export function spansLocalDays(view: Pick<FollowView, 'stints' | 'raceStartMs' | 'raceEndMs'>): boolean {
  const times = [view.raceStartMs, view.raceEndMs, ...view.stints.flatMap((s) => [s.startMs, s.endMs])].filter(
    (t): t is number => t !== null,
  );
  if (times.length < 2) return false;
  return !sameLocalDay(Math.min(...times), Math.max(...times));
}

let zoneFormat: Intl.DateTimeFormat | null = null;

/** The viewer's time-zone abbreviation at `ms` ("CEST", "GMT+2"), or '' if unavailable. */
export function timeZoneAbbreviation(ms: number): string {
  try {
    zoneFormat ??= new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' });
    return zoneFormat.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}
