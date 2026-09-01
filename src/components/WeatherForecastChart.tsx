import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { WeatherForecastPoint } from '../types/iracingWeatherForecast';

interface ChartDatum {
  timeOffsetHours: number;
  rainChance: number;
}

function offsetLabel(hours: number): string {
  const rounded = Math.round(hours);
  if (rounded === 0) return 'Start';
  return `${rounded > 0 ? '+' : ''}${rounded}h`;
}

/** Evenly-spaced tick values for the x-axis, forced to always include 0 (the session's actual
 * start) regardless of where Recharts' own auto-spacing would otherwise land — that tick is the
 * one point on the chart that matters most for race planning. */
function computeTicks(data: ChartDatum[], targetCount = 8): number[] {
  const hours = data.map((d) => d.timeOffsetHours);
  const min = Math.min(...hours);
  const max = Math.min(...hours) === Math.max(...hours) ? Math.min(...hours) + 1 : Math.max(...hours);
  const step = Math.max(1, Math.round((max - min) / targetCount));

  const ticks = new Set<number>([0]);
  for (let t = 0; t <= max; t += step) ticks.add(t);
  for (let t = 0; t >= min; t -= step) ticks.add(t);
  return Array.from(ticks)
    .filter((t) => t >= min && t <= max)
    .sort((a, b) => a - b);
}

// Recharts types its label/dot render-prop argument as `any` (see ImplicitLabelType) since the
// injected props vary by chart type — matching that here rather than fighting the library.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RainValueLabel({ x, y, value }: any) {
  if (x === undefined || y === undefined || !value || value <= 0) return null;
  return (
    <text x={x} y={Number(y) - 8} textAnchor="middle" fontSize={9} fill="#93c5fd">
      {Math.round(value)}%
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RainDot({ cx, cy, payload }: any) {
  if (cx === undefined || cy === undefined) return null;
  const isStart = payload?.timeOffsetHours === 0;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isStart ? 4.5 : 2.5}
      fill={isStart ? '#ff2a1f' : '#3B82F6'}
      stroke={isStart ? '#0a0a0b' : 'none'}
      strokeWidth={isStart ? 1.5 : 0}
    />
  );
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ChartDatum;
  return (
    <div className="bg-w2w-black border border-white/15 px-3 py-2 text-xs">
      <p className="text-white/65">{offsetLabel(datum.timeOffsetHours)}</p>
      <p className="text-white font-semibold">{Math.round(datum.rainChance)}% chance of rain</p>
    </div>
  );
}

/** Chance-of-rain area chart for one race week, from iRacing's own simulated weather forecast.
 * `time_offset` is minutes relative to the session's actual start (0 = green flag) — converted
 * to hours for the x-axis, which Recharts spaces into readable ticks itself (no more manual
 * stride math). precip_chance is fixed-point scaled by x100, like the other numeric fields on
 * this object — see types/iracingWeatherForecast.ts. */
export default function WeatherForecastChart({ points }: { points: WeatherForecastPoint[] }) {
  if (points.length === 0) {
    return <p className="text-white/65 text-sm">No forecast data.</p>;
  }

  const data: ChartDatum[] = points.map((p) => ({
    timeOffsetHours: p.time_offset / 60,
    rainChance: p.precip_chance / 100,
  }));
  const ticks = computeTicks(data);

  return (
    <div>
      <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-2">Chance of Rain</p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
          <ReferenceLine x={0} stroke="#ff2a1f" strokeDasharray="3 3" strokeOpacity={0.6} />
          <XAxis
            dataKey="timeOffsetHours"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={ticks}
            tickFormatter={offsetLabel}
            tick={{ fill: 'var(--color-chart-axis)', fontSize: 10 }}
            axisLine={{ stroke: 'var(--color-chart-axis-line)' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: 'var(--color-chart-axis)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={ChartTooltip} cursor={{ stroke: 'var(--color-chart-axis-line)' }} />
          <Area
            type="monotone"
            dataKey="rainChance"
            stroke="#3B82F6"
            strokeWidth={2}
            fill="url(#rainFill)"
            dot={RainDot}
            activeDot={{ r: 5, fill: '#ff2a1f' }}
            label={RainValueLabel}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
