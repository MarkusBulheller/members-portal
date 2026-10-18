import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import EventsCalendar from '../../components/EventsCalendar';
import { useAuth } from '../../context/AuthContext';
import { eventsApi } from '../../lib/api/events';
import { formatClock, formatDayShort } from '../../lib/eventFormatting';
import type { RaceEvent } from '../../types/event';
import { formatRaceLength } from '../../types/raceLength';

/** Tag per status: label + chip modifier classes (see .chip in index.css). */
const STATUS_CHIPS: Record<string, { label: string; className: string }> = {
  PUBLISHED: { label: 'Signups open', className: 'chip-accent' },
  SIGNUPS_CLOSED: { label: 'Team building', className: '' },
  DRAFT: { label: 'Draft', className: 'chip-draft' },
  COMPLETED: { label: 'Completed', className: 'chip-muted' },
  CANCELLED: { label: 'Cancelled', className: 'chip-muted' },
};

/** "Upcoming" (the default) hides finished and cancelled events; "All" shows everything. */
const UPCOMING = 'upcoming';
const ALL = '';

/** The status filter's fixed option set, per the design (Completed and Cancelled events are
 * reachable through "All"). */
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: UPCOMING, label: 'Upcoming' },
  { value: 'PUBLISHED', label: 'Signups open' },
  { value: 'SIGNUPS_CLOSED', label: 'Team building' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: ALL, label: 'All' },
];
const PAST_STATUSES: RaceEvent['status'][] = ['COMPLETED', 'CANCELLED'];

/** The per-event chip for the viewer's own relationship to it (see EventViewerStatus). Null = no
 * chip: drafts and cancelled events have nothing to sign up for, and an event the viewer isn't in
 * that's no longer open has nothing to say about them. */
function viewerChip(event: RaceEvent): { label: string; className: string } | null {
  if (event.status === 'DRAFT' || event.status === 'CANCELLED') return null;
  const viewer = event.viewer;
  if (viewer?.raced) return { label: 'Raced', className: 'chip-muted' };
  if (viewer?.onTeam) return { label: 'On a team', className: 'chip-accent' };
  if (viewer?.signedUp) return { label: 'Signed up', className: 'chip-accent' };
  if (viewer && event.status === 'PUBLISHED') return { label: 'Sign up', className: 'chip-solid' };
  return null;
}

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function EventsListPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<RaceEvent[] | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(UPCOMING);
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const [loadFailed, setLoadFailed] = useState(false);
  // Typing stays responsive: filtering/grouping runs against a deferred copy of the search text.
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let cancelled = false;
    eventsApi
      .list()
      .then((list) => {
        if (cancelled) return;
        setEvents(list.slice().sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return (events ?? []).filter((event) => {
      const matchesSearch =
        q === '' ||
        event.title.toLowerCase().includes(q) ||
        event.track.name.toLowerCase().includes(q) ||
        event.carClasses.some((c) => c.toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === ALL ||
        (statusFilter === UPCOMING ? !PAST_STATUSES.includes(event.status) : event.status === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [events, deferredSearch, statusFilter]);

  // Group the (already date-sorted) list by calendar month for the list view.
  const months = useMemo(() => {
    const groups: { key: string; label: string; events: RaceEvent[] }[] = [];
    for (const event of filtered) {
      const key = monthKey(event.startsAt);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: MONTH_FORMAT.format(new Date(event.startsAt)), events: [] };
        groups.push(group);
      }
      group.events.push(event);
    }
    return groups;
  }, [filtered]);

  const openCount = useMemo(() => (events ?? []).filter((e) => e.status === 'PUBLISHED').length, [events]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.1] text-ds-ink">Events</h1>
          {events !== null && (
            <span className="text-ds-muted">Team schedule · {openCount} with signups open</span>
          )}
        </div>
        {user?.role === 'ADMIN' && (
          <div className="flex flex-wrap gap-2.5">
            <Link to="/series" className="btn-secondary">
              From a series
            </Link>
            <Link to="/events/new" className="btn-primary">
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
                <path d="M12 5v14M5 12h14" />
              </svg>
              New event
            </Link>
          </div>
        )}
      </header>

      {events !== null && events.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="cut-sm flex h-[42px] max-w-[340px] flex-[1_1_240px] items-center gap-2 bg-ds-panel px-3 text-ds-muted focus-within:shadow-[inset_0_-2px_0_var(--color-w2w-red)]">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="square"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
            <input
              type="text"
              aria-label="Search events"
              placeholder="Search title, track or class"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ds-ink outline-none placeholder:text-ds-dim"
            />
          </div>
          <div role="group" aria-label="Filter by status" className="seg">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={statusFilter === filter.value}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="View" className="seg ml-auto">
            {(['list', 'calendar'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}>
                {v === 'list' ? 'List' : 'Calendar'}
              </button>
            ))}
          </div>
        </div>
      )}

      {events === null ? (
        <p className="m-0 text-sm text-ds-muted">{loadFailed ? 'Couldn’t load events. Try reloading the page.' : 'Loading...'}</p>
      ) : events.length === 0 ? (
        <p className="cut m-0 bg-ds-panel px-4 py-10 text-center text-ds-muted">No events on the schedule yet.</p>
      ) : view === 'calendar' ? (
        <EventsCalendar events={filtered} />
      ) : filtered.length === 0 ? (
        <p className="cut m-0 bg-ds-panel px-4 py-10 text-center text-ds-muted">
          No events match that search or filter.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {months.map((month) => (
            <section key={month.key} className="cut bg-ds-panel pb-1.5 pt-5">
              <div className="flex items-center justify-between gap-3 px-5 pb-3">
                <h2 className="h2">{month.label}</h2>
                <span className="text-[13px] text-ds-dim">
                  {month.events.length === 1 ? '1 event' : `${month.events.length} events`}
                </span>
              </div>
              {month.events.map((event) => {
                const start = new Date(event.startsAt);
                const chip = STATUS_CHIPS[event.status] ?? { label: event.status, className: '' };
                const mine = viewerChip(event);
                return (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    className="row-hover box-border flex min-h-[72px] flex-wrap items-center gap-3.5 border-t border-ds-line px-5 py-2.5 text-ds-ink"
                  >
                    <span className="cut-xs flex h-[50px] w-[50px] flex-none flex-col items-center justify-center bg-ds-field leading-none">
                      <span className="num text-[22px]">{start.getDate()}</span>
                      <span className="text-[10px] font-bold uppercase text-ds-muted">
                        {formatDayShort(start).slice(0, 3)}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-[15px] font-bold">
                        <span className={event.status === 'CANCELLED' ? 'text-ds-dim line-through' : undefined}>
                          {event.title}
                        </span>
                        {event.sim === 'LMU' && (
                          <span className="slant bg-ds-control px-2 py-px text-[10px] font-extrabold text-ds-ink-soft">
                            LMU
                          </span>
                        )}
                      </span>
                      <span className="text-[13px] text-ds-muted">
                        {event.track.name} · {event.carClasses.join(' / ')} ·{' '}
                        {formatRaceLength(event.raceLengthMinutes)} ·{' '}
                        {formatClock(start)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {mine && <span className={`chip ${mine.className}`}>{mine.label}</span>}
                      <span className={`chip ${chip.className}`}>{chip.label}</span>
                    </span>
                  </Link>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
