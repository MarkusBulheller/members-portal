import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { iracingSeriesApi } from '../../lib/api/iracingSeries';
import { beginIracingSeriesSync } from '../../lib/iracing';
import { seriesAbbreviation } from '../../lib/seriesAbbreviation';
import type { IracingSeriesSeason } from '../../types/iracingSeries';

/** iRacing's license_group (1-5) → the class letter it requires. */
const LICENSE_GROUP_LETTER: Record<number, string> = { 1: 'Rookie', 2: 'D', 3: 'C', 4: 'B', 5: 'A' };

export default function SeriesListPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const justSynced = searchParams.get('synced');
  const [series, setSeries] = useState<IracingSeriesSeason[] | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    iracingSeriesApi
      .list()
      .then((loaded) => {
        if (cancelled) return;
        setSeries(loaded);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load series.');
      });
    return () => {
      cancelled = true;
    };
  }, [justSynced]);

  function handleSync() {
    setSyncing(true);
    setError(null);
    beginIracingSeriesSync().catch((err: unknown) => {
      setSyncing(false);
      setError(err instanceof Error ? `Could not start iRacing sync: ${err.message}` : 'Could not start iRacing sync.');
    });
  }

  const categories = Array.from(new Set((series ?? []).map((s) => s.category).filter((c): c is string => !!c))).sort();

  const archivedCount = (series ?? []).filter((s) => !s.active).length;

  const filtered = (series ?? []).filter((season) => {
    const matchesSearch =
      season.seriesName.toLowerCase().includes(search.toLowerCase()) ||
      (season.category ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === '' || season.category === categoryFilter;
    const matchesArchived = showArchived || season.active;
    return matchesSearch && matchesCategory && matchesArchived;
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Series</h1>
          <span className="text-ds-muted">
            Synced from iRacing. Open a series to see its schedule, weather and the cars people actually run.
          </span>
        </div>
        {user?.role === 'ADMIN' && (
          <button type="button" onClick={handleSync} disabled={syncing} className="btn-primary">
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        )}
      </header>

      {justSynced && (
        <p className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-w2w-red-ink shadow-[inset_3px_0_0_var(--color-w2w-red)]">
          Synced {justSynced} series from iRacing.
        </p>
      )}
      {error && (
        <p className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]">
          {error}
        </p>
      )}

      {series === null && loadError ? (
        <p role="alert" className="text-sm text-ds-danger">
          {loadError}
        </p>
      ) : series === null ? (
        <p className="text-ds-muted text-sm">Loading...</p>
      ) : series.length === 0 ? (
        <p className="text-ds-muted text-sm">
          No series synced yet.
          {user?.role === 'ADMIN' ? ' Click "Sync" to pull the current season from iRacing.' : ''}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="cut-sm flex h-[42px] max-w-[340px] min-w-0 flex-[1_1_240px] items-center gap-2 bg-ds-panel px-3 text-ds-muted">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <input
                type="text"
                aria-label="Search series"
                placeholder="Search series"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent text-ds-ink outline-none placeholder:text-ds-dim"
              />
            </div>
            <div role="group" aria-label="Category" className="seg">
              <button type="button" aria-pressed={categoryFilter === ''} onClick={() => setCategoryFilter('')}>
                All categories
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={categoryFilter === category}
                  onClick={() => setCategoryFilter(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            {archivedCount > 0 && (
              <button
                type="button"
                role="switch"
                aria-checked={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="ml-auto flex min-h-10 cursor-pointer items-center gap-2.5 border-0 bg-transparent px-1 text-[13px] font-semibold text-ds-ink-soft"
              >
                <span
                  className={`relative inline-block h-[22px] w-[42px] flex-none ${showArchived ? 'bg-w2w-red' : 'bg-ds-control-hover'}`}
                >
                  <span
                    className="absolute top-1 h-3.5 w-4 bg-on-accent"
                    style={{
                      left: showArchived ? 22 : 4,
                      clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)',
                    }}
                  />
                </span>
                Show archived seasons
              </button>
            )}
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
            {filtered.map((season) => {
              const letter = season.licenseGroup !== null ? LICENSE_GROUP_LETTER[season.licenseGroup] : undefined;
              return (
                <Link
                  key={season.seasonId}
                  to={`/series/${season.seasonId}`}
                  className={`cut row-hover flex flex-col gap-3.5 bg-ds-panel py-4 pl-4 pr-[18px] pb-[18px] text-ds-ink ${season.active ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="cut-xs flex h-[52px] w-[52px] flex-none items-center justify-center overflow-hidden bg-ds-field">
                      {season.logoUrl ? (
                        <img
                          src={season.logoUrl}
                          alt=""
                          width={52}
                          height={52}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span aria-hidden="true" className="num text-[15px] text-ds-muted">
                          {seriesAbbreviation(season.seriesName)}
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-bold">{season.seriesName}</span>
                      <span className="text-[13px] text-ds-muted">
                        {season.seasonName}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {season.category && <span className="chip chip-sm">{season.category}</span>}
                    {letter && <span className="chip chip-sm">{letter === 'Rookie' ? 'Rookie' : `Class ${letter}`}</span>}
                    {season.official && <span className="chip chip-sm">Official</span>}
                    {season.trackCarUsage && <span className="chip chip-sm chip-accent">Car usage tracked</span>}
                    {!season.active && <span className="chip chip-sm chip-muted">Archived</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
