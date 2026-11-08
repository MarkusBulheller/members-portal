import { useMemo } from 'react';
import { type LoadDriver, computeDrivingLoad, formatHours } from '../lib/drivingLoad';
import type { RecapDriver } from '../types/recap';

/** Hours in the car this season for the people signed up to an event, set side by side: who has
 * carried the team so far and who has hardly driven, and whether the crews are balanced. It's an aid
 * to team building; nothing here changes a crew. The hours come from imported race results. */
export default function DrivingLoadPanel({
  drivers,
  recap,
  year,
  teams,
  teamColors,
}: {
  drivers: LoadDriver[];
  recap: RecapDriver[] | null;
  /** The season the hours are from (the server falls back to the latest season with results). */
  year: number | null;
  teams: { id: string; name: string }[];
  /** A colour per team id, as on the availability grid. */
  teamColors: Record<string, string>;
}) {
  const load = useMemo(() => computeDrivingLoad(drivers, recap ?? [], teams), [drivers, recap, teams]);
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? null;

  return (
    <section aria-labelledby="load-title" className="cut flex flex-col gap-4 bg-ds-panel px-6 py-[22px]">
      <div className="flex flex-col gap-1">
        <h2 id="load-title" className="h2">
          Driving load
        </h2>
        <span className="text-[13px] text-ds-muted">
          Hours in the car{year !== null ? ` in ${year}` : ''} from imported results, to keep the crews fair. Average{' '}
          <span className="num font-bold text-ds-ink">{formatHours(load.averageHours)}</span> per driver.
        </span>
      </div>

      {recap === null ? (
        <p role="status" className="m-0 text-sm text-ds-muted">
          Loading...
        </p>
      ) : load.rows.length === 0 ? (
        <p className="m-0 text-sm text-ds-muted">Nobody has signed up yet.</p>
      ) : (
        <>
          {load.uneven && (
            <p
              role="status"
              className="cut-sm m-0 bg-ds-warn/10 px-3.5 py-3 text-[13px] text-ds-warn shadow-[inset_3px_0_0_var(--color-ds-warn)]"
            >
              The crews are uneven: {load.uneven.highest.name} averages {formatHours(load.uneven.highest.averageHours)} per
              driver, {load.uneven.lowest.name} {formatHours(load.uneven.lowest.averageHours)}.
            </p>
          )}

          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {load.rows.map((row) => {
              const crew = teamName(row.teamId);
              return (
                <li key={row.key} className="grid items-center gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'minmax(120px, 1.2fr) minmax(80px, 2fr) auto' }}>
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {row.teamId && (
                      <span
                        className="h-2.5 w-2.5 shrink-0"
                        style={{ background: teamColors[row.teamId] ?? 'var(--color-ds-dim)' }}
                        title={crew ?? undefined}
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 break-words">{row.name}</span>
                    {crew && <span className="hidden shrink-0 text-xs font-normal text-ds-dim sm:inline">{crew}</span>}
                  </span>
                  <span className="h-2.5 bg-ds-field" role="img" aria-label={`${row.name}: ${formatHours(row.hours)}`}>
                    <span
                      className={`block h-full ${row.flag === 'heavy' ? 'bg-ds-warn' : row.flag === 'light' ? 'bg-ds-dim' : 'bg-w2w-red'}`}
                      style={{ width: `${load.maxHours > 0 ? Math.max(2, Math.round((row.hours / load.maxHours) * 100)) : 0}%` }}
                    />
                  </span>
                  <span className="flex items-center gap-2 justify-self-end whitespace-nowrap text-[13px]">
                    <span className="num font-bold">{formatHours(row.hours)}</span>
                    <span className="text-ds-dim">{row.races} {row.races === 1 ? 'race' : 'races'}</span>
                    {row.flag === 'heavy' && <span className="chip chip-sm chip-warn">Heavy</span>}
                    {row.flag === 'light' && <span className="chip chip-sm chip-muted">Light</span>}
                  </span>
                </li>
              );
            })}
          </ul>

          {load.crews.length > 0 && (
            <p className="m-0 text-[13px] text-ds-muted">
              Per crew (average per driver):{' '}
              {load.crews.map((crew, i) => (
                <span key={crew.teamId}>
                  {i > 0 && ' · '}
                  <span className="font-semibold text-ds-ink-soft">{crew.name}</span> {formatHours(crew.averageHours)}
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  );
}
