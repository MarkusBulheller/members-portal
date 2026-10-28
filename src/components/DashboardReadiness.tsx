import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { groupChecks, isReadinessPhase } from '../lib/readiness';
import { useReadiness } from '../lib/useReadiness';
import type { RaceEvent } from '../types/event';
import type { ReadinessCheck } from '../types/readiness';
import ReadinessStatusChip from './ReadinessStatusChip';

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Admin dashboard tile: the race-readiness status of the next event starting within 14 days, with
 * its two most pressing open issues. Fetches lazily, and renders nothing when there is no such
 * event or the check cannot be loaded. */
export default function DashboardReadiness({ events }: { events: RaceEvent[] }) {
  const [now] = useState(() => Date.now());
  const next = useMemo(() => {
    return events.find((e) => {
      if (!isReadinessPhase(e.status)) return false;
      const start = new Date(e.startsAt).getTime();
      return start >= now && start - now <= WINDOW_MS;
    });
  }, [events, now]);
  const { data, error } = useReadiness(next?.id, { enabled: !!next });

  const top = useMemo(() => {
    if (!data) return [];
    const all: { check: ReadinessCheck; where: string }[] = [
      ...data.event.map((check) => ({ check, where: 'Event' })),
      ...data.teams.flatMap((t) => t.checks.map((check) => ({ check, where: t.teamName }))),
    ];
    const failed = groupChecks(all.map((a) => a.check)).failed;
    const order = new Map(failed.map((c, i) => [c, i]));
    return all
      .filter((a) => order.has(a.check))
      .sort((a, b) => (order.get(a.check) ?? 0) - (order.get(b.check) ?? 0))
      .slice(0, 2);
  }, [data]);

  if (!next || error || !data) return null;
  const start = new Date(next.startsAt);

  return (
    <section
      aria-labelledby="dash-readiness-title"
      className="cut flex flex-col gap-3 bg-ds-panel px-4 py-4 sm:px-5 sm:py-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="dash-readiness-title" className="h2">
            Race readiness
          </h2>
          <span className="truncate text-[13px] text-ds-muted">
            {next.title} · {start.getDate()} {MONTHS[start.getMonth()]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ReadinessStatusChip summary={data.summary} />
          <Link to={`/events/${next.id}#readiness`} className="btn-secondary btn-sm">
            Open check
          </Link>
        </div>
      </div>
      {top.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {top.map(({ check, where }) => (
            <li
              key={`${where}:${check.id}`}
              className="flex flex-wrap items-baseline gap-x-2 border-t border-ds-line py-2 first:border-t-0"
            >
              <span
                className={`text-sm font-bold ${check.level === 'BLOCKER' ? 'text-ds-danger' : check.level === 'WARNING' ? 'text-ds-warn' : 'text-ds-ink'}`}
              >
                {check.title}
                <span className="sr-only"> ({check.level.toLowerCase()})</span>
              </span>
              <span className="text-xs text-ds-muted">{where}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
