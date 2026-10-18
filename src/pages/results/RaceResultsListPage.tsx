import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ImportResultPanel from '../../components/ImportResultPanel';
import Pagination from '../../components/Pagination';
import { PositionPill, formatRaceDate } from '../../components/RaceResultRow';
import { useAuth } from '../../context/AuthContext';
import { raceResultsApi } from '../../lib/api/raceResults';
import type { RaceResultSummary } from '../../types/raceResult';

const GRID =
  'grid grid-cols-[76px_minmax(0,1.5fr)_minmax(0,1.1fr)_112px_70px_70px] items-center gap-x-3 px-5';

const PAGE_SIZE = 10;

type FinishFilter = 'all' | 'podium';

function resultYear(result: RaceResultSummary): number | null {
  return result.startTime ? new Date(result.startTime).getFullYear() : null;
}

export default function RaceResultsListPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [results, setResults] = useState<RaceResultSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [year, setYear] = useState<'all' | number>('all');
  const [finish, setFinish] = useState<FinishFilter>('all');
  const [page, setPage] = useState(1);

  // `?carId=` / `?trackId=` come from the car and track detail pages' "all results" links.
  const carId = searchParams.get('carId');
  const trackId = searchParams.get('trackId');

  useEffect(() => {
    let cancelled = false;
    raceResultsApi
      .list()
      .then((loaded) => {
        if (!cancelled) setResults(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load results.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const result of results ?? []) {
      const y = resultYear(result);
      if (y !== null) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [results]);

  const filtered = useMemo(
    () =>
      (results ?? []).filter((result) => {
        if (carId && result.carId !== carId) return false;
        if (trackId && result.trackId !== trackId) return false;
        if (year !== 'all' && resultYear(result) !== year) return false;
        if (finish === 'podium') {
          const position = result.finishingPositionInClass ?? result.finishingPosition;
          if (position === null || position > 3) return false;
        }
        return true;
      }),
    [results, carId, trackId, year, finish],
  );

  // Names for the dismissible filter chips, taken from any result that matches the id.
  const carName = carId ? (results ?? []).find((r) => r.carId === carId)?.carName : null;
  const trackName = trackId ? (results ?? []).find((r) => r.trackId === trackId)?.trackName : null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function clearParam(name: 'carId' | 'trackId') {
    const next = new URLSearchParams(searchParams);
    next.delete(name);
    setSearchParams(next, { replace: true });
    setPage(1);
  }

  function pickYear(value: 'all' | number) {
    setYear(value);
    setPage(1);
  }

  function pickFinish(value: FinishFilter) {
    setFinish(value);
    setPage(1);
  }

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Results</h1>
          <span className="text-ds-muted">Team race history</span>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            aria-expanded={adding}
            className="btn-primary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add result
          </button>
        )}
      </header>

      {isAdmin && adding && <ImportResultPanel onCancel={() => setAdding(false)} />}

      {results === null && loadError ? (
        <p role="alert" className="text-sm text-ds-danger">
          {loadError}
        </p>
      ) : results === null ? (
        <p className="text-sm text-ds-muted">Loading...</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-ds-muted">
          No results yet.
          {isAdmin ? ' Click "Add result" to import one from iRacing.' : ''}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <div role="group" aria-label="Year" className="seg">
              <button type="button" aria-pressed={year === 'all'} onClick={() => pickYear('all')}>
                All years
              </button>
              {years.map((y) => (
                <button key={y} type="button" aria-pressed={year === y} onClick={() => pickYear(y)}>
                  {y}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Finish" className="seg">
              <button type="button" aria-pressed={finish === 'all'} onClick={() => pickFinish('all')}>
                All finishes
              </button>
              <button type="button" aria-pressed={finish === 'podium'} onClick={() => pickFinish('podium')}>
                Podiums
              </button>
            </div>
            {carId && (
              <span className="chip chip-accent gap-2 pr-2.5">
                {carName ? `Car: ${carName}` : 'Car filter'}
                <button
                  type="button"
                  aria-label="Remove car filter"
                  onClick={() => clearParam('carId')}
                  className="flex size-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-current"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            )}
            {trackId && (
              <span className="chip chip-accent gap-2 pr-2.5">
                {trackName ? `Track: ${trackName}` : 'Track filter'}
                <button
                  type="button"
                  aria-label="Remove track filter"
                  onClick={() => clearParam('trackId')}
                  className="flex size-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-current"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            )}
            <span className="ml-auto text-[13px] text-ds-muted">
              {results.length} result{results.length === 1 ? '' : 's'} imported · showing {filtered.length}
            </span>
          </div>

          <section aria-label="Results" className="cut bg-ds-panel pb-3.5 pt-1.5">
            <div className="overflow-x-auto">
              <div role="table" aria-label="Team results" className="min-w-[860px] text-sm">
                <div role="rowgroup">
                  <div role="row" className={`${GRID} min-h-11 text-[11px] font-bold uppercase text-ds-dim`}>
                    <span role="columnheader">Class</span>
                    <span role="columnheader">Race</span>
                    <span role="columnheader">Car</span>
                    <span role="columnheader">Date</span>
                    <span role="columnheader" className="text-right">Laps</span>
                    <span role="columnheader" className="text-right">Inc</span>
                  </div>
                </div>
                <div role="rowgroup">
                  {pageRows.map((result) => (
                    <div
                      key={result.id}
                      role="row"
                      className={`${GRID} row-hover box-border min-h-[62px] border-t border-ds-line py-2.5`}
                    >
                      <span role="cell">
                        <PositionPill position={result.finishingPositionInClass ?? result.finishingPosition} />
                      </span>
                      <span role="cell" className="min-w-0">
                        <Link
                          to={`/results/${result.id}`}
                          className="group flex flex-col text-ds-ink hover:text-ds-ink"
                        >
                          <span className="font-bold group-hover:text-w2w-red-ink">
                            {result.trackName}
                            {result.trackConfig ? ` — ${result.trackConfig}` : ''}
                          </span>
                          {result.seriesName && <span className="text-xs text-ds-muted">{result.seriesName}</span>}
                        </Link>
                      </span>
                      <span role="cell" className="text-ds-ink-soft">{result.carName ?? 'Unknown car'}</span>
                      <span role="cell" className="whitespace-nowrap text-ds-muted">
                        {formatRaceDate(result.startTime)}
                      </span>
                      <span role="cell" className="num text-right text-base">{result.teamLapsComplete ?? '—'}</span>
                      <span role="cell" className="text-right tabular-nums text-ds-muted">
                        {result.teamIncidents !== null ? `${result.teamIncidents}x` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {filtered.length === 0 && (
              <p className="m-0 border-t border-ds-line px-4 py-8 text-center text-ds-muted">
                No results for that filter.
              </p>
            )}
            <div className="px-5">
              <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
