import { Fragment, useEffect, useState } from 'react';
import { getDriverColor, orderedDriverIds } from '../lib/driverColors';
import type { WeatherForecastPoint } from '../types/iracingWeatherForecast';

export interface TimelineStint {
  id: string;
  driverUserId: string | null;
  driverLabel: string | null;
  startMs: number | null;
  durationMinutes: number;
}

/** Smooth curve through `points` (Catmull-Rom converted to cubic Bezier segments, tension 1/6) —
 * the same visual "monotone-ish" area-chart feel as WeatherForecastChart's Recharts line, without
 * pulling in a charting library for what's just a background layer here. */
function smoothLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

const HOUR_MS = 3_600_000;

const NICE_STEP_MINUTES = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440];

function pickTickStepMinutes(totalMinutes: number): number {
  const target = totalMinutes / 8;
  return NICE_STEP_MINUTES.find((step) => step >= target) ?? NICE_STEP_MINUTES[NICE_STEP_MINUTES.length - 1];
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatRange(startMs: number, durationMinutes: number): string {
  return `${formatTime(startMs)} – ${formatTime(startMs + durationMinutes * 60_000)} (${Math.round(durationMinutes)}m)`;
}

/** A horizontal, per-driver Gantt-style view of the stint plan — a time axis across the top, a
 * pit-stop tick row, then one track per driver with a colored bar for each of their stints, so
 * the whole race's driver handoff pattern reads at a glance. */
export default function StintTimeline({
  stints,
  raceStartMs,
  raceLengthMinutes,
  driverAvailability = {},
  weatherPoints = [],
}: {
  stints: TimelineStint[];
  raceStartMs: number | null;
  raceLengthMinutes: number;
  /** userId -> the on-the-hour ISO timestamps they marked available (EventSignup.availableHours)
   * — drawn as a thin strip under that driver's stint track. Omitted entirely for "Unassigned". */
  driverAvailability?: Record<string, string[]>;
  /** Hourly forecast, same list the Strategy table's Weather column samples from — rendered as a
   * faint rain-chance tint behind the whole chart. Omitted (no iRacing series link) draws nothing. */
  weatherPoints?: WeatherForecastPoint[];
}) {
  const [showWeather, setShowWeather] = useState(true);
  const [showLiveTime, setShowLiveTime] = useState(true);

  // Drives the live "now" marker below — a plain interval rather than reacting to prop changes,
  // since nothing about the schedule itself needs to change for the line to keep moving. Ticks
  // every second and the marker's `left` has a CSS transition, so it visibly glides rather than
  // jumping in coarse steps (over a multi-hour timeline, a single-pixel-scale hop every 30s reads
  // as "stuck" even though it's technically updating). Browsers throttle setInterval in background
  // tabs — sometimes down to once a minute — so also force a fresh read on both signals for
  // "the user came back": `visibilitychange` (switched tabs, or un-minimized the window) and
  // `focus` (alt-tabbed back from another app entirely — e.g. after changing the OS clock — which
  // does NOT change tab visibility, since the browser window/tab was never hidden or minimized).
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

  if (stints.length === 0 || raceStartMs === null) {
    return (
      <p className="text-white/65 text-sm">
        {raceStartMs === null ? "Pick this team's timeslot to see the timeline." : 'No stints planned yet.'}
      </p>
    );
  }

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

  // Driver colors assigned in order of first appearance (shared with the Strategy table via
  // lib/driverColors so the same driver always gets the same color in both places); an
  // "Unassigned" row is always drawn last.
  const driverColorOrder = orderedDriverIds(stints);
  const rowOrder: (string | null)[] = [...driverColorOrder];
  if (stints.some((s) => s.driverUserId === null)) rowOrder.push(null);

  const pitStopPcts = stints
    .slice(0, -1)
    .map((s) => (s.startMs !== null ? ((s.startMs + s.durationMinutes * 60_000 - raceStartMs) / 60_000 / totalSpanMinutes) * 100 : null))
    .filter((pct): pct is number => pct !== null);

  // Same x-axis as everything else here (percent of totalSpanMinutes from raceStartMs) so the
  // curve lines up exactly under the ticks/stint bars — y is percent chance of rain, inverted
  // since SVG's y grows downward (0% rain sits on the baseline, 100% at the top). Points are left
  // unclamped on purpose: the <svg>'s own default overflow:hidden clips anything outside the
  // [0,100] viewBox, which lets the curve's shape near the edges still be informed by whatever
  // real data lies just outside the visible race window instead of an artificially flattened end.
  const sortedWeather = [...weatherPoints].sort((a, b) => a.time_offset - b.time_offset);
  const curvePoints = sortedWeather.map((p) => ({
    x: (p.time_offset / totalSpanMinutes) * 100,
    y: 100 - Math.max(0, Math.min(100, p.precip_chance / 100)),
  }));
  const rainLinePath = smoothLinePath(curvePoints);
  const rainAreaPath =
    curvePoints.length > 0
      ? `${rainLinePath} L ${curvePoints[curvePoints.length - 1].x.toFixed(2)} 100 L ${curvePoints[0].x.toFixed(2)} 100 Z`
      : '';

  // Each point is an hourly bucket (see WeatherForecastPoint) — an invisible hit-target spanning
  // that hour so hovering anywhere along the curve shows the exact reading, same as the Weather
  // column's own tooltip-equivalent text.
  const weatherHoverBands = sortedWeather
    .map((point, i) => {
      const nextOffset = sortedWeather[i + 1]?.time_offset ?? point.time_offset + 60;
      const bandStart = Math.max(point.time_offset, 0);
      const bandEnd = Math.min(nextOffset, point.time_offset + 60, totalSpanMinutes);
      if (bandEnd <= bandStart) return null;
      return {
        key: point.index,
        leftPct: (bandStart / totalSpanMinutes) * 100,
        widthPct: ((bandEnd - bandStart) / totalSpanMinutes) * 100,
        title: `${formatTime(raceStartMs + bandStart * 60_000)} · ${Math.round(point.air_temp / 100)}°C · ${Math.round(point.precip_chance / 100)}% rain`,
      };
    })
    .filter((band): band is NonNullable<typeof band> => band !== null);

  const nowPct = ((nowMs - raceStartMs) / 60_000 / totalSpanMinutes) * 100;
  const isNowInRange = nowPct >= 0 && nowPct <= 100;

  return (
    <div className="border border-white/10 bg-w2w-charcoal">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-4">
        <p className="font-heading text-xs tracking-[0.15em] text-white/65 uppercase">Stint Timeline</p>
        <div className="flex items-center gap-4">
          {isNowInRange && (
            <label className="flex items-center gap-1.5 text-[11px] text-white/65 cursor-pointer">
              <input type="checkbox" checked={showLiveTime} onChange={(e) => setShowLiveTime(e.target.checked)} />
              Live Time
            </label>
          )}
          {curvePoints.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-white/65 cursor-pointer">
              <input type="checkbox" checked={showWeather} onChange={(e) => setShowWeather(e.target.checked)} />
              Rain Chance
            </label>
          )}
        </div>
      </div>
      <div className="relative grid overflow-hidden" style={{ gridTemplateColumns: '120px 1fr', zIndex: 0 }}>
          {showWeather && curvePoints.length > 0 && (
            <div className="absolute inset-y-0" style={{ left: '120px', right: 0, zIndex: -1 }}>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="w-full h-full"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="stint-timeline-rain-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path d={rainAreaPath} fill="url(#stint-timeline-rain-fill)" stroke="none" />
                <path
                  d={rainLinePath}
                  fill="none"
                  stroke="#3B82F6"
                  strokeOpacity={0.6}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {weatherHoverBands.map((band) => (
                <div
                  key={band.key}
                  title={band.title}
                  className="absolute inset-y-0"
                  style={{ left: `${band.leftPct}%`, width: `${band.widthPct}%` }}
                />
              ))}
            </div>
          )}
          {showLiveTime && isNowInRange && (
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: '120px', right: 0, zIndex: 10 }} aria-hidden="true">
              <div
                className="absolute inset-y-0 w-px bg-w2w-red pointer-events-auto transition-[left] duration-300 ease-linear"
                style={{ left: `${nowPct}%` }}
                title={`Live Time — ${formatTime(nowMs)}`}
              >
                <span className="absolute top-0.5 -translate-x-1/2 px-1 py-px bg-w2w-black text-w2w-red text-[9px] font-heading font-bold uppercase tracking-wide rounded-sm whitespace-nowrap">
                  Live
                </span>
              </div>
            </div>
          )}
          <div />
          <div className="relative h-7 border-b border-white/10">
            {ticks.map((t, i) => {
              // The first/last tick would otherwise center its label right on the box edge,
              // bleeding half the text out of the container — anchor those two inward instead.
              const translateX = i === 0 ? '0%' : i === ticks.length - 1 ? '-100%' : '-50%';
              return (
                <span
                  key={i}
                  className="absolute top-1 text-[10px] text-white/40 whitespace-nowrap"
                  style={{ left: `${t.pct}%`, transform: `translateX(${translateX})` }}
                >
                  {t.label}
                </span>
              );
            })}
          </div>

          <div className="flex items-center px-3 py-2 text-[11px] text-white/50 border-b border-white/5">Pit Stops</div>
          <div className="relative h-8 border-b border-white/5">
            {pitStopPcts.map((pct, i) => (
              <div
                key={i}
                className="absolute top-1/2 -translate-y-1/2 w-px h-4 bg-w2w-red/60"
                style={{ left: `${pct}%` }}
                aria-hidden="true"
              />
            ))}
          </div>

          {rowOrder.map((driverUserId) => {
            const color = getDriverColor(driverUserId, driverColorOrder);
            const label = driverUserId === null ? 'Unassigned' : (stints.find((s) => s.driverUserId === driverUserId)?.driverLabel ?? 'Unknown driver');
            const driverStints = stints.filter((s) => s.driverUserId === driverUserId);
            const availableHours = driverUserId !== null ? (driverAvailability[driverUserId] ?? []) : [];
            return (
              <Fragment key={driverUserId ?? 'unassigned'}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} aria-hidden="true" />
                  <span className="text-xs text-white/80 truncate">{label}</span>
                </div>
                <div className="border-b border-white/5">
                  <div className="relative h-10">
                    {driverStints.map((s) => {
                      if (s.startMs === null) return null;
                      const leftPct = ((s.startMs - raceStartMs) / 60_000 / totalSpanMinutes) * 100;
                      const widthPct = Math.max((s.durationMinutes / totalSpanMinutes) * 100, 0.4);
                      const stintEndMs = s.startMs + s.durationMinutes * 60_000;
                      const isActive = isNowInRange && nowMs >= s.startMs && nowMs < stintEndMs;
                      const isCompleted = nowMs >= stintEndMs;
                      return (
                        <div
                          key={s.id}
                          title={`${formatRange(s.startMs, s.durationMinutes)}${isCompleted ? ' · Completed' : ''}`}
                          className={`absolute top-1.5 bottom-1.5 rounded-sm ${color.bar} ${
                            isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-w2w-charcoal' : ''
                          } ${isCompleted ? 'opacity-40' : ''}`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        >
                          {isCompleted && (
                            <div
                              className="absolute inset-0 rounded-sm"
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
                  {driverUserId !== null && (
                    <div className="relative h-2 mb-1.5 bg-white/5" title="Marked availability">
                      {availableHours.map((iso) => {
                        const hourMs = new Date(iso).getTime();
                        if (hourMs + HOUR_MS <= raceStartMs || hourMs >= timelineEndMs) return null;
                        const leftPct = ((hourMs - raceStartMs) / 60_000 / totalSpanMinutes) * 100;
                        const widthPct = (60 / totalSpanMinutes) * 100;
                        return (
                          <div
                            key={iso}
                            className={`absolute inset-y-0 opacity-40 ${color.bar}`}
                            style={{ left: `${Math.max(leftPct, 0)}%`, width: `${widthPct}%` }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
    </div>
  );
}
