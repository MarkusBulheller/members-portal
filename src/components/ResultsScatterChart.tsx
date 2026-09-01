import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { useNavigate } from 'react-router-dom';
import type { ResultPoint } from '../types/stats';

interface ChartDatum extends ResultPoint {
  time: number;
}

function ResultTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ChartDatum;
  return (
    <div className="bg-w2w-black border border-white/15 px-3 py-2 text-xs">
      <p className="text-white font-semibold">{point.trackName}</p>
      <p className="text-white/65">{point.carName ?? 'Unknown car'}</p>
      <p className="text-white/65">
        {point.date ? new Date(point.date).toLocaleDateString() : '—'} · P{point.position}
      </p>
    </div>
  );
}

/** Every imported result plotted by finishing position over time — not a per-driver ranking,
 * just the raw results feed the other leaderboards are built from. Y-axis is reversed (P1 at
 * top) so "up" always reads as "better," matching how a position is normally displayed. */
export default function ResultsScatterChart({ results }: { results: ResultPoint[] }) {
  const navigate = useNavigate();
  const data: ChartDatum[] = results
    .filter((r): r is ResultPoint & { date: string; position: number } => r.date !== null && r.position !== null)
    .map((r) => ({ ...r, time: new Date(r.date).getTime() }));

  if (data.length === 0) {
    return <p className="text-white/65 text-sm">No results in this filter.</p>;
  }

  const maxPosition = Math.max(...data.map((d) => d.position ?? 1));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-chart-grid)" />
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
          tick={{ fill: 'var(--color-chart-axis)', fontSize: 10 }}
          axisLine={{ stroke: 'var(--color-chart-axis-line)' }}
          tickLine={false}
        />
        <YAxis
          dataKey="position"
          type="number"
          reversed
          domain={[1, maxPosition]}
          allowDecimals={false}
          tickFormatter={(v: number) => `P${v}`}
          tick={{ fill: 'var(--color-chart-axis)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={ResultTooltip} cursor={{ stroke: 'var(--color-chart-axis-line)' }} />
        {/* Individual points are Recharts-rendered SVG shapes, not real DOM buttons/links, so
            there's no reasonable way to make each dot keyboard-focusable without a full custom
            shape rewrite — accepted as-is since every result here is also reachable, fully
            keyboard-operable, from the Results list page. */}
        <Scatter
          data={data}
          fill="var(--color-w2w-red)"
          cursor="pointer"
          onClick={(point) => {
            const datum = point as unknown as ChartDatum;
            navigate(`/results/${datum.id}`);
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
