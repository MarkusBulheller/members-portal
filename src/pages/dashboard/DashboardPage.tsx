import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ResultsScatterChart from '../../components/ResultsScatterChart';
import StatLeaderboard from '../../components/StatLeaderboard';
import { useAuth } from '../../context/AuthContext';
import { driversApi } from '../../lib/api/drivers';
import { eventsApi } from '../../lib/api/events';
import { statsApi } from '../../lib/api/stats';
import type { RaceEvent, UpcomingStintAssignment } from '../../types/event';
import type { DashboardFilters, DashboardStats } from '../../types/stats';

const EMPTY_FILTERS: DashboardFilters = { year: null, trackId: null, carId: null, series: null, raceLength: null };

function formatAssignmentTime(startsAt: string | null): string {
  if (!startsAt) return 'Time TBD';
  return new Date(startsAt).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCountdown(targetMs: number, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.round((targetMs - nowMs) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [driverCount, setDriverCount] = useState<number | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<RaceEvent[]>([]);
  const [myStints, setMyStints] = useState<UpcomingStintAssignment[]>([]);
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Drives the "next stint in..." countdown below — same refresh strategy as the planning page's
  // own live clock: a 1s interval, plus a forced read on tab/window focus since browsers throttle
  // background-tab timers.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1_000);
    const refreshNow = () => setNowMs(Date.now());
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', refreshNow);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', refreshNow);
    };
  }, []);

  useEffect(() => {
    void driversApi.list().then((drivers) => setDriverCount(drivers.length));
    void eventsApi.list().then((events) => {
      const now = Date.now();
      setUpcomingEvents(
        events
          .filter((e) => e.status === 'PUBLISHED' && new Date(e.startsAt).getTime() >= now)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
          .slice(0, 5),
      );
    });
    void eventsApi.getMyUpcomingStints().then(setMyStints);
  }, []);

  useEffect(() => {
    void statsApi.getDashboard(filters).then(setStats);
  }, [filters]);

  return (
    <div>
      <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Dashboard</p>
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-8">
        Welcome, {user?.discordGlobalName ?? user?.discordUsername}
      </h1>

      {myStints.length > 0 && (
        <div className="mb-8 space-y-3">
          {myStints.map((assignment) => (
            <Link
              key={assignment.teamId}
              to={`/events/${assignment.eventId}/teams/${assignment.teamId}/plan`}
              className={
                assignment.isLive
                  ? 'flex flex-wrap items-center justify-between gap-3 bg-w2w-red hover:bg-w2w-red-bright px-6 py-5 transition-colors clip-corner'
                  : 'flex flex-wrap items-center justify-between gap-3 bg-w2w-charcoal border-2 border-w2w-red px-6 py-5 hover:border-w2w-red-bright transition-colors'
              }
            >
              <div>
                <p
                  className={`font-heading text-[11px] tracking-[0.2em] uppercase ${
                    assignment.isLive ? 'text-on-accent/80' : 'text-w2w-red'
                  }`}
                >
                  {assignment.isLive ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-on-accent animate-pulse" aria-hidden="true" />
                      You&apos;re racing now
                    </span>
                  ) : (
                    "You're on the entry list"
                  )}
                </p>
                <p className={`mt-1 font-display font-black text-xl uppercase ${assignment.isLive ? 'text-on-accent' : 'text-white'}`}>
                  {assignment.eventTitle} — {assignment.teamName}
                </p>
              </div>
              {assignment.nextStintStartsAt ? (
                <div className="text-right">
                  <p className={`font-display font-black text-2xl ${assignment.isLive ? 'text-on-accent' : 'text-w2w-red'}`}>
                    {formatCountdown(new Date(assignment.nextStintStartsAt).getTime(), nowMs)}
                  </p>
                  <p
                    className={`text-[10px] font-heading uppercase tracking-wide ${
                      assignment.isLive ? 'text-on-accent/70' : 'text-white/50'
                    }`}
                  >
                    until your next stint
                  </p>
                </div>
              ) : (
                <span
                  className={`text-xs font-heading uppercase whitespace-nowrap ${
                    assignment.isLive ? 'text-on-accent/80' : 'text-white/65'
                  }`}
                >
                  {formatAssignmentTime(assignment.timeslotStartsAt)} →
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6 mb-10">
        <div className="bg-w2w-charcoal border border-white/10 p-6">
          <p className="font-heading text-[11px] tracking-[0.2em] text-white/65 uppercase">Roster</p>
          <p className="mt-2 font-display font-black text-3xl text-w2w-white">
            {driverCount ?? '—'} <span className="text-base font-heading text-white/65 uppercase">drivers</span>
          </p>
          <Link to="/drivers" className="mt-3 inline-block text-xs text-w2w-red hover:text-w2w-red-bright">
            View roster →
          </Link>
        </div>
        <div className="bg-w2w-charcoal border border-white/10 p-6">
          <p className="font-heading text-[11px] tracking-[0.2em] text-white/65 uppercase">Upcoming</p>
          <p className="mt-2 font-display font-black text-3xl text-w2w-white">
            {upcomingEvents.length} <span className="text-base font-heading text-white/65 uppercase">events</span>
          </p>
          <Link to="/events" className="mt-3 inline-block text-xs text-w2w-red hover:text-w2w-red-bright">
            View schedule →
          </Link>
        </div>
      </div>

      <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">Next Up</h2>
      {upcomingEvents.length === 0 ? (
        <p className="text-white/65 text-sm">No upcoming events on the schedule.</p>
      ) : (
        <div className="space-y-2">
          {upcomingEvents.map((event) => (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className="flex items-center justify-between bg-w2w-charcoal/60 border border-white/10 hover:border-w2w-red/50 px-5 py-4 transition-colors"
            >
              <div>
                <p className="font-heading font-semibold text-white text-sm">{event.title}</p>
                <p className="text-white/65 text-xs mt-0.5">
                  {event.track.name} · {event.carClasses.join(' / ')}
                </p>
              </div>
              <span className="text-white/65 text-xs font-heading uppercase">
                {new Date(event.startsAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 flex items-center justify-between mb-4">
        <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase">Stats</h2>
        {(filters.year || filters.trackId || filters.carId || filters.series || filters.raceLength) && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-[11px] text-white/65 hover:text-white uppercase tracking-wide"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
        <select
          aria-label="Filter by year"
          value={filters.year ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value ? Number(e.target.value) : null }))}
          className="w-full min-w-0 truncate bg-w2w-black border border-white/15 text-white text-sm px-3 py-2 focus:outline-none focus:border-w2w-red"
        >
          <option value="">All years</option>
          {stats?.filterOptions.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by track"
          value={filters.trackId ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, trackId: e.target.value || null }))}
          className="w-full min-w-0 truncate bg-w2w-black border border-white/15 text-white text-sm px-3 py-2 focus:outline-none focus:border-w2w-red"
        >
          <option value="">All tracks</option>
          {stats?.filterOptions.tracks
            .filter((track) => track.id !== null)
            .map((track) => (
              <option key={track.id} value={track.id ?? ''}>
                {track.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Filter by car"
          value={filters.carId ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, carId: e.target.value || null }))}
          className="w-full min-w-0 truncate bg-w2w-black border border-white/15 text-white text-sm px-3 py-2 focus:outline-none focus:border-w2w-red"
        >
          <option value="">All cars</option>
          {stats?.filterOptions.cars
            .filter((car) => car.id !== null)
            .map((car) => (
              <option key={car.id} value={car.id ?? ''}>
                {car.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Filter by series"
          value={filters.series ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, series: e.target.value || null }))}
          className="w-full min-w-0 truncate bg-w2w-black border border-white/15 text-white text-sm px-3 py-2 focus:outline-none focus:border-w2w-red"
        >
          <option value="">All series</option>
          {stats?.filterOptions.series.map((series) => (
            <option key={series} value={series}>
              {series}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by race length"
          value={filters.raceLength ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, raceLength: e.target.value || null }))}
          className="w-full min-w-0 truncate bg-w2w-black border border-white/15 text-white text-sm px-3 py-2 focus:outline-none focus:border-w2w-red"
        >
          <option value="">All lengths</option>
          {stats?.filterOptions.raceLengths.map((length) => (
            <option key={length} value={length}>
              {length}
            </option>
          ))}
        </select>
      </div>

      {stats && (
        <div className="space-y-8">
          <div className="bg-w2w-charcoal border border-white/10 p-6">
            <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-3">
              Results by Finishing Position
            </p>
            <ResultsScatterChart results={stats.results} />
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-w2w-charcoal border border-white/10 p-6">
              <StatLeaderboard
                title="Most Events Driven"
                items={stats.mostEvents.map((d) => ({
                  key: String(d.iracingCustId),
                  name: d.name,
                  value: d.value,
                  href: d.driverProfileId ? `/drivers/${d.driverProfileId}` : undefined,
                }))}
                formatValue={(v) => String(v)}
                emptyMessage="No results in this filter."
              />
            </div>
            <div className="bg-w2w-charcoal border border-white/10 p-6">
              <StatLeaderboard
                title="Most Laps Driven"
                items={stats.mostLaps.map((d) => ({
                  key: String(d.iracingCustId),
                  name: d.name,
                  value: d.value,
                  href: d.driverProfileId ? `/drivers/${d.driverProfileId}` : undefined,
                }))}
                formatValue={(v) => String(v)}
                emptyMessage="No results in this filter."
              />
            </div>
            <div className="bg-w2w-charcoal border border-white/10 p-6">
              <StatLeaderboard
                title="Fewest Incidents / Lap"
                items={stats.leastIncidentsPerLap.map((d) => ({
                  key: String(d.iracingCustId),
                  name: d.name,
                  value: d.value,
                  href: d.driverProfileId ? `/drivers/${d.driverProfileId}` : undefined,
                }))}
                formatValue={(v) => v.toFixed(3)}
                emptyMessage="No driver has enough laps in this filter yet."
              />
            </div>
            <div className="bg-w2w-charcoal border border-white/10 p-6">
              <StatLeaderboard
                title="Most Driven Track"
                items={stats.mostDrivenTracks.map((t) => ({
                  key: t.id ?? t.name,
                  name: t.name,
                  value: t.count,
                  href: t.id ? `/tracks/${t.id}` : undefined,
                }))}
                formatValue={(v) => String(v)}
                emptyMessage="No results in this filter."
              />
            </div>
            <div className="bg-w2w-charcoal border border-white/10 p-6">
              <StatLeaderboard
                title="Most Driven Car"
                items={stats.mostDrivenCars.map((c) => ({
                  key: c.id ?? c.name,
                  name: c.name,
                  value: c.count,
                  href: c.id ? `/cars/${c.id}` : undefined,
                }))}
                formatValue={(v) => String(v)}
                emptyMessage="No results in this filter."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
