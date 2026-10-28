import { memo, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatClock } from '../lib/eventFormatting';
import type { RaceEvent } from '../types/event';

/** Chip look per status: published = accent fill, draft = quiet italic, everything else neutral. */
const EVENT_CHIP_STYLES: Record<string, string> = {
  PUBLISHED: 'bg-w2w-red text-on-accent',
  DRAFT: 'bg-ds-raised text-ds-muted italic',
};
const EVENT_CHIP_DEFAULT = 'bg-ds-control text-ds-ink';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE_PER_DAY = 3;

/** Races almost always land on the weekend, so the weekday columns are weighted: Mon-Thu are slim,
 * Friday medium, Sat/Sun wide. A slim column that actually holds an event in the visible grid is
 * promoted to the Friday width (see `columnWeights` below) so a midweek race is never squeezed. */
const WEIGHT_NARROW = 0.55;
const WEIGHT_MEDIUM = 1;
const WEIGHT_WIDE = 1.7;
const DEFAULT_COLUMN_WEIGHTS = [
  WEIGHT_NARROW,
  WEIGHT_NARROW,
  WEIGHT_NARROW,
  WEIGHT_NARROW,
  WEIGHT_MEDIUM,
  WEIGHT_WIDE,
  WEIGHT_WIDE,
];
/** Index (Mon=0) of the last weekday column that is slim by default. */
const LAST_NARROW_COLUMN = 3;
const MAX_VISIBLE_PER_NARROW_DAY = 1;

/** Monday-first weekday index (0=Monday .. 6=Sunday). */
const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Monday-first grid spanning the given month, padded with the trailing days of the previous
 * month and the leading days of the next so every week row is a full 7 days — only as many week
 * rows as the month needs. */
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0=Monday
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  return Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Groups events by local calendar day once (one Date per event) instead of filtering every event
 * for each of the 28-42 grid cells; each day's list is sorted by start time. */
function groupEventsByDay(events: RaceEvent[]): Map<string, RaceEvent[]> {
  const timed = events.map((event) => ({ event, time: new Date(event.startsAt) }));
  timed.sort((a, b) => a.time.getTime() - b.time.getTime());
  const byDay = new Map<string, RaceEvent[]>();
  for (const { event, time } of timed) {
    const key = dayKey(time);
    const list = byDay.get(key);
    if (list) list.push(event);
    else byDay.set(key, [event]);
  }
  return byDay;
}

const NO_EVENTS: RaceEvent[] = [];

function EventsCalendar({ events }: { events: RaceEvent[] }) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const today = new Date();
  const todayKey = dayKey(today);
  const monthLabel = MONTH_LABEL_FORMAT.format(viewMonth);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  // One shared template for the header row and every week row (they are cells of the same grid, so
  // they cannot drift). Slim Mon-Thu columns are widened only when the visible grid has an event there.
  const columnWeights = useMemo(() => {
    const weights = [...DEFAULT_COLUMN_WEIGHTS];
    for (const day of days) {
      const col = weekdayIndex(day);
      if (col <= LAST_NARROW_COLUMN && eventsByDay.has(dayKey(day))) weights[col] = WEIGHT_MEDIUM;
    }
    return weights;
  }, [days, eventsByDay]);
  const gridStyle = useMemo(
    () =>
      ({
        '--cal-cols': columnWeights.map((w) => `minmax(0,${w}fr)`).join(' '),
      }) as CSSProperties,
    [columnWeights],
  );

  return (
    <section aria-label="Calendar" className="cut flex flex-col gap-3.5 bg-ds-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="cut-xs flex h-[38px] w-[38px] items-center justify-center border-0 bg-ds-control text-ds-ink hover:bg-ds-control-hover"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="square"
              aria-hidden="true"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            aria-label="Next month"
            className="cut-xs flex h-[38px] w-[38px] items-center justify-center border-0 bg-ds-control text-ds-ink hover:bg-ds-control-hover"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="square"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <h2 className="h2 ml-2.5">{monthLabel}</h2>
        </div>
        <button
          type="button"
          onClick={() => setViewMonth(startOfMonth(new Date()))}
          className="cut-sm min-h-[38px] border-0 bg-ds-control px-4 text-[13px] font-bold uppercase text-ds-ink hover:bg-ds-control-hover"
        >
          Today
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[var(--cal-cols)] gap-1" style={gridStyle}>
          {WEEKDAY_LABELS.map((label, col) => (
            <span
              key={label}
              className={`py-1 text-[11px] font-bold uppercase text-ds-dim ${
                columnWeights[col] < WEIGHT_MEDIUM ? 'px-1' : 'px-2'
              }`}
            >
              {label}
            </span>
          ))}

          {days.map((day) => {
            const inMonth = day.getMonth() === viewMonth.getMonth();
            const key = dayKey(day);
            const isToday = key === todayKey;
            const dayEvents = eventsByDay.get(key) ?? NO_EVENTS;
            const narrow = columnWeights[weekdayIndex(day)] < WEIGHT_MEDIUM;
            const maxVisible = narrow ? MAX_VISIBLE_PER_NARROW_DAY : MAX_VISIBLE_PER_DAY;
            const overflow = dayEvents.length - maxVisible;

            return (
              <div
                key={day.toISOString()}
                className={`flex min-h-[104px] min-w-0 flex-col gap-1 ${narrow ? 'p-1' : 'p-1.5'} ${inMonth ? 'bg-ds-field' : 'bg-transparent'} ${
                  isToday ? 'shadow-[inset_0_-3px_0_var(--color-w2w-red)]' : ''
                }`}
              >
                <div className={`flex min-w-0 flex-col gap-1 ${inMonth ? '' : 'opacity-40'}`}>
                  <span
                    className={`num cut-xs box-border flex h-6 min-w-[26px] items-center justify-center self-start px-[5px] text-sm ${
                      isToday ? 'bg-w2w-red text-on-accent' : 'text-ds-ink-soft'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.slice(0, maxVisible).map((event) => {
                    const label = `${formatClock(event.startsAt)} ${event.title}`;
                    return (
                      <Link
                        key={event.id}
                        to={`/events/${event.id}`}
                        title={event.title}
                        aria-label={label}
                        className={`cut-xs block truncate py-1 text-xs font-bold leading-[1.3] hover:brightness-110 ${
                          narrow ? 'px-1' : 'px-2'
                        } ${EVENT_CHIP_STYLES[event.status] ?? EVENT_CHIP_DEFAULT}`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                  {overflow > 0 && (
                    <span
                      title={`${overflow} more`}
                      aria-label={`${overflow} more`}
                      className="truncate px-1 text-xs text-ds-dim"
                    >
                      {narrow ? `+${overflow}` : `+${overflow} more`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default memo(EventsCalendar);
