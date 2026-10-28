import { lazy, memo, Suspense, useEffect, useMemo, useState, type SelectHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import DashboardReadiness from '../../components/DashboardReadiness';
import NavIcon from '../../components/NavIcon';
import ChunkErrorBoundary from '../../components/ChunkErrorBoundary';
import StatLeaderboard, { type LeaderboardItem } from '../../components/StatLeaderboard';
import WelcomeChecklist from '../../components/WelcomeChecklist';
import { useAuth } from '../../context/AuthContext';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { driversApi } from '../../lib/api/drivers';
import { eventsApi } from '../../lib/api/events';
import { statsApi } from '../../lib/api/stats';
import { teamHighlightsApi } from '../../lib/api/teamHighlights';
import { eventsWaitingOnViewer, isSignupOpen } from '../../lib/eventSignups';
import { useMediaQuery } from '../../lib/useMediaQuery';
import type { RaceEvent, UpcomingStintAssignment, UpcomingStintSlot } from '../../types/event';
import { formatRaceLength } from '../../types/raceLength';
import type { DashboardFilters, DashboardStats } from '../../types/stats';
import type { TeamHighlight } from '../../types/teamHighlight';

// Recharts is big; the scatter chart is its own lazy chunk so the dashboard paints without it.
const ResultsScatterChart = lazy(() => import('../../components/ResultsScatterChart'));

const EMPTY_FILTERS: DashboardFilters = { year: null, trackId: null, carId: null, series: null, raceLength: null };

/** Filter dropdowns: a quiet panel-coloured control with the design's small cut corner. The native
 * arrow is replaced by the board's 14px chevron, drawn by FilterSelect. */
const SELECT =
  'cut-xs min-h-[38px] w-full min-w-0 appearance-none truncate border-0 bg-ds-panel pl-3 pr-8 text-[13px] font-semibold text-ds-ink-soft hover:bg-ds-control-hover [&>option]:bg-ds-panel [&>option]:text-ds-ink';

function FilterSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex min-w-0 max-w-full sm:max-w-[200px]">
      <select {...props} className={SELECT} />
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-soft"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

// Dates and times follow the boards ("Thu 15 Oct", "Sat 24 Oct, 13:00", 24-hour clock) instead of
// the browser's locale, so build them from fixed names.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Thu 15 Oct" */
function formatDay(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function formatAssignmentTime(startsAt: string | null): string {
  if (!startsAt) return 'Time TBD';
  const date = new Date(startsAt);
  return `${formatDay(date)}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Days + hours once it's more than a day out (a seconds ticker is noise a week before a race),
 * hours + minutes on race day, minutes + seconds for the final hour. Returned as value/unit
 * pairs so the units can be set smaller and muted, as in the design. */
function countdownParts(targetMs: number, nowMs: number): { value: string; unit: string }[] {
  const totalSeconds = Math.max(0, Math.round((targetMs - nowMs) / 1000));
  const d = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return [{ value: String(d), unit: 'd' }, { value: pad(h), unit: 'h' }];
  if (h > 0) return [{ value: String(h), unit: 'h' }, { value: pad(m), unit: 'm' }];
  if (m > 0) return [{ value: String(m), unit: 'm' }, { value: pad(s), unit: 's' }];
  return [{ value: String(s), unit: 's' }];
}

interface EventChip {
  label: string;
  className: string;
}

/** The status tag on a Next up row. For open events it is personal when the backend tells us about
 * the viewer (a "Sign up" call to action, or "Signed up"); without `viewer` it falls back to the
 * generic "Signups open". Drafts only ever reach admins. */
function eventChip(event: RaceEvent): EventChip | null {
  switch (event.status) {
    case 'DRAFT':
      return { label: 'Draft', className: 'chip-draft' };
    case 'PUBLISHED':
      if (!event.viewer) return { label: 'Signups open', className: 'chip-accent' };
      if (event.viewer.signedUp) return { label: 'Signed up', className: 'chip-accent' };
      return isSignupOpen(event)
        ? { label: 'Sign up', className: 'chip-solid' }
        : { label: 'Signups closed', className: '' };
    case 'SIGNUPS_CLOSED':
      return { label: 'Team building', className: '' };
    default:
      return null;
  }
}

/** Podium medal fills — identical in both themes, dark text on top (per the design). */
const MEDAL_BG = ['bg-[#e8c34a]', 'bg-[#c7cbd1]', 'bg-[#cd8a4e]'];

/** The accent "blade" on the hero's right edge: two diagonal stripes, purely decorative. The
 * mobile variant is narrower with a steeper angle, as in the Mobile board. */
function Blade({ color }: { color: string }) {
  return (
    <>
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 top-0 w-[50px] sm:hidden"
          style={{
            background: `linear-gradient(100deg, transparent 0 30%, ${color} 30% 44%, transparent 44% 56%, ${color} 56% 100%)`,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 top-0 hidden w-[170px] sm:block"
          style={{
            background: `linear-gradient(110deg, transparent 0 28%, ${color} 28% 40%, transparent 40% 50%, ${color} 50% 100%)`,
          }}
        />
    </>
  );
}

function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "You drive N of M": one skewed segment per stint of the crew's saved plan (the viewer's own
 * stints in the accent colour), with a few clock times under it on wider screens. Renders nothing
 * when the team has no stint plan yet. */
function StintStrip({ stints, live }: { stints: UpcomingStintSlot[]; live: boolean }) {
  const total = stints.length;
  if (total === 0) return null;
  const mineNumbers = stints.flatMap((s, i) => (s.isMine ? [i + 1] : []));
  const mine = mineNumbers.length;
  const muted = live ? 'text-on-accent/80' : 'text-ds-muted';

  // Times at the start of (up to) four evenly spaced stints, plus the end of the last one.
  const tickIndexes = Array.from(new Set([0, 1, 2, 3].map((k) => Math.min(total - 1, Math.round((k * total) / 4)))));
  const ticks = [
    ...tickIndexes.map((i) => ({ at: i / total, label: formatClock(stints[i].startsAt) })),
    { at: 1, label: formatClock(stints[total - 1].endsAt) },
  ];

  const summary =
    mine === 0
      ? `Stint plan with ${total} stints, you do not drive any`
      : `Stint plan with ${total} stint${total === 1 ? '' : 's'}, you drive stint${mine === 1 ? '' : 's'} ${mineNumbers.join(', ')}`;

  return (
    <div className="relative flex flex-col gap-1.5 sm:gap-2">
      <div className={`flex flex-wrap justify-between gap-2 text-xs sm:text-[13px] ${muted}`}>
        <span>Stint plan</span>
        <span>
          You drive{' '}
          <strong className="font-bold text-current">
            {mine} of {total}
          </strong>
        </span>
      </div>
      <div
        role="img"
        aria-label={summary}
        className={`flex h-8 px-[5px] sm:h-8 sm:gap-1 sm:px-1.5 ${total > 16 ? 'gap-[2px]' : 'gap-[3px]'}`}
      >
        {stints.map((slot, i) => {
          const tone = slot.isMine
            ? live
              ? 'bg-on-accent text-w2w-red'
              : 'bg-w2w-red text-on-accent'
            : live
              ? 'bg-black/25 text-on-accent/80'
              : 'bg-ds-control text-ds-ghost';
          return (
            <span
              key={`${slot.startsAt}-${i}`}
              title={`Stint ${i + 1} · ${slot.driverName ?? 'Unassigned'}${slot.isMine ? ' (you)' : ''}`}
              className={`flex min-w-0 flex-1 -skew-x-16 items-center justify-center overflow-hidden text-[10px] font-extrabold sm:text-xs ${tone}`}
            >
              {/* Initials don't fit on a packed phone strip: hidden there past 10 stints. */}
              <span className={`skew-x-16 ${total > 10 ? 'max-sm:hidden' : ''}`}>
                {initials(slot.driverName)}
              </span>
            </span>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className={`relative mx-1.5 hidden h-4 text-xs font-semibold tabular-nums sm:block ${live ? 'text-on-accent/70' : 'text-ds-dim'}`}
      >
        {ticks.map((tick, i) => (
          <span
            key={`${tick.at}-${i}`}
            className={`absolute top-0 whitespace-nowrap ${i === 0 ? '' : tick.at === 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${tick.at * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Current time for a countdown, ticking only while it matters: every 30s normally (the display
 * is days/hours/minutes then), every 1s inside the last hour, not at all once the target has
 * passed or while the tab is hidden (it re-reads on becoming visible/focused). Lives in the
 * countdown component, so a tick never re-renders the rest of the dashboard. */
function useNow(targetMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const clear = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clear();
      if (document.hidden) return;
      const remaining = targetMs - Date.now();
      if (remaining <= 0) return;
      timer = window.setTimeout(tick, remaining <= 3_600_000 ? 1_000 : 30_000);
    };
    function tick() {
      setNowMs(Date.now());
      schedule();
    }
    const refresh = () => {
      setNowMs(Date.now());
      schedule();
    };
    const onVisibilityChange = () => {
      if (document.hidden) clear();
      else refresh();
    };
    refresh();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', refresh);
    return () => {
      clear();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', refresh);
    };
  }, [targetMs]);
  return nowMs;
}

/** The big "2d 04h" number. The only part of the dashboard that re-renders on a clock tick. */
function CountdownValue({ targetMs, muted }: { targetMs: number; muted: string }) {
  const nowMs = useNow(targetMs);
  return (
    <span className="num text-[28px] leading-none sm:text-[44px]">
      {countdownParts(targetMs, nowMs).map((part, i) => (
        <span key={part.unit}>
          {i > 0 && ' '}
          {part.value}
          <span className={`text-[17px] sm:text-2xl ${muted}`}>{part.unit}</span>
        </span>
      ))}
    </span>
  );
}

function StintCard({ assignment }: { assignment: UpcomingStintAssignment }) {
  const live = assignment.isLive;
  const titleId = `stint-title-${assignment.teamId}`;
  const muted = live ? 'text-on-accent/80' : 'text-ds-muted';
  return (
    <section
      aria-labelledby={titleId}
      className={`cut-lg relative flex flex-col gap-5 py-6 pl-5 pr-14 sm:gap-[22px] sm:py-[26px] sm:pl-[30px] sm:pr-[200px] ${
        live ? 'bg-w2w-red text-on-accent' : 'bg-ds-panel text-ds-ink'
      }`}
    >
      <Blade color={live ? 'var(--color-w2w-red-dark)' : 'var(--color-w2w-red)'} />

      <div className="relative flex flex-wrap items-end justify-between gap-4 sm:gap-5">
        <div className="flex min-w-0 flex-col gap-2">
          <span
            className={`slant flex items-center gap-2 self-start whitespace-nowrap px-3 py-[3px] text-[10px] font-extrabold uppercase sm:px-3.5 sm:text-[11px] ${
              live ? 'bg-on-accent text-w2w-red' : 'bg-w2w-red text-on-accent'
            }`}
          >
            {live && <span className="h-1.5 w-1.5 animate-pulse bg-w2w-red" aria-hidden="true" />}
            {live ? "You're racing now" : "You’re on the entry list"}
          </span>
          <h2 id={titleId} className="m-0 text-[34px] font-extrabold leading-none sm:text-[46px]">
            {assignment.eventTitle}
          </h2>
          <span className={`text-[13px] sm:text-sm ${muted}`}>
            {[
              assignment.teamName,
              assignment.trackName,
              formatAssignmentTime(assignment.raceStartsAt ?? assignment.timeslotStartsAt),
              formatRaceLength(assignment.raceLengthMinutes),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {assignment.nextStintStartsAt && (
          <div
            className={`flex w-full flex-row-reverse items-baseline justify-between gap-3 px-3.5 py-3 sm:w-auto sm:flex-col sm:items-start sm:justify-start sm:gap-0 sm:bg-transparent sm:p-0 cut-sm sm:[clip-path:none] ${
              live ? 'bg-black/20' : 'bg-ds-field'
            }`}
          >
            <CountdownValue targetMs={new Date(assignment.nextStintStartsAt).getTime()} muted={muted} />
            <span className={`text-[13px] ${muted} max-sm:font-semibold`}>
              <span className="sm:hidden">First stint in</span>
              <span className="max-sm:hidden">until your first stint</span>
            </span>
          </div>
        )}
      </div>

      {assignment.stints && assignment.stints.length > 0 && <StintStrip stints={assignment.stints} live={live} />}

      <div className="relative flex flex-wrap gap-2.5">
        <Link
          to={`/events/${assignment.eventId}/teams/${assignment.teamId}/plan`}
          className={`btn-primary max-sm:min-h-12 max-sm:w-full max-sm:text-[15px] ${live ? 'bg-on-accent text-w2w-red' : ''}`}
        >
          Open team plan
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="square"
            aria-hidden="true"
          >
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </Link>
        <Link to={`/events/${assignment.eventId}`} className="btn-secondary max-sm:hidden">
          Event details
        </Link>
      </div>
    </section>
  );
}

/** Highlights are free text; pull a "P1"/"P6" finishing position out of the title or period if an
 * admin wrote one, so it can be shown as the position badge. */
function highlightPosition(period: string, title: string): number | null {
  const match = /\bP(\d{1,3})\b/.exec(`${title} ${period}`);
  return match ? Number(match[1]) : null;
}

const formatCount = (v: number) => String(v);
const formatIncidents = (v: number) => v.toFixed(3);

/** Chart card + the five leaderboards. Memoised on `stats`, with the leaderboard `items` built once
 * per response, so filter-select / unrelated state changes don't re-render any of it. */
const TeamStatsBody = memo(function TeamStatsBody({ stats }: { stats: DashboardStats }) {
  const podiumCount = useMemo(
    () => stats.results.filter((r) => r.position !== null && r.position <= 3).length,
    [stats],
  );
  const mostEventsItems = useMemo(() => driverItems(stats.mostEvents), [stats]);
  const mostLapsItems = useMemo(() => driverItems(stats.mostLaps), [stats]);
  const leastIncidentItems = useMemo(() => driverItems(stats.leastIncidentsPerLap), [stats]);
  const trackItems = useMemo<LeaderboardItem[]>(
    () =>
      stats.mostDrivenTracks.map((t) => ({
        key: t.id ?? t.name,
        name: t.name,
        value: t.count,
        href: t.id ? `/tracks/${t.id}` : undefined,
      })),
    [stats],
  );
  const carItems = useMemo<LeaderboardItem[]>(
    () =>
      stats.mostDrivenCars.map((c) => ({
        key: c.id ?? c.name,
        name: c.name,
        value: c.count,
        href: c.id ? `/cars/${c.id}` : undefined,
      })),
    [stats],
  );

  return (
    <>
    <div className="cut flex flex-col gap-3 bg-ds-panel px-4 py-5 sm:px-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <div className="flex flex-col">
          <span className="font-bold">Results by class finishing position</span>
          <span className="text-[13px] text-ds-muted">
            {stats.results.length} races · {podiumCount}{' '}
            class podiums
          </span>
        </div>
        <div className="flex gap-4 text-xs text-ds-muted">
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="fill-w2w-red-mark">
              <path d="M6 0L12 6L6 12L0 6Z" />
            </svg>
            Podium (P1 to P3)
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="fill-chart-muted">
              <rect width="8" height="8" />
            </svg>
            Other finishes
          </span>
        </div>
      </div>
      <ChunkErrorBoundary className="h-[280px]" message="Couldn’t load the chart.">
        <Suspense fallback={<div className="h-[280px]" aria-hidden="true" />}>
          <ResultsScatterChart results={stats.results} />
        </Suspense>
      </ChunkErrorBoundary>
    </div>

    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(196px,100%),1fr))] gap-2.5">
      <StatLeaderboard
        title="Most events driven"
        items={mostEventsItems}
        formatValue={formatCount}
        emptyMessage="No results in this filter."
      />
      <StatLeaderboard
        title="Most laps driven"
        items={mostLapsItems}
        formatValue={formatCount}
        emptyMessage="No results in this filter."
      />
      <StatLeaderboard
        title="Fewest incidents / lap"
        items={leastIncidentItems}
        formatValue={formatIncidents}
        emptyMessage="No driver has enough laps in this filter yet."
      />
      <StatLeaderboard
        title="Most driven track"
        items={trackItems}
        formatValue={formatCount}
        emptyMessage="No results in this filter."
      />
      <StatLeaderboard
        title="Most driven car"
        items={carItems}
        formatValue={formatCount}
        emptyMessage="No results in this filter."
      />
    </div>
    </>
  );
});

function driverItems(list: DashboardStats['mostEvents']): LeaderboardItem[] {
  return list.map((d) => ({
    key: String(d.iracingCustId),
    name: d.name,
    value: d.value,
    href: d.driverProfileId ? `/drivers/${d.driverProfileId}` : undefined,
  }));
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [driverCount, setDriverCount] = useState<number | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<RaceEvent[]>([]);
  const [openSignupCount, setOpenSignupCount] = useState<number | null>(null);
  const [hasSignedUp, setHasSignedUp] = useState(false);
  const [waitingCount, setWaitingCount] = useState(0);
  const { openSearch, shortcutLabel } = useGlobalSearch();
  const isAdmin = user?.role === 'ADMIN';
  const [myStints, setMyStints] = useState<UpcomingStintAssignment[]>([]);
  const [highlights, setHighlights] = useState<TeamHighlight[]>([]);
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  // The Team stats section (chart, five leaderboards, filters) and the team highlights are hidden
  // below sm; don't mount (or load) them there.
  const showTeamStats = useMediaQuery('(min-width: 640px)');
  // Date shown in the header; computed once, it doesn't tick.
  const today = useMemo(() => formatDay(new Date()), []);

  // A failed request leaves its section in the empty state (no count / no stints / no highlights)
  // instead of surfacing as an unhandled rejection; the guard ignores results after unmount.
  useEffect(() => {
    let cancelled = false;
    driversApi
      .list()
      .then((drivers) => {
        if (!cancelled) setDriverCount(drivers.length);
      })
      .catch(() => {});
    eventsApi
      .getMyUpcomingStints()
      .then((list) => {
        if (!cancelled) setMyStints(list);
      })
      .catch(() => {});
    teamHighlightsApi
      .list()
      .then((list) => {
        if (!cancelled) setHighlights(list.slice(0, 3));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The events list already includes drafts for admins (GET /events), so they can be shown here
  // with a Draft tag; members never receive them.
  useEffect(() => {
    let cancelled = false;
    eventsApi.list().then((events) => {
      if (cancelled) return;
      const now = Date.now();
      const upcoming = events
        .filter(
          (e) =>
            (e.status === 'PUBLISHED' || e.status === 'SIGNUPS_CLOSED' || (isAdmin && e.status === 'DRAFT')) &&
            new Date(e.startsAt).getTime() >= now,
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      setUpcomingEvents(upcoming.slice(0, 5));
      setOpenSignupCount(events.filter((e) => isSignupOpen(e, now)).length);
      setHasSignedUp(events.some((e) => e.viewer?.signedUp || e.viewer?.raced));
      setWaitingCount(eventsWaitingOnViewer(events, now).length);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Request token: if the filters change again before a response lands, the stale response is
  // dropped (otherwise A's numbers could overwrite B's under B's filter).
  useEffect(() => {
    if (!showTeamStats) return; // phones don't show the stats section, so don't load it
    let cancelled = false;
    statsApi
      .getDashboard(filters)
      .then((result) => {
        if (cancelled) return;
        setStats(result);
        setStatsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Don't keep showing numbers that belong to a different filter.
        setStats(null);
        setStatsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, showTeamStats]);

  const hasFilters = !!(filters.year || filters.trackId || filters.carId || filters.series || filters.raceLength);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] sm:text-[34px]">
            Welcome back, {user?.discordGlobalName ?? user?.discordUsername}
          </h1>
          <span className="text-[13px] text-ds-muted sm:text-sm">
            {today}
            {waitingCount > 0 && (
              <>
                {' · '}
                <Link
                  to="/events"
                  className="font-semibold text-ds-ink shadow-[inset_0_-2px_0_var(--color-w2w-red)] hover:bg-ds-raised"
                >
                  {waitingCount} signup{waitingCount === 1 ? '' : 's'} waiting on you
                </Link>
              </>
            )}
          </span>
        </div>
        {/* Desktop search field; below md the mobile header has a search button instead. Both open
         * the same palette (also Ctrl/Cmd+K). */}
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search the portal"
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K"
          className="cut-sm hidden h-[42px] min-w-[280px] cursor-pointer items-center gap-2 border-0 bg-ds-panel px-3 text-left text-sm text-ds-muted transition-colors hover:bg-ds-raised md:flex"
        >
          <NavIcon name="search" className="h-[17px] w-[17px]" />
          <span className="flex-1 truncate">Search drivers, events, tracks</span>
          <kbd className="slant bg-ds-control px-[9px] py-0.5 font-sans text-[11px] font-semibold text-ds-muted">
            {shortcutLabel}
          </kbd>
        </button>
      </header>

      <WelcomeChecklist hasSignedUp={hasSignedUp} hasOpenEvents={(openSignupCount ?? 0) > 0} />

      {isAdmin && <DashboardReadiness events={upcomingEvents} />}

      {myStints.map((assignment) => (
        <StintCard key={assignment.teamId} assignment={assignment} />
      ))}

      <div className="flex flex-wrap items-start gap-4 sm:gap-5">
        <section aria-labelledby="next-up" className="cut min-w-0 flex-[3_1_520px] bg-ds-panel pb-1 pt-4 sm:pb-1.5 sm:pt-5">
          <div className="flex items-center justify-between px-4 pb-3 sm:px-5">
            <h2 id="next-up" className="h2">
              Next up
            </h2>
            <Link to="/events" className="text-[13px] font-semibold text-w2w-red-ink hover:text-w2w-red-ink-hover">
              <span className="sm:hidden">All events</span>
              <span className="max-sm:hidden">Full schedule</span>
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-ds-muted sm:px-5">No upcoming events on the schedule.</p>
          ) : (
            upcomingEvents.map((event, index) => {
              const date = new Date(event.startsAt);
              const chip = eventChip(event);
              return (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className={`row-hover flex min-h-16 items-center gap-3 border-t border-ds-line px-4 py-2 text-ds-ink sm:gap-3.5 sm:px-5 ${
                    index >= 4 ? 'max-sm:hidden' : ''
                  }`}
                >
                  <span className="cut-xs flex h-11 w-11 flex-none flex-col items-center justify-center bg-ds-field leading-none sm:h-12 sm:w-[50px]">
                    <span className="num text-xl sm:text-[22px]">{String(date.getDate()).padStart(2, '0')}</span>
                    <span className="text-[10px] font-bold uppercase text-ds-muted">
                      {MONTHS[date.getMonth()]}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 text-sm font-bold">
                      <span className="truncate">{event.title}</span>
                      {event.sim === 'LMU' && (
                        <span className="slant flex-none bg-ds-badge px-2 py-px text-[10px] font-extrabold text-ds-ink-soft">
                          LMU
                        </span>
                      )}
                    </span>
                    <span className="truncate text-xs text-ds-muted sm:text-[13px]">
                      {event.track.name} · {event.carClasses.join(' / ')} · {formatRaceLength(event.raceLengthMinutes)}
                    </span>
                  </span>
                  {chip && (
                    <span className={`chip px-3 py-[3px] text-[10px] sm:px-3.5 sm:py-1 sm:text-[11px] ${chip.className}`}>
                      {chip.label}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </section>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4 sm:gap-5">
          {/* The Mobile board has no Drivers / Signups tiles: they show from sm up. */}
          <div className="hidden grid-cols-2 gap-3 sm:grid">
            <Link
              to="/drivers"
              className="cut row-hover flex flex-col gap-0.5 bg-ds-panel px-[18px] py-4 text-ds-ink"
            >
              <span className="text-[13px] font-semibold text-ds-muted">Drivers</span>
              <span className="num text-4xl leading-[1.1]">{driverCount ?? '—'}</span>
              <span className="text-xs font-semibold text-w2w-red-ink">View roster</span>
            </Link>
            <Link
              to="/events"
              className="cut row-hover flex flex-col gap-0.5 bg-ds-panel px-[18px] py-4 text-ds-ink shadow-[inset_0_-3px_0_var(--color-w2w-red)]"
            >
              <span className="text-[13px] font-semibold text-ds-muted">Signups open</span>
              <span className="num text-4xl leading-[1.1]">{openSignupCount ?? '—'}</span>
              <span className="text-xs font-semibold text-w2w-red-ink">
                {waitingCount > 0 ? `${waitingCount} waiting on you` : 'View schedule'}
              </span>
            </Link>
          </div>

          {showTeamStats && highlights.length > 0 && (
            <section aria-labelledby="highlights" className="cut flex flex-col bg-ds-panel px-4 pb-1 pt-4 sm:px-5 sm:pb-2 sm:pt-5">
              <h2 id="highlights" className="h2 mb-2.5">
                <span className="sm:hidden">Team highlight</span>
                <span className="max-sm:hidden">Team highlights</span>
              </h2>
              {highlights.map((h, index) => {
                // The admin-set position wins; parsing "P#" out of the free text is only a fallback
                // for highlights created before the field existed.
                const pos = h.position ?? highlightPosition(h.period, h.title);
                return (
                  <article
                    key={h.id}
                    className={`flex items-center gap-3.5 border-t border-ds-line py-3 ${index > 0 ? 'max-sm:hidden' : ''}`}
                  >
                    {pos !== null && pos >= 1 && (
                      <span
                        className={`slant num box-border min-w-12 flex-none px-2 py-[3px] text-center text-base ${
                          pos <= 3 ? `${MEDAL_BG[pos - 1]} text-[#111113]` : 'bg-ds-rank text-ds-ink-soft'
                        }`}
                      >
                        P{pos}
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col sm:flex-initial">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-bold max-sm:text-[15px]">{h.title}</span>
                        <span className="flex-none text-xs text-ds-dim sm:hidden">{h.period}</span>
                      </span>
                      {h.description && <span className="text-[13px] text-ds-muted max-sm:text-xs">{h.description}</span>}
                    </span>
                    <span className="ml-auto flex-none text-xs text-ds-dim max-sm:hidden">{h.period}</span>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </div>

      {/* Not on phones: from sm up only. */}
      {showTeamStats && (
        <section aria-labelledby="team-stats" className="flex flex-col gap-3.5 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="team-stats" className="h2 text-2xl!">
              Team stats
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filter by year" className="seg">
                <button
                  type="button"
                  aria-pressed={filters.year === null}
                  onClick={() => setFilters((prev) => ({ ...prev, year: null }))}
                >
                  All
                </button>
                {stats?.filterOptions.years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={filters.year === year}
                    onClick={() => setFilters((prev) => ({ ...prev, year }))}
                  >
                    {year}
                  </button>
                ))}
              </div>
              <FilterSelect
                aria-label="Filter by track"
                value={filters.trackId ?? ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, trackId: e.target.value || null }))}
              >
                <option value="">All tracks</option>
                {stats?.filterOptions.tracks
                  .filter((track) => track.id !== null)
                  .map((track) => (
                    <option key={track.id} value={track.id ?? ''}>
                      {track.name}
                    </option>
                  ))}
              </FilterSelect>
              <FilterSelect
                aria-label="Filter by car"
                value={filters.carId ?? ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, carId: e.target.value || null }))}
              >
                <option value="">All cars</option>
                {stats?.filterOptions.cars
                  .filter((car) => car.id !== null)
                  .map((car) => (
                    <option key={car.id} value={car.id ?? ''}>
                      {car.name}
                    </option>
                  ))}
              </FilterSelect>
              <FilterSelect
                aria-label="Filter by series"
                value={filters.series ?? ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, series: e.target.value || null }))}
              >
                <option value="">All series</option>
                {stats?.filterOptions.series.map((series) => (
                  <option key={series} value={series}>
                    {series}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                aria-label="Filter by race length"
                value={filters.raceLength ?? ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, raceLength: e.target.value || null }))}
              >
                <option value="">All lengths</option>
                {stats?.filterOptions.raceLengths.map((length) => (
                  <option key={length} value={length}>
                    {length}
                  </option>
                ))}
              </FilterSelect>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="px-1 text-[13px] font-semibold text-w2w-red-ink hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {stats && <TeamStatsBody stats={stats} />}
          {!stats && statsFailed && <p className="text-sm text-ds-muted">Couldn’t load team stats.</p>}
        </section>
      )}
    </div>
  );
}
