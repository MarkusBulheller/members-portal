import { formatLapTime } from '../lib/lapTime';
import type { RaceResultLap } from '../types/raceResult';

interface DriverBoxStats {
  custId: number;
  name: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
}

/** Linear interpolation between sorted values — the standard way to compute a quantile that
 * doesn't require the index to land exactly on a data point. */
function quantile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Standard Tukey box plot: whiskers extend to the most extreme lap still within 1.5×IQR of the
 * box, everything further out is plotted as an individual outlier dot. Without this, a single
 * full-course-caution or pit-stop lap (which can be many times longer than a normal lap) would
 * stretch the shared x-axis so far that every driver's actual pace becomes an invisible sliver. */
function computeBoxStats(custId: number, name: string, times: number[]): DriverBoxStats {
  const sorted = [...times].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const withinFence = sorted.filter((t) => t >= lowerFence && t <= upperFence);
  const outliers = sorted.filter((t) => t < lowerFence || t > upperFence);
  return {
    custId,
    name,
    min: withinFence[0] ?? sorted[0],
    q1,
    median,
    q3,
    max: withinFence[withinFence.length - 1] ?? sorted[sorted.length - 1],
    outliers,
  };
}

const LABEL_WIDTH = 130;
const RIGHT_PADDING = 16;
const CHART_WIDTH = 640;
const ROW_HEIGHT = 28;
const ROW_GAP = 8;
const AXIS_HEIGHT = 22;
const TICK_COUNT = 5;

/** Horizontal box-and-whisker plot comparing every driver's lap time distribution in one shared
 * chart — pace consistency at a glance, not just the single best/average lap already shown in
 * the Drivers table. Hand-rolled SVG (Recharts has no box plot primitive); native <title>
 * elements give hover tooltips without any extra interactivity plumbing. */
export default function LapTimeBoxPlot({
  laps,
  driverColors,
}: {
  laps: RaceResultLap[];
  /** Shared with the rest of the page's charts (see RaceResultBody.buildDriverColorMap()) so a
   * driver keeps the same color here as in the timeline/share charts, and no two drivers on the
   * same page ever collide. */
  driverColors: Map<number, string>;
}) {
  const byDriver = new Map<number, { name: string; times: number[] }>();
  for (const lap of laps) {
    if (lap.lapTimeMs === null) continue;
    const entry = byDriver.get(lap.iracingCustId) ?? { name: lap.displayName, times: [] };
    entry.times.push(lap.lapTimeMs);
    byDriver.set(lap.iracingCustId, entry);
  }

  if (byDriver.size === 0) {
    return <p className="text-white/65 text-sm">No lap time data available.</p>;
  }

  const drivers = Array.from(byDriver.entries())
    .map(([custId, { name, times }]) => computeBoxStats(custId, name, times))
    .sort((a, b) => a.median - b.median);

  const allTimes = drivers.flatMap((d) => [d.min, d.max]);
  const domainMin = Math.min(...allTimes);
  const domainMax = Math.max(...allTimes);
  const pad = (domainMax - domainMin) * 0.06 || 1000;
  const rangeStart = domainMin - pad;
  const rangeEnd = domainMax + pad;
  const plotWidth = CHART_WIDTH - LABEL_WIDTH - RIGHT_PADDING;

  const scaleX = (t: number) => LABEL_WIDTH + ((t - rangeStart) / (rangeEnd - rangeStart)) * plotWidth;

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => rangeStart + ((rangeEnd - rangeStart) * i) / (TICK_COUNT - 1));
  const chartHeight = AXIS_HEIGHT + drivers.length * (ROW_HEIGHT + ROW_GAP);

  return (
    <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`} style={{ overflow: 'visible' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={scaleX(t)}
            x2={scaleX(t)}
            y1={AXIS_HEIGHT}
            y2={chartHeight}
            stroke="var(--color-white)"
            strokeOpacity={0.06}
          />
          <text x={scaleX(t)} y={14} textAnchor="middle" fontSize={10} fill="var(--color-white)" fillOpacity={0.4}>
            {formatLapTime(t)}
          </text>
        </g>
      ))}

      {drivers.map((driver, i) => {
        const y = AXIS_HEIGHT + i * (ROW_HEIGHT + ROW_GAP);
        const midY = y + ROW_HEIGHT / 2;
        const color = driverColors.get(driver.custId) ?? '#7a8b99';
        const summary = `${driver.name} — median ${formatLapTime(driver.median)}, IQR ${formatLapTime(driver.q1)}–${formatLapTime(driver.q3)}, range ${formatLapTime(driver.min)}–${formatLapTime(driver.max)}`;

        return (
          <g key={driver.custId}>
            <text
              x={LABEL_WIDTH - 10}
              y={midY}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={12}
              fill="var(--color-white)"
              fillOpacity={0.7}
            >
              {driver.name}
            </text>

            <line x1={scaleX(driver.min)} x2={scaleX(driver.max)} y1={midY} y2={midY} stroke={color} strokeWidth={1.5} />
            <line
              x1={scaleX(driver.min)}
              x2={scaleX(driver.min)}
              y1={midY - 6}
              y2={midY + 6}
              stroke={color}
              strokeWidth={1.5}
            />
            <line
              x1={scaleX(driver.max)}
              x2={scaleX(driver.max)}
              y1={midY - 6}
              y2={midY + 6}
              stroke={color}
              strokeWidth={1.5}
            />

            <rect
              x={scaleX(driver.q1)}
              width={Math.max(1, scaleX(driver.q3) - scaleX(driver.q1))}
              y={y + 4}
              height={ROW_HEIGHT - 8}
              fill={color}
              fillOpacity={0.35}
              stroke={color}
              strokeWidth={1.5}
            >
              <title>{summary}</title>
            </rect>
            <line
              x1={scaleX(driver.median)}
              x2={scaleX(driver.median)}
              y1={y + 4}
              y2={y + ROW_HEIGHT - 4}
              stroke="#0a0a0b"
              strokeWidth={2}
            />
          </g>
        );
      })}
    </svg>
  );
}
