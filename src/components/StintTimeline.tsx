import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import { driverIdsInStintOrder, getDriverColor, orderedDriverIds } from '../lib/driverColors';
import { formatClock } from '../lib/eventFormatting';
import { isPageHidden, subscribeToPageActivity } from '../lib/pageActivity';
import type { WeatherForecastPoint } from '../types/iracingWeatherForecast';

/** One driver's declared availability, for the optional availability strip under their lane.
 * `availableHours` are on-the-hour ISO instants; empty means "no hours set" = always available. */
export interface TimelineDriverAvailability {
  userId: string;
  availableHours: string[];
}

export interface TimelineStint {
  id: string;
  driverUserId: string | null;
  driverLabel: string | null;
  startMs: number | null;
  durationMinutes: number;
}

const NICE_STEP_MINUTES = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440];
const HOUR_MS = 3_600_000;
/** setTimeout's maximum delay (about 24.8 days) — longer waits are clamped and simply re-armed. */
const MAX_TIMEOUT_MS = 2_147_483_647;

function pickTickStepMinutes(totalMinutes: number): number {
  const target = totalMinutes / 8;
  return NICE_STEP_MINUTES.find((step) => step >= target) ?? NICE_STEP_MINUTES[NICE_STEP_MINUTES.length - 1];
}

/** 24-hour "HH:MM" local time — the shared hand-built formatter, no per-call Intl objects. */
function formatTime(ms: number): string {
  return formatClock(new Date(ms));
}

function formatRange(startMs: number, durationMinutes: number): string {
  return `${formatTime(startMs)} – ${formatTime(startMs + durationMinutes * 60_000)} (${Math.round(durationMinutes)}m)`;
}

interface AvailabilitySegment {
  key: number;
  leftPct: number;
  widthPct: number;
  title: string;
}

/** The hours a driver marked, as the fewest possible strips: contiguous hours (and overlaps) merge
 * into one segment with one title ("Available 17:00 – 21:00"), clamped to the visible race window. */
function buildAvailabilitySegments(
  availableHours: string[],
  raceStartMs: number,
  timelineEndMs: number,
  totalSpanMinutes: number,
): AvailabilitySegment[] {
  const spans: [number, number][] = [];
  for (const iso of availableHours) {
    const hourStartMs = Date.parse(iso);
    if (Number.isNaN(hourStartMs)) continue;
    const from = Math.max(hourStartMs, raceStartMs);
    const to = Math.min(hourStartMs + HOUR_MS, timelineEndMs);
    if (to > from) spans.push([from, to]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of spans) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged.map(([from, to]) => ({
    key: from,
    leftPct: ((from - raceStartMs) / 60_000 / totalSpanMinutes) * 100,
    widthPct: ((to - from) / 60_000 / totalSpanMinutes) * 100,
    title: `Available ${formatTime(from)} – ${formatTime(to)}`,
  }));
}

/** The red "Live" marker. It owns its clock so that moving it never re-renders the lanes; it only
 * ticks while the race is running (sleeping until the start before it, and stopping after the end),
 * and pauses while the tab is hidden. One pixel of travel takes tens of seconds, so the period is
 * derived from the timeline's length rather than a fixed 15 s. */
function NowLine({ raceStartMs, totalSpanMinutes }: { raceStartMs: number; totalSpanMinutes: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const endMs = raceStartMs + totalSpanMinutes * 60_000;
  const periodMs = Math.min(60_000, Math.max(5_000, (totalSpanMinutes * 60_000) / 1_500));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const t = Date.now();
      setNowMs(t);
      if (t >= endMs || isPageHidden()) return; // finished, or resumed by the page-activity listener
      const delay = t < raceStartMs ? raceStartMs - t + 50 : periodMs;
      timer = setTimeout(tick, Math.min(delay, MAX_TIMEOUT_MS));
    };
    tick();
    const unsubscribe = subscribeToPageActivity(tick);
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [raceStartMs, endMs, periodMs]);

  const nowPct = ((nowMs - raceStartMs) / 60_000 / totalSpanMinutes) * 100;
  if (!(nowPct >= 0 && nowPct <= 100)) return null;
  // "Now" marker across the weather row and every lane. The grid's left column is 110px +
  // a 10px gap, so the line sits that far in plus nowPct of the remaining width; the bottom
  // offset stops it above the time-axis labels.
  return (
    <div
      aria-hidden="true"
      title={`Now · ${formatTime(nowMs)}`}
      className="pointer-events-none absolute z-10 w-0.5 bg-w2w-red"
      style={{ left: `calc(120px + (100% - 120px) * ${nowPct / 100})`, top: 0, bottom: 22, transform: 'translateX(-1px)' }}
    >
      <span className="absolute top-0 left-1/2 -translate-x-1/2 whitespace-nowrap bg-w2w-red px-1.5 py-px text-[10px] font-extrabold uppercase text-on-accent">
        Live
      </span>
    </div>
  );
}

/** A horizontal, per-driver Gantt-style view of the stint plan — a rain-chance row, then one
 * track per driver with a colored bar (numbered by stint) for each of their stints and a time
 * axis along the bottom, so the whole race's driver handoff pattern reads at a glance.
 *
 * Memoised: pass referentially stable props (the plan page memoises them). `nowMs` only drives the
 * "live" ring / completed styling of the bars, so the page supplies its boundary-driven clock
 * (it changes when a stint starts or ends, not every few seconds); the moving "Live" marker has
 * its own clock inside NowLine. */
function StintTimeline({
  stints,
  raceStartMs,
  raceLengthMinutes,
  nowMs,
  weatherPoints,
  driverAvailability,
  driverColorIds,
}: {
  stints: TimelineStint[];
  raceStartMs: number | null;
  raceLengthMinutes: number;
  /** Current time as last evaluated by the page — see the component comment. */
  nowMs: number;
  /** Hourly forecast, same list the Strategy table's Weather column samples from — rendered as a
   * rain-chance bar per hour in the Weather row. Omitted (no iRacing series link) leaves the row empty. */
  weatherPoints?: WeatherForecastPoint[];
  /** When given, the legend gets a "Availability" toggle that draws a thin strip under each
   * driver's lane showing the hours they marked as available. */
  driverAvailability?: TimelineDriverAvailability[];
  /** The ids colours are assigned from (the team's whole roster plus stint drivers) — pass the
   * same list the Strategy table uses so a driver has one fixed colour in both places. Falls back
   * to the drivers that have stints. */
  driverColorIds?: string[];
}) {
  const [showAvailability, setShowAvailability] = useState(true);

  // Everything that only depends on the plan itself (not on the clock): the axis, ticks, weather
  // bars and per-lane bar geometry. Recomputed only when the plan or forecast changes.
  const layout = useMemo(() => {
    if (stints.length === 0 || raceStartMs === null) return null;

    const plannedEndMs = stints.reduce((latest, s) => {
      if (s.startMs === null) return latest;
      return Math.max(latest, s.startMs + s.durationMinutes * 60_000);
    }, raceStartMs);
    const targetEndMs = raceStartMs + raceLengthMinutes * 60_000;
    const timelineEndMs = Math.max(plannedEndMs, targetEndMs);
    const totalSpanMinutes = Math.max((timelineEndMs - raceStartMs) / 60_000, 1);

    const stepMinutes = pickTickStepMinutes(totalSpanMinutes);
    const ticks: { pct: number; label: string }[] = [];
    for (let m = 0; m <= totalSpanMinutes + 0.01; m += stepMinutes) {
      ticks.push({ pct: (m / totalSpanMinutes) * 100, label: formatTime(raceStartMs + m * 60_000) });
    }

    // Driver colors come from the shared roster-based order (lib/driverColors), so the same driver
    // always gets the same color in both the table and here; an "Unassigned" row is drawn last.
    const driverColorOrder = orderedDriverIds([...(driverColorIds ?? []).map((id) => ({ driverUserId: id })), ...stints]);
    const rowOrder: (string | null)[] = [...driverIdsInStintOrder(stints)];
    if (stints.some((s) => s.driverUserId === null)) rowOrder.push(null);

    // Same x-axis as everything else here (percent of totalSpanMinutes from raceStartMs) so the
    // Weather row's bars line up exactly under the ticks/stint bars. Each point is an hourly bucket
    // (see WeatherForecastPoint) — one bar per hour whose height is the chance of rain, with the
    // exact reading as its tooltip, same as the Weather column's own text.
    const sortedWeather = [...(weatherPoints ?? [])].sort((a, b) => a.time_offset - b.time_offset);
    const weatherBands = sortedWeather
      .map((point, i) => {
        const nextOffset = sortedWeather[i + 1]?.time_offset ?? point.time_offset + 60;
        const bandStart = Math.max(point.time_offset, 0);
        const bandEnd = Math.min(nextOffset, point.time_offset + 60, totalSpanMinutes);
        if (bandEnd <= bandStart) return null;
        return {
          key: point.index,
          leftPct: (bandStart / totalSpanMinutes) * 100,
          widthPct: ((bandEnd - bandStart) / totalSpanMinutes) * 100,
          chancePct: Math.max(0, Math.min(100, point.precip_chance / 100)),
          title: `${formatTime(raceStartMs + bandStart * 60_000)} · ${Math.round(point.air_temp / 100)}°C · ${Math.round(point.precip_chance / 100)}% rain`,
        };
      })
      .filter((band): band is NonNullable<typeof band> => band !== null);

    const stintNumbers = new Map(stints.map((s, i) => [s.id, i + 1]));
    const lanes = rowOrder.map((driverUserId) => {
      const driverStints = stints.filter((s) => s.driverUserId === driverUserId);
      return {
        driverUserId,
        color: getDriverColor(driverUserId, driverColorOrder),
        label: driverUserId === null ? 'Unassigned' : (driverStints[0]?.driverLabel ?? 'Unknown driver'),
        bars: driverStints.flatMap((s) => {
          if (s.startMs === null) return [];
          return [
            {
              id: s.id,
              number: stintNumbers.get(s.id),
              startMs: s.startMs,
              endMs: s.startMs + s.durationMinutes * 60_000,
              leftPct: ((s.startMs - raceStartMs) / 60_000 / totalSpanMinutes) * 100,
              widthPct: Math.max((s.durationMinutes / totalSpanMinutes) * 100, 0.4),
              title: formatRange(s.startMs, s.durationMinutes),
            },
          ];
        }),
      };
    });

    return { raceStartMs, timelineEndMs, totalSpanMinutes, ticks, weatherBands, lanes };
  }, [stints, raceStartMs, raceLengthMinutes, weatherPoints, driverColorIds]);

  // Merged availability strips per driver — independent of the clock and of the toggle.
  const availabilityByDriver = useMemo(() => {
    const byDriver = new Map<string, { unrestricted: boolean; segments: AvailabilitySegment[] }>();
    if (!layout) return byDriver;
    for (const d of driverAvailability ?? []) {
      byDriver.set(d.userId, {
        unrestricted: d.availableHours.length === 0,
        segments:
          d.availableHours.length === 0
            ? []
            : buildAvailabilitySegments(d.availableHours, layout.raceStartMs, layout.timelineEndMs, layout.totalSpanMinutes),
      });
    }
    return byDriver;
  }, [layout, driverAvailability]);

  if (!layout) {
    return (
      <section aria-labelledby="tl-title" className="cut bg-ds-panel px-[22px] py-5 flex flex-col gap-3.5">
        <h2 id="tl-title" className="h2">
          Timeline
        </h2>
        <p className="text-ds-muted text-[13px]">
          {raceStartMs === null ? "Pick this team's timeslot to see the timeline." : 'No stints planned yet.'}
        </p>
      </section>
    );
  }

  const { totalSpanMinutes, ticks, weatherBands, lanes } = layout;
  const hasAvailability = (driverAvailability?.length ?? 0) > 0;
  const nowPctForStints = ((nowMs - layout.raceStartMs) / 60_000 / totalSpanMinutes) * 100;
  const isNowInRange = nowPctForStints >= 0 && nowPctForStints <= 100;

  return (
    <section aria-labelledby="tl-title" className="cut bg-ds-panel px-[22px] py-5 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="tl-title" className="h2">
          Timeline
        </h2>
        <div className="flex flex-wrap gap-4 text-xs text-ds-muted">
          {lanes.map((lane) => (
            <span key={lane.driverUserId ?? 'unassigned'} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 shrink-0 ${lane.color.bar}`} aria-hidden="true" />
              {lane.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 shrink-0 bg-[#38bdf8] opacity-60" aria-hidden="true" />
            Rain chance
          </span>
          {hasAvailability && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={showAvailability}
                onChange={(e) => setShowAvailability(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-w2w-red)]"
              />
              Availability
            </label>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="relative min-w-[760px] pt-[18px]">
        <NowLine raceStartMs={layout.raceStartMs} totalSpanMinutes={totalSpanMinutes} />
        <div className="grid gap-x-2.5 gap-y-1.5" style={{ gridTemplateColumns: '110px 1fr' }}>
          <span className="self-end text-xs font-semibold text-ds-muted">Weather</span>
          <div className="relative h-[34px]">
            {weatherBands.length === 0 && (
              <span className="absolute inset-0 flex items-center text-xs text-ds-dim">No forecast linked to this event</span>
            )}
            {weatherBands.map((band) => (
              <span
                key={band.key}
                title={band.title}
                className="absolute bottom-0 bg-[#38bdf8]"
                style={{
                  left: `${band.leftPct}%`,
                  width: `calc(${band.widthPct}% - 2px)`,
                  height: `${Math.max(3, Math.round((band.chancePct / 100) * 34))}px`,
                  opacity: band.chancePct >= 50 ? 0.85 : 0.45,
                }}
              />
            ))}
            {weatherBands.length > 1 && (
              // Rain-chance line through the tops of the bars, so the trend reads at a glance.
              <svg
                aria-hidden="true"
                viewBox="0 0 100 34"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              >
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  points={weatherBands
                    .map((band) => {
                      const x = band.leftPct + band.widthPct / 2;
                      const y = 34 - Math.max(3, Math.round((band.chancePct / 100) * 34));
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              </svg>
            )}
          </div>

          {lanes.map((lane) => {
            const availability = lane.driverUserId === null ? undefined : availabilityByDriver.get(lane.driverUserId);
            const showUnrestricted = showAvailability && availability?.unrestricted === true;
            return (
              <Fragment key={lane.driverUserId ?? 'unassigned'}>
                <span className="self-start pt-[7px] text-[13px] font-bold truncate">{lane.label}</span>
                <div className="flex flex-col gap-1">
                <div className="relative h-8 bg-ds-field">
                  {lane.bars.map((bar) => {
                    const isActive = isNowInRange && nowMs >= bar.startMs && nowMs < bar.endMs;
                    const isCompleted = nowMs >= bar.endMs;
                    return (
                      <div
                        key={bar.id}
                        title={`${bar.title}${isCompleted ? ' · Completed' : ''}`}
                        className={`absolute top-[3px] bottom-[3px] overflow-hidden flex items-center justify-center num text-[13px] text-[#111113] ${lane.color.bar} ${
                          isActive ? 'shadow-[inset_0_0_0_2px_#ffffff]' : ''
                        } ${isCompleted ? 'opacity-40' : ''}`}
                        style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                      >
                        <span className="relative">{bar.number}</span>
                        {isCompleted && (
                          <div
                            className="absolute inset-0"
                            style={{
                              backgroundImage:
                                'repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0, rgba(0,0,0,0.35) 2px, transparent 2px, transparent 6px)',
                            }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {showAvailability && availability !== undefined && (
                  <div
                    className="relative h-1.5 bg-ds-field"
                    role="img"
                    aria-label={`${lane.label} availability${showUnrestricted ? ': no hours set, treated as always available' : ''}`}
                    title={showUnrestricted ? 'No hours set — treated as available all race' : undefined}
                  >
                    {showUnrestricted && <span className={`absolute inset-0 opacity-25 ${lane.color.bar}`} />}
                    {availability.segments.map((seg) => (
                      <span
                        key={seg.key}
                        title={seg.title}
                        className={`absolute inset-y-0 opacity-70 ${lane.color.bar}`}
                        style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                      />
                    ))}
                  </div>
                )}
                </div>
              </Fragment>
            );
          })}

          <span aria-hidden="true" />
          <div className="relative h-4">
            {ticks.map((t, i) => {
              // The first/last tick would otherwise center its label right on the box edge,
              // bleeding half the text out of the container — anchor those two inward instead.
              const translateX = i === 0 ? '0%' : i === ticks.length - 1 ? '-100%' : '-50%';
              return (
                <span
                  key={i}
                  className="absolute top-0 text-xs font-semibold text-ds-dim tabular-nums whitespace-nowrap"
                  style={{ left: `${t.pct}%`, transform: `translateX(${translateX})` }}
                >
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

export default memo(StintTimeline);
