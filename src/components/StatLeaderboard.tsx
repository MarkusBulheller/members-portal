import { Link } from 'react-router-dom';

export interface LeaderboardItem {
  key: string;
  name: string;
  value: number;
  href?: string;
}

/** A ranked horizontal bar list — the standard form for a top-N magnitude comparison (per the
 * dataviz skill's form heuristic), used for every "most/least X" panel on the dashboard. One
 * consistent accent color throughout: these bars aren't a set of categories being compared to
 * each other as parts of a whole (like a pie chart), just a single ranked series, so multiple
 * hues would just be noise. */
export default function StatLeaderboard({
  title,
  items,
  formatValue,
  emptyMessage,
}: {
  title: string;
  items: LeaderboardItem[];
  formatValue: (value: number) => string;
  emptyMessage: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div>
      <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-3">{title}</p>
      {items.length === 0 ? (
        <p className="text-white/65 text-sm">{emptyMessage}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => {
            const row = (
              <div className="flex items-center gap-3">
                <span className="text-white/65 text-xs w-4 shrink-0 text-right">{i + 1}</span>
                <span className="text-white/70 text-sm truncate flex-1 min-w-0">{item.name}</span>
                <div className="flex items-center gap-2 shrink-0 w-28">
                  <div className="h-1.5 bg-white/5 flex-1 overflow-hidden">
                    <div
                      className="h-full bg-w2w-red"
                      style={{ width: `${(item.value / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-white text-xs font-heading tabular-nums w-12 text-right shrink-0">
                    {formatValue(item.value)}
                  </span>
                </div>
              </div>
            );
            return item.href ? (
              <Link
                key={item.key}
                to={item.href}
                className="block -mx-2 px-2 py-1 hover:bg-white/5 transition-colors"
              >
                {row}
              </Link>
            ) : (
              <div key={item.key} className="py-1">
                {row}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
