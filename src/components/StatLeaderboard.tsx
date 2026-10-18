import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

export interface LeaderboardItem {
  key: string;
  name: string;
  value: number;
  href?: string;
}

// Podium medals are the same in both themes (per the design), with dark text on top.
const MEDALS = ['bg-[#e8c34a] text-[#111113]', 'bg-[#c7cbd1] text-[#111113]', 'bg-[#cd8a4e] text-[#111113]'];

/** A ranked list panel for every "most/least X" board on the dashboard: slanted rank tags (top
 * three in podium medal colours), name, italic value. On narrow screens each row also gets a thin
 * magnitude bar under it (as in the mobile design), scaled to the top value; one accent colour
 * throughout since it's a single ranked series, not categories. */
function StatLeaderboard({
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
  const max = useMemo(() => items.reduce((m, item) => Math.max(m, item.value), 1), [items]);

  return (
    <div className="cut bg-ds-panel pt-4 pb-1.5 flex flex-col">
      <p className="px-4 pb-2.5 text-sm font-bold text-ds-ink">{title}</p>
      {items.length === 0 ? (
        <p className="px-4 pb-3 text-[13px] text-ds-muted">{emptyMessage}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {items.map((item, i) => {
            const row = (
              <>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`slant num box-border min-w-[30px] shrink-0 px-1.5 py-0.5 text-center text-xs ${
                      MEDALS[i] ?? 'bg-ds-rank text-ds-ink-soft'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="num text-[15px]">{formatValue(item.value)}</span>
                </div>
                <div className="ml-10 h-1 bg-ds-control sm:hidden" aria-hidden="true">
                  <div className="h-full bg-w2w-red" style={{ width: `${(item.value / max) * 100}%` }} />
                </div>
              </>
            );
            const rowClass = `flex flex-col gap-1.5 border-t border-ds-line px-4 py-2.5 text-[13px] text-ds-ink sm:py-[7px] ${
              i === 0 ? 'font-bold' : ''
            }`;
            return (
              <li key={item.key}>
                {item.href ? (
                  <Link to={item.href} className={`${rowClass} row-hover`}>
                    {row}
                  </Link>
                ) : (
                  <div className={rowClass}>{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default memo(StatLeaderboard);
