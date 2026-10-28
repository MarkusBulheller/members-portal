import NavIcon from '../NavIcon';
import { barPercent, type RecapBarGroup, type RecapCardModel } from '../../lib/recapCards';
import { monthLong, monthShort } from '../../lib/recapFormat';
import type { RecapStats } from '../../types/recap';

function BarGroup({ group }: { group: RecapBarGroup }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[13px] font-semibold text-ds-muted">{group.heading}</h3>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {group.bars.map((bar, i) => (
          <li key={`${bar.label}-${i}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-ds-ink" title={bar.label}>
                {bar.label}
              </span>
              <span className="num shrink-0 text-sm text-ds-ink-soft">{bar.display}</span>
            </div>
            <div className="h-2 bg-ds-control" aria-hidden="true">
              <div className="h-full bg-w2w-red" style={{ width: `${barPercent(bar.value, group.bars)}%` }} />
            </div>
            {bar.sub && <span className="text-xs text-ds-muted">{bar.sub}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Twelve month columns: race count as bar height, the podium share in the accent colour. */
function MonthSparkline({ months }: { months: RecapStats['byMonth'] }) {
  const max = Math.max(1, ...months.map((m) => m.races));
  const summary = months
    .filter((m) => m.races > 0)
    .map((m) => `${monthLong(m.month)}: ${m.races} ${m.races === 1 ? 'race' : 'races'}`)
    .join(', ');
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[13px] font-semibold text-ds-muted">Races per month</h3>
      <div role="img" aria-label={summary || 'No races'} className="flex h-20 items-end gap-1 sm:gap-1.5">
        {months.map((m) => (
          <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${monthLong(m.month)}: ${m.races}`}>
            <div className="relative w-full bg-ds-control" style={{ height: `${m.races === 0 ? 3 : Math.max(8, (m.races / max) * 100)}%` }}>
              {m.podiums > 0 && (
                <div className="absolute bottom-0 left-0 right-0 bg-w2w-red" style={{ height: `${(m.podiums / m.races) * 100}%` }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1 sm:gap-1.5" aria-hidden="true">
        {months.map((m) => (
          <span key={m.month} className="min-w-0 flex-1 text-center text-[10px] font-semibold text-ds-dim sm:text-[11px]">
            {monthShort(m.month)}
          </span>
        ))}
      </div>
      <span className="text-xs text-ds-muted">Accent share = podium finishes.</span>
    </div>
  );
}

interface Props {
  card: RecapCardModel;
  index: number;
  total: number;
  sharing: boolean;
  /** True while any card is being exported (all share buttons are disabled together). */
  busy: boolean;
  onShare: () => void;
}

/** One "story" card of the recap: a heading, one big accent figure, a short line and a small
 * supporting chart or list. Each is its own labelled section. */
export default function RecapStoryCard({ card, index, total, sharing, busy, onShare }: Props) {
  const headingId = `recap-card-${card.key}`;
  return (
    <section
      aria-labelledby={headingId}
      className="cut-lg flex scroll-mt-4 flex-col gap-5 bg-ds-panel px-[18px] pb-6 pt-5 shadow-[inset_0_-3px_0_var(--color-w2w-red)] sm:gap-6 sm:px-8 sm:pb-8 sm:pt-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="chip chip-sm self-start tabular-nums">
            {index + 1} / {total}
          </span>
          <h2 id={headingId} className="h2">
            {card.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          aria-label={`Share “${card.title}” as an image`}
          className="btn-secondary btn-sm"
        >
          {sharing ? 'Exporting...' : 'Share'}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <p
          className={`num m-0 break-words leading-[1] text-w2w-red-ink ${
            card.big.length > 6 ? 'text-[44px] sm:text-[80px]' : 'text-[64px] sm:text-[104px]'
          }`}
        >
          {card.big}
        </p>
        <p className="m-0 text-base font-bold text-ds-ink sm:text-lg">{card.bigLabel}</p>
        {card.line && <p className="m-0 text-sm text-ds-muted sm:text-[15px]">{card.line}</p>}
      </div>

      {card.stats.length > 0 && (
        <dl className="m-0 grid grid-cols-2 gap-2.5 min-[760px]:grid-cols-4">
          {card.stats.map((s) => (
            <div key={s.label} className="cut-sm flex flex-col gap-0.5 bg-ds-field px-4 py-3.5">
              <dt className="text-[13px] font-semibold text-ds-muted">{s.label}</dt>
              <dd className="num m-0 whitespace-nowrap text-[22px] leading-[1.15] min-[400px]:text-[26px]">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {card.groups.length > 0 && (
        <div className="grid gap-6 min-[760px]:grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          {card.groups.map((group) => (
            <BarGroup key={group.heading} group={group} />
          ))}
          {card.months && <MonthSparkline months={card.months} />}
        </div>
      )}

      {card.awards.length > 0 && (
        <ul className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          {card.awards.map((award) => (
            <li key={award.key} className="cut-sm flex flex-col gap-1 bg-ds-field px-4 pb-4 pt-3.5 shadow-[inset_0_-2px_0_var(--color-w2w-red)]">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ds-muted">
                <NavIcon name="results" className="h-4 w-4 text-w2w-red-ink" />
                {award.title}
              </span>
              <span className="truncate text-base font-extrabold text-ds-ink" title={award.driverName}>
                {award.driverName}
              </span>
              <span className="num text-[22px] leading-[1.15] text-w2w-red-ink">{award.value}</span>
              {award.detail && <span className="text-xs text-ds-muted">{award.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {card.dates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          {card.dates.map((d, i) => (
            <div key={d.label} className="flex items-center gap-2.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-xl font-extrabold text-ds-dim">
                  →
                </span>
              )}
              <div className="cut-sm flex flex-col gap-0.5 bg-ds-field px-4 py-3.5">
                <span className="text-[13px] font-semibold text-ds-muted">{d.label}</span>
                <span className="num text-[22px] leading-[1.15]">{d.value}</span>
                {d.sub && <span className="text-xs text-ds-muted">{d.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
