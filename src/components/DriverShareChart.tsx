import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { TooltipContentProps } from 'recharts';

interface ShareDatum {
  name: string;
  value: number;
  color: string;
}

interface ShareTooltipDatum extends ShareDatum {
  formatted: string;
  percent: number;
}

function ShareTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ShareTooltipDatum;
  return (
    <div className="bg-w2w-black border border-white/15 px-3 py-2 text-xs">
      <p className="text-white font-semibold">{datum.name}</p>
      <p className="text-white/65">
        {datum.formatted} · {datum.percent.toFixed(0)}%
      </p>
    </div>
  );
}

/** A donut chart showing each driver's share of some per-driver total (laps driven, incidents
 * racked up, etc.) — used on RaceResultDetailPage for "Lap Share" and "Incident Share". Colors
 * are passed in per-datum so callers can reuse colorForDriver() and stay visually consistent
 * with the stint timeline on the same page. */
export default function DriverShareChart({
  title,
  data,
  emptyMessage,
  formatValue,
}: {
  title: string;
  data: ShareDatum[];
  emptyMessage: string;
  formatValue: (value: number) => string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-2">{title}</p>
      {total === 0 ? (
        <p className="text-white/65 text-sm">{emptyMessage}</p>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie
                data={data.map((d) => ({ ...d, formatted: formatValue(d.value), percent: (d.value / total) * 100 }))}
                dataKey="value"
                nameKey="name"
                innerRadius={40}
                outerRadius={65}
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={ShareTooltip} />
            </PieChart>
          </ResponsiveContainer>
          <div className="min-w-0 flex-1 space-y-1.5">
            {data
              .slice()
              .sort((a, b) => b.value - a.value)
              .map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-white/70 truncate flex-1">{d.name}</span>
                  <span className="text-white/65 shrink-0">{Math.round((d.value / total) * 100)}%</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
