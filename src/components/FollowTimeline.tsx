import { memo, useMemo } from 'react';
import { formatLocalTime, type FollowView } from '../lib/followState';
import { useFollowNow } from '../lib/useFollowState';

const NICE_STEP_MINUTES = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440];

function pickTickStepMinutes(totalMinutes: number): number {
  const target = totalMinutes / 8;
  return NICE_STEP_MINUTES.find((step) => step >= target) ?? NICE_STEP_MINUTES[NICE_STEP_MINUTES.length - 1];
}

/** The red "Live" marker; owns its clock so moving it never re-renders the bars. */
function NowMarker({ raceStartMs, spanMs, offsetMs }: { raceStartMs: number; spanMs: number; offsetMs: number }) {
  const nowMs = useFollowNow(offsetMs);
  const pct = ((nowMs - raceStartMs) / spanMs) * 100;
  if (!(pct >= 0 && pct <= 100)) return null;
  return (
    <div
      aria-hidden="true"
      title={`Now · ${formatLocalTime(nowMs)}`}
      className="pointer-events-none absolute bottom-[22px] top-0 z-10 w-0.5 -translate-x-px bg-w2w-red"
      style={{ left: `${pct}%` }}
    >
      <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap bg-w2w-red px-1.5 py-px text-[10px] font-extrabold uppercase text-on-accent">
        Live
      </span>
    </div>
  );
}

/** Read-only, single-lane view of the whole plan: one numbered segment per stint (neutral colours;
 * done = dim, live = accent, next = lifted) with the live line over it and a local-time axis.
 * Hover/long-press a segment for the driver. Geometry mirrors StintTimeline: percent of the race
 * span from the green flag. */
function FollowTimeline({ view, offsetMs }: { view: FollowView; offsetMs: number }) {
  const layout = useMemo(() => {
    const { raceStartMs, raceEndMs } = view;
    if (raceStartMs === null || raceEndMs === null) return null;
    const timed = view.stints.filter((s) => s.startMs !== null && s.endMs !== null && s.endMs > s.startMs);
    if (timed.length === 0) return null;
    const endMs = Math.max(raceEndMs, ...timed.map((s) => s.endMs as number));
    const spanMs = Math.max(endMs - raceStartMs, 60_000);
    const stepMs = pickTickStepMinutes(spanMs / 60_000) * 60_000;
    const ticks: { pct: number; label: string }[] = [];
    for (let t = 0; t <= spanMs + 1; t += stepMs) {
      ticks.push({ pct: (t / spanMs) * 100, label: formatLocalTime(raceStartMs + t) });
    }
    const segments = timed.map((s, i) => {
      const left = (((s.startMs as number) - raceStartMs) / spanMs) * 100;
      const width = (((s.endMs as number) - (s.startMs as number)) / spanMs) * 100;
      return {
        number: s.number,
        status: s.status,
        odd: i % 2 === 1,
        left: Math.max(left, 0),
        width: Math.max(Math.min(width, 100 - left), 0.4),
        title: `Stint ${s.number} · ${s.driverName} · ${formatLocalTime(s.startMs as number)} – ${formatLocalTime(s.endMs as number)}`,
      };
    });
    return { raceStartMs, spanMs, ticks, segments };
  }, [view]);

  if (!layout) return null;

  return (
    <section aria-labelledby="follow-timeline-title" className="cut flex flex-col gap-3.5 bg-ds-panel px-[22px] py-5">
      <h2 id="follow-timeline-title" className="h2">
        Timeline
      </h2>
      <div className="overflow-x-auto">
        <div className="relative min-w-[520px] pt-[18px]">
          <NowMarker raceStartMs={layout.raceStartMs} spanMs={layout.spanMs} offsetMs={offsetMs} />
          <div className="relative h-10 bg-ds-field">
            {layout.segments.map((seg) => (
              <div
                key={seg.number}
                title={seg.title}
                className={`num absolute bottom-[3px] top-[3px] flex items-center justify-center overflow-hidden text-[13px] ${
                  seg.status === 'live'
                    ? 'bg-w2w-red text-on-accent'
                    : seg.status === 'done'
                      ? 'bg-ds-control text-ds-dim'
                      : seg.status === 'next'
                        ? 'bg-ds-ghost text-[#111113]'
                        : seg.odd
                          ? 'bg-ds-ghost/45 text-ds-ink'
                          : 'bg-ds-ghost/30 text-ds-ink'
                }`}
                style={{ left: `${seg.left}%`, width: `calc(${seg.width}% - 2px)` }}
              >
                {seg.number}
              </div>
            ))}
          </div>
          <div className="relative mt-1.5 h-4">
            {layout.ticks.map((t, i) => (
              <span
                key={i}
                className="absolute top-0 whitespace-nowrap text-xs font-semibold tabular-nums text-ds-dim"
                style={{
                  left: `${t.pct}%`,
                  transform: `translateX(${i === 0 ? '0%' : i === layout.ticks.length - 1 ? '-100%' : '-50%'})`,
                }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(FollowTimeline);
