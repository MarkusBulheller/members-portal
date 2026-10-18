import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { resolveAssetUrl } from '../../lib/api';
import { tracksApi } from '../../lib/api/tracks';
import { formatShortDate } from '../../lib/formatShortDate';
import { trackCategoryLabel } from '../../lib/trackCategory';
import type { Track } from '../../types/track';

const TRACK_PATH =
  'M6 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7';

type SortKey = 'races' | 'recent' | 'name';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'races', label: 'Most raced' },
  { key: 'recent', label: 'Recent' },
  { key: 'name', label: 'A to Z' },
];

function sortTracks(tracks: Track[], sort: SortKey): Track[] {
  const byName = (a: Track, b: Track) => a.name.localeCompare(b.name);
  return tracks.slice().sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (sort === 'recent') {
      // Never-raced tracks sink to the bottom.
      const diff = (b.lastRacedAt ? Date.parse(b.lastRacedAt) : -Infinity) - (a.lastRacedAt ? Date.parse(a.lastRacedAt) : -Infinity);
      return diff !== 0 && !Number.isNaN(diff) ? diff : byName(a, b);
    }
    return (b.raceCount ?? 0) - (a.raceCount ?? 0) || byName(a, b);
  });
}

export default function TracksListPage() {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('races');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    tracksApi
      .list()
      .then((loaded) => {
        if (!cancelled) setTracks(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load tracks.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = search.trim().toLowerCase();
  const visible = sortTracks(
    (tracks ?? []).filter((t) => !needle || `${t.name} ${t.location ?? ''}`.toLowerCase().includes(needle)),
    sort,
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Tracks</h1>
          {tracks !== null && (
            <span className="text-ds-muted">
              {tracks.length} circuit{tracks.length === 1 ? '' : 's'} in the library
            </span>
          )}
        </div>
        {user?.role === 'ADMIN' && (
          <Link to="/tracks/new" className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New track
          </Link>
        )}
      </header>

      {tracks === null && loadError ? (
        <p role="alert" className="text-sm text-ds-danger">
          {loadError}
        </p>
      ) : tracks === null ? (
        <p className="text-ds-muted text-sm">Loading...</p>
      ) : tracks.length === 0 ? (
        <p className="text-ds-muted text-sm">No tracks yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="cut-sm flex h-[42px] max-w-[340px] min-w-0 flex-[1_1_240px] items-center gap-2 bg-ds-panel px-3 text-ds-muted">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <input
                type="search"
                aria-label="Search tracks"
                placeholder="Search tracks or countries"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent text-ds-ink outline-none placeholder:text-ds-dim"
              />
            </div>
            <div role="group" aria-label="Sort" className="seg ml-auto">
              {SORTS.map((s) => (
                <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="cut m-0 bg-ds-panel px-4 py-10 text-center text-ds-muted">No tracks match that search.</p>
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
              {visible.map((track) => {
                const lastRaced = track.lastRacedAt
                  ? formatShortDate(track.lastRacedAt, true).replace(/^[0-9]+ /, '')
                  : null;
                return (
                  <Link
                    key={track.id}
                    to={`/tracks/${track.id}`}
                    className="cut row-hover flex items-center gap-3.5 bg-ds-panel py-3.5 pl-3.5 pr-[18px] text-ds-ink"
                  >
                    <span className="cut-xs flex h-12 w-12 flex-none items-center justify-center overflow-hidden bg-ds-field text-ds-dim">
                      {track.imageUrl ? (
                        <img
                          key={track.imageUrl}
                          src={resolveAssetUrl(track.imageUrl)}
                          alt=""
                          width={48}
                          height={48}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                          <path d={TRACK_PATH} />
                        </svg>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{track.name}</span>
                      <span className="text-xs text-ds-muted">
                        {[trackCategoryLabel(track.category), track.location, lastRaced ? `last raced ${lastRaced}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="flex flex-col items-end leading-[1.1]">
                      <span className="num text-2xl">{track.raceCount ?? 0}</span>
                      <span className="text-xs text-ds-dim">races</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
