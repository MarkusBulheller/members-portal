import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { eventsApi } from '../../lib/api/events';
import type { RaceEvent } from '../../types/event';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-white/10 text-white/60',
  PUBLISHED: 'bg-w2w-red/15 text-w2w-red',
  SIGNUPS_CLOSED: 'bg-white/10 text-white/65',
  CANCELLED: 'bg-white/10 text-white/65 line-through',
  COMPLETED: 'bg-white/10 text-white/65',
};

const STATUS_LABELS: Record<string, string> = {
  SIGNUPS_CLOSED: 'Signups Closed',
};

export default function EventsListPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<RaceEvent[] | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    void eventsApi.list().then((list) =>
      setEvents(list.slice().sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())),
    );
  }, []);

  const statuses = Array.from(new Set((events ?? []).map((e) => e.status))).sort();
  const filtered = (events ?? []).filter((event) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      q === '' ||
      event.title.toLowerCase().includes(q) ||
      event.track.name.toLowerCase().includes(q) ||
      event.carClasses.some((c) => c.toLowerCase().includes(q));
    const matchesStatus = statusFilter === '' || event.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Schedule</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">Events</h1>
        </div>
        {user?.role === 'ADMIN' && (
          <Link
            to="/events/new"
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
          >
            New Event
          </Link>
        )}
      </div>

      {events !== null && events.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            aria-label="Search events"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input max-w-sm"
          />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status] ?? status}
              </option>
            ))}
          </select>
        </div>
      )}

      {events === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-white/65 text-sm">No events on the schedule yet.</p>
      ) : filtered.length === 0 ? (
        <p className="text-white/65 text-sm">No events match that search/filter.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((event) => (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className="flex items-center justify-between bg-w2w-charcoal border border-white/10 hover:border-w2w-red/50 px-5 py-4 transition-colors"
            >
              <div>
                <p className="font-heading font-semibold text-white text-sm">{event.title}</p>
                <p className="text-white/65 text-xs mt-0.5">
                  {event.track.name} · {event.carClasses.join(' / ')} ·{' '}
                  {new Date(event.startsAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 text-[11px] font-heading uppercase tracking-wide ${STATUS_STYLES[event.status]}`}
              >
                {STATUS_LABELS[event.status] ?? event.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
