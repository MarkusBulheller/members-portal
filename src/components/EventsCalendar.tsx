import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RaceEvent } from '../types/event';

const STATUS_DOT_STYLES: Record<string, string> = {
  DRAFT: 'bg-white/40',
  PUBLISHED: 'bg-w2w-red',
  SIGNUPS_CLOSED: 'bg-white/50',
  CANCELLED: 'bg-white/30',
  COMPLETED: 'bg-white/30',
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE_PER_DAY = 3;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Monday-first 6-week grid spanning the given month, padded with the trailing days of the
 * previous month and the leading days of the next so every week row is a full 7 days. */
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0=Monday
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function EventsCalendar({ events }: { events: RaceEvent[] }) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));

  const days = buildMonthGrid(viewMonth);
  const today = new Date();
  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const eventsByDay = days.map((day) =>
    events
      .filter((event) => isSameDay(new Date(event.startsAt), day))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          aria-label="Previous month"
          className="px-3 py-1.5 border border-white/20 text-white/65 hover:text-white hover:border-white/40 transition-colors"
        >
          ←
        </button>
        <div className="flex items-center gap-3">
          <h3 className="font-display font-black text-lg uppercase text-w2w-white">{monthLabel}</h3>
          <button
            type="button"
            onClick={() => setViewMonth(startOfMonth(new Date()))}
            className="text-[11px] text-w2w-red hover:text-w2w-red-bright font-heading uppercase tracking-wide"
          >
            Today
          </button>
        </div>
        <button
          type="button"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          aria-label="Next month"
          className="px-3 py-1.5 border border-white/20 text-white/65 hover:text-white hover:border-white/40 transition-colors"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-white/10 border border-white/10 text-xs overflow-hidden">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-w2w-charcoal py-2 text-center font-heading text-[10px] tracking-[0.15em] text-white/50 uppercase"
          >
            {label}
          </div>
        ))}

        {days.map((day, i) => {
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvents = eventsByDay[i];
          const overflow = dayEvents.length - MAX_VISIBLE_PER_DAY;

          return (
            <div
              key={day.toISOString()}
              className={`bg-w2w-charcoal min-h-[92px] p-1.5 flex flex-col gap-1 ${inMonth ? '' : 'opacity-40'}`}
            >
              <span
                className={`text-[11px] font-heading ${
                  isToday ? 'inline-flex h-5 w-5 items-center justify-center bg-w2w-red text-on-accent rounded-full' : 'text-white/50'
                }`}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                {dayEvents.slice(0, MAX_VISIBLE_PER_DAY).map((event) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    title={event.title}
                    className="flex items-center gap-1 px-1 py-0.5 bg-white/5 hover:bg-white/10 transition-colors min-w-0"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT_STYLES[event.status] ?? 'bg-white/40'}`}
                      aria-hidden="true"
                    />
                    <span className="text-white/80 truncate">{event.title}</span>
                  </Link>
                ))}
                {overflow > 0 && <span className="text-white/50 px-1">+{overflow} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
