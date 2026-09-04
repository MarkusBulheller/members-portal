import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { iracingSeriesApi } from '../../lib/api/iracingSeries';
import { beginIracingSeriesSync } from '../../lib/iracing';
import type { IracingSeriesSeason } from '../../types/iracingSeries';

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

  useEffect(() => {
    void iracingSeriesApi.list().then(setSeries);
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
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">iRacing</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">Series</h1>
        </div>
        {user?.role === 'ADMIN' && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
          >
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        )}
      </div>

      {justSynced && (
        <p className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">
          Synced {justSynced} series from iRacing.
        </p>
      )}
      {error && (
        <p className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">{error}</p>
      )}

      {series === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : series.length === 0 ? (
        <p className="text-white/65 text-sm">
          No series synced yet.
          {user?.role === 'ADMIN' ? ' Click "Sync" to pull the current season from iRacing.' : ''}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <input
              type="text"
              aria-label="Search series"
              placeholder="Search series..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input max-w-sm"
            />
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                className={`px-3 py-2 font-heading text-xs uppercase tracking-wide transition-colors shrink-0 ${
                  showArchived ? 'bg-w2w-red text-on-accent' : 'bg-w2w-charcoal text-white/65 hover:text-white'
                }`}
              >
                {showArchived ? 'Hide' : 'Show'} Archived ({archivedCount})
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((season) => (
              <Link
                key={season.seasonId}
                to={`/series/${season.seasonId}`}
                className={`bg-w2w-charcoal border border-white/10 hover:border-w2w-red/50 p-5 transition-colors flex items-center gap-4 ${season.active ? '' : 'opacity-60'}`}
              >
                {season.logoUrl ? (
                  <img
                    src={season.logoUrl}
                    alt=""
                    className="h-12 w-12 object-contain bg-black/30 shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 bg-black/30 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-heading font-semibold text-white text-sm truncate">{season.seriesName}</p>
                    {!season.active && (
                      <span className="px-1.5 py-0.5 text-[10px] font-heading uppercase tracking-wide bg-white/10 text-white/65 shrink-0">
                        Archived
                      </span>
                    )}
                  </div>
                  {season.category && <p className="text-white/65 text-xs mt-0.5 uppercase">{season.category}</p>}
                  <p className="text-white/65 text-xs mt-2">
                    {season.schedule.length} race week{season.schedule.length === 1 ? '' : 's'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
