import { memo } from 'react';
import { formatLapTime } from '../lib/lapTime';
import { formatLapSeconds, lapAxisTicks, type LapScatterModel } from '../lib/lapScatter';

const X0 = 50;
const X1 = 990;
const Y_TOP = 20;
const Y_BOTTOM = 200;

/** Lap-time scatter across the whole race, one square per plotted lap coloured by driver.
 * Hand-rolled SVG like LapTimeBoxPlot; native <title> elements give hover tooltips. */
function LapScatterChart({
  model,
  driverColors,
}: {
  model: LapScatterModel;
  /** Shared per-race driver colours (see buildDriverColorMap()). */
  driverColors: Map<number, string>;
}) {
  const { points, totalLaps } = model;
  const times = points.map((p) => p.lapTimeMs);
  const ticks = lapAxisTicks(Math.min(...times), Math.max(...times));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const span = Math.max(1, hi - lo);

  const x = (lap: number) => X0 + ((lap - 1) / Math.max(1, totalLaps - 1)) * (X1 - X0);
  const y = (ms: number) => Y_BOTTOM - ((ms - lo) / span) * (Y_BOTTOM - Y_TOP);
  const round = (n: number) => Math.round(n * 10) / 10;

  const axisText = { fill: 'var(--color-chart-axis)', fontSize: 12, fontWeight: 600 } as const;

  return (
    <svg
      viewBox="0 0 1000 240"
      role="img"
      aria-label={`Lap time scatter across ${totalLaps} laps, coloured by driver`}
      className="block h-auto w-full"
    >
      {ticks.map((t, i) => (
        <g key={t}>
          <line
            x1={X0}
            x2={X1}
            y1={y(t)}
            y2={y(t)}
            stroke={i === 0 ? 'var(--color-chart-axis-line)' : 'var(--color-chart-grid)'}
          />
          <text x={42} y={y(t) + 4} textAnchor="end" {...axisText}>
            {formatLapSeconds(t)}
          </text>
        </g>
      ))}
      <text x={X0} y={228} {...axisText}>
        Lap 1
      </text>
      {totalLaps > 2 && (
        <text x={(X0 + X1) / 2} y={228} textAnchor="middle" {...axisText}>
          Lap {Math.round(totalLaps / 2)}
        </text>
      )}
      {totalLaps > 1 && (
        <text x={X1} y={228} textAnchor="end" {...axisText}>
          Lap {totalLaps}
        </text>
      )}
      {points.map((p) => (
        <rect
          key={p.lap}
          x={round(x(p.lap) - 3)}
          y={round(y(p.lapTimeMs) - 3)}
          width={6}
          height={6}
          fill={driverColors.get(p.iracingCustId) ?? '#7a8b99'}
        >
          <title>{`Lap ${p.lap} — ${p.displayName} — ${formatLapTime(p.lapTimeMs)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export default memo(LapScatterChart);
