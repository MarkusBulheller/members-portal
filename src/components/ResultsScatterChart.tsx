import { memo, useCallback, useMemo } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { useNavigate } from 'react-router-dom';
import type { ResultPoint } from '../types/stats';

interface ChartDatum extends ResultPoint {
  time: number;
}

/** Points get a thin panel-coloured outline so overlapping marks stay distinguishable (the board's 1.5px stroke). */
const POINT_STROKE = { stroke: 'var(--color-ds-panel)', strokeWidth: 1.5 };

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function ResultTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ChartDatum;
  return (
    <div className="cut-xs bg-ds-raised px-3 py-2 text-xs">
      <p className="font-bold text-ds-ink">{point.trackName}</p>
      <p className="text-ds-muted">{point.carName ?? 'Unknown car'}</p>
      <p className="text-ds-muted">
        {point.date ? DATE_FORMAT.format(new Date(point.date)) : '—'} · P
        {point.position}
      </p>
    </div>
  );
}

const PODIUM_FILL = 'var(--color-w2w-red-mark)';
const OTHER_FILL = 'var(--color-chart-muted)';

// Stable shape renderers (module scope) so Recharts doesn't see a new function every render.
// Podiums: accent diamonds; other finishes: small neutral squares (matches the legend).
function PodiumShape(props: { cx?: number; cy?: number }) {
  const x = props.cx ?? 0;
  const y = props.cy ?? 0;
  return <path d={`M${x} ${y - 7.5}L${x + 7.5} ${y}L${x} ${y + 7.5}L${x - 7.5} ${y}Z`} fill={PODIUM_FILL} {...POINT_STROKE} />;
}

function OtherShape(props: { cx?: number; cy?: number }) {
  const x = props.cx ?? 0;
  const y = props.cy ?? 0;
  return <rect x={x - 3.5} y={y - 3.5} width={7} height={7} fill={OTHER_FILL} {...POINT_STROKE} />;
}

const TICK_STYLE = { fill: 'var(--color-chart-axis)', fontSize: 12, fontWeight: 600 };
const MARGIN = { top: 16, right: 16, bottom: 0, left: 0 };
const TOOLTIP_CURSOR = { stroke: 'var(--color-chart-axis-line)' };
const X_AXIS_LINE = { stroke: 'var(--color-chart-axis-line)' };
const formatYear = (t: number) => String(new Date(t).getFullYear());
const formatPosition = (v: number) => `P${v}`;

/** Every imported result plotted by finishing position over time — not a per-driver ranking,
 * just the raw results feed the other leaderboards are built from. Y-axis is reversed (P1 at
 * top) so "up" always reads as "better," matching how a position is normally displayed.
 * Memoised: chart data, ticks and series are derived once per `results` identity. */
function ResultsScatterChart({ results }: { results: ResultPoint[] }) {
  const navigate = useNavigate();

  const chart = useMemo(() => {
    const data: ChartDatum[] = [];
    const podiums: ChartDatum[] = [];
    const others: ChartDatum[] = [];
    let minTime = Infinity;
    let maxTime = -Infinity;
    let maxPosition = 1;
    for (const r of results) {
      if (r.date === null || r.position === null) continue;
      const datum: ChartDatum = { ...r, time: new Date(r.date).getTime() };
      data.push(datum);
      (r.position <= 3 ? podiums : others).push(datum);
      if (datum.time < minTime) minTime = datum.time;
      if (datum.time > maxTime) maxTime = datum.time;
      if (r.position > maxPosition) maxPosition = r.position;
    }
    if (data.length === 0) return null;

    // X-axis labels are whole years (the board's 2023 / 2024 / 2025), placed at each 1 January that
    // falls inside the data's range; a range inside one year falls back to a single label at its start.
    const yearTicks: number[] = [];
    for (let y = new Date(minTime).getFullYear() + 1; ; y++) {
      const t = new Date(y, 0, 1).getTime();
      if (t > maxTime) break;
      yearTicks.push(t);
    }
    if (yearTicks.length === 0) yearTicks.push(minTime);
    return { podiums, others, yearTicks, yDomain: [1, maxPosition] as [number, number] };
  }, [results]);

  const handleClick = useCallback(
    (point: unknown) => {
      const datum = point as ChartDatum;
      navigate(`/results/${datum.id}`);
    },
    [navigate],
  );

  if (!chart) {
    return <p className="text-ds-muted text-sm">No results in this filter.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={MARGIN}>
        <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={chart.yearTicks}
          tickFormatter={formatYear}
          tick={TICK_STYLE}
          axisLine={X_AXIS_LINE}
          tickLine={false}
        />
        <YAxis
          dataKey="position"
          type="number"
          reversed
          domain={chart.yDomain}
          allowDecimals={false}
          tickFormatter={formatPosition}
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={ResultTooltip} cursor={TOOLTIP_CURSOR} />
        {/* Individual points are Recharts-rendered SVG shapes, not real DOM buttons/links, so
            there's no reasonable way to make each dot keyboard-focusable without a full custom
            shape rewrite — accepted as-is since every result here is also reachable, fully
            keyboard-operable, from the Results list page. */}
        {/* Podium finishes in the accent, everything else in a quiet neutral, so the eye lands on
            the results that matter first. Legend lives in the dashboard card header. */}
        <Scatter data={chart.others} fill={OTHER_FILL} cursor="pointer" shape={OtherShape} onClick={handleClick} />
        <Scatter data={chart.podiums} fill={PODIUM_FILL} cursor="pointer" shape={PodiumShape} onClick={handleClick} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export default memo(ResultsScatterChart);
