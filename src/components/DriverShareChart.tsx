import { memo } from 'react';

interface ShareDatum {
  name: string;
  value: number;
  color: string;
}

/** A segmented share bar showing each driver's share of some per-driver total (laps driven,
 * incidents racked up, etc.) — used on RaceResultDetailPage for "Lap Share" and "Incident Share",
 * and on SeriesDetailPage for car usage. Colors are passed in per-datum so callers can reuse
 * colorForDriver() and stay visually consistent with the stint timeline on the same page. Hovering
 * a segment shows its exact value (native title tooltip). */
function DriverShareChart({
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
  const sorted = data.slice().sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-ds-muted">{title}</span>
      {total === 0 ? (
        <p className="m-0 text-sm text-ds-muted">{emptyMessage}</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${title}: ${sorted.map((d) => `${d.name} ${Math.round((d.value / total) * 100)}%`).join(', ')}`}
            className="flex h-4 gap-[3px] px-1"
          >
            {sorted.map((d) => (
              <span
                key={d.name}
                title={`${d.name}: ${formatValue(d.value)} · ${Math.round((d.value / total) * 100)}%`}
                style={{ flex: `${d.value} 1 0`, background: d.color }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ds-ink-soft">
            {sorted.map((d) => (
              <span key={d.name} className="flex min-w-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 flex-none" style={{ background: d.color }} />
                <span className="truncate">
                  {d.name} {Math.round((d.value / total) * 100)}%
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(DriverShareChart);
