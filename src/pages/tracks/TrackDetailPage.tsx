import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Pagination from '../../components/Pagination';
import { positionLabel } from '../../components/RaceResultRow';
import { useAuth } from '../../context/AuthContext';
import { resolveAssetUrl } from '../../lib/api';
import { eventsApi } from '../../lib/api/events';
import { trackCategoryLabel } from '../../lib/trackCategory';
import { raceResultsApi } from '../../lib/api/raceResults';
import { tracksApi } from '../../lib/api/tracks';
import { formatShortDate } from '../../lib/formatShortDate';
import { formatDuration } from '../../lib/lapTime';
import { usePagination } from '../../lib/usePagination';
import type { RaceResultSummary } from '../../types/raceResult';
import type { RaceEvent } from '../../types/event';
import type { Track, TrackCarSetup } from '../../types/track';

const TRACK_PATH =
  'M6 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7';

/** Position tag colours: podium medals are hardcoded in the design (same in both themes). */
function positionTagClass(position: number | null): string {
  if (position === 1) return 'bg-[#e8c34a] text-[#111113]';
  if (position === 2) return 'bg-[#c7cbd1] text-[#111113]';
  if (position === 3) return 'bg-[#cd8a4e] text-[#111113]';
  return 'bg-ds-control text-ds-ink-soft';
}

export default function TrackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [track, setTrack] = useState<Track | null>(null);
  const [races, setRaces] = useState<RaceResultSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [racesError, setRacesError] = useState<string | null>(null);
  const [events, setEvents] = useState<RaceEvent[] | null>(null);
  const [setups, setSetups] = useState<TrackCarSetup[] | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    tracksApi
      .getById(id)
      .then((loaded) => {
        if (!cancelled) setTrack(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load the track.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    tracksApi
      .listSetups(id)
      .then((loaded) => {
        if (!cancelled) setSetups(loaded);
      })
      .catch(() => {
        if (!cancelled) setSetups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // No per-track events endpoint: the events list is small, so filter it here. A failure only
  // hides the "next event" tile.
  useEffect(() => {
    let cancelled = false;
    eventsApi
      .list()
      .then((loaded) => {
        if (!cancelled) setEvents(loaded);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    raceResultsApi
      .listByTrack(id)
      .then((loaded) => {
        if (!cancelled) setRaces(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRacesError(err instanceof Error ? err.message : 'Failed to load races.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const { page, setPage, totalPages, pageItems: pagedRaces } = usePagination(races);

  if (!track) {
    return loadError ? (
      <p role="alert" className="text-sm text-ds-danger">
        {loadError}
      </p>
    ) : (
      <p className="text-ds-muted text-sm">Loading...</p>
    );
  }

  const classPositions = (races ?? [])
    .map((race) => race.finishingPositionInClass ?? race.finishingPosition)
    .filter((p): p is number => p !== null);
  const bestFinish = classPositions.length > 0 ? Math.min(...classPositions) : null;

  const nextEvent =
    (events ?? [])
      .filter(
        (e) =>
          e.trackId === track.id &&
          (e.status === 'PUBLISHED' || e.status === 'SIGNUPS_CLOSED') &&
          Date.parse(e.startsAt) >= now,
      )
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ds-muted">
        <Link to="/tracks" className="font-semibold text-ds-muted hover:text-ds-ink">
          Tracks
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="min-w-0 truncate font-semibold text-ds-ink">{track.name}</span>
      </nav>

      <header className="cut-lg relative flex flex-wrap overflow-hidden bg-ds-panel">
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 top-0 w-[56px] min-[640px]:w-[150px]"
          style={{
            background:
              'linear-gradient(110deg, transparent 0 28%, var(--color-w2w-red) 28% 40%, transparent 40% 50%, var(--color-w2w-red) 50% 100%)',
          }}
        />
        <div className="flex min-h-[210px] flex-[1_1_300px] flex-col items-center justify-center gap-1.5 bg-ds-sidebar text-[#34343a] [:root[data-theme=light]_&]:text-ds-dim/60">
          {track.imageUrl ? (
            <img
              key={track.imageUrl}
              src={resolveAssetUrl(track.imageUrl)}
              alt=""
              decoding="async"
              className="h-full max-h-[240px] w-full object-contain p-4"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <>
              <svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <path d={TRACK_PATH} />
              </svg>
              <span className="text-xs text-ds-dim">Track map</span>
            </>
          )}
        </div>
        <div className="box-border flex min-w-0 flex-[2_1_420px] flex-col justify-center gap-[18px] py-[26px] pl-7 pr-[72px] min-[640px]:pr-[180px]">
          <div className="flex flex-wrap items-start justify-between gap-3.5">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="chip chip-solid self-start px-3.5 py-[3px]">{trackCategoryLabel(track.category)}</span>
              <h1 className="m-0 text-[40px] font-extrabold leading-[1.05]">{track.name}</h1>
              {track.location && <span className="text-ds-muted">{track.location}</span>}
            </div>
            {user?.role === 'ADMIN' && (
              <Link to={`/tracks/${track.id}/edit`} className="btn-secondary btn-sm !min-h-10 !px-[18px] !text-[13px]">
                Edit
              </Link>
            )}
          </div>
          <dl className="m-0 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[13px] font-semibold text-ds-muted">Races</dt>
              <dd className="num m-0 text-[30px] leading-[1.1]">{races === null ? (track.raceCount ?? '—') : races.length}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[13px] font-semibold text-ds-muted">Best class finish</dt>
              <dd className="m-0 flex min-h-[33px] items-center">
                {bestFinish === null ? (
                  <span className="num text-[30px] leading-[1.1]">—</span>
                ) : (
                  <span
                    className={`chip num min-w-[52px] justify-center px-2.5 py-0.5 text-xl normal-case ${positionTagClass(bestFinish)}`}
                  >
                    {positionLabel(bestFinish)}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[13px] font-semibold text-ds-muted">Next visit</dt>
              <dd className="num m-0 text-[30px] leading-[1.1]">
                {nextEvent ? (
                  <Link to={`/events/${nextEvent.id}`} className="text-ds-ink hover:text-w2w-red-ink" title={nextEvent.title}>
                    {new Date(nextEvent.startsAt).getDate()}{' '}
                    <span className="text-lg text-ds-muted">
                      {formatShortDate(nextEvent.startsAt).replace(/^[0-9]+ /, '')}
                    </span>
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
          {track.notes && <p className="m-0 text-ds-muted">{track.notes}</p>}
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-5">
      <section aria-labelledby="rc-title" className="cut min-w-0 flex-[3_1_520px] bg-ds-panel pb-1.5 pt-5">
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 id="rc-title" className="h2">
            Races here
          </h2>
          {races !== null && races.length > 0 && (
            <Link to={`/results?trackId=${track.id}`} className="text-[13px] font-semibold">
              All {races.length}
            </Link>
          )}
        </div>
        {racesError && races === null ? (
          <p role="alert" className="m-0 px-5 pb-4 text-sm text-ds-danger">
            {racesError}
          </p>
        ) : races === null ? (
          <p className="m-0 px-5 pb-4 text-sm text-ds-muted">Loading...</p>
        ) : races.length === 0 ? (
          <p className="m-0 px-5 pb-4 text-sm text-ds-muted">No race results recorded yet.</p>
        ) : (
          <div>
            {pagedRaces?.map((race) => {
              const durationMs =
                race.startTime && race.endTime
                  ? new Date(race.endTime).getTime() - new Date(race.startTime).getTime()
                  : null;
              const position = race.finishingPositionInClass ?? race.finishingPosition;
              return (
                <Link
                  key={race.id}
                  to={`/results/${race.id}`}
                  className="row-hover flex items-center gap-3.5 border-t border-ds-line px-5 py-3 text-ds-ink"
                >
                  <span
                    className={`chip num min-w-12 flex-none justify-center px-2 py-[3px] text-base normal-case ${positionTagClass(position)}`}
                  >
                    {positionLabel(position)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">{race.seriesName ?? 'Unknown series'}</span>
                    <span className="text-[13px] text-ds-muted">
                      {[race.carName ?? 'Unknown car', race.startTime ? formatShortDate(race.startTime, true) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex flex-col items-end whitespace-nowrap text-[13px] text-ds-muted">
                    <span className="flex items-baseline gap-1">
                      <span className="num text-base text-ds-ink">{race.teamLapsComplete ?? '—'}</span>
                      <span>laps</span>
                    </span>
                    <span className="text-xs">
                      {[formatDuration(durationMs), `${race.teamIncidents ?? 0}x incidents`].join(' · ')}
                    </span>
                  </span>
                </Link>
              );
            })}
            <div className="px-5 pb-3">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="su-title" className="cut flex min-w-0 flex-[2_1_300px] flex-col bg-ds-panel pb-1.5 pt-5">
        <div className="flex flex-col gap-1 px-5 pb-3">
          <h2 id="su-title" className="h2">
            Car setups for this track
          </h2>
          <span className="text-[13px] text-ds-muted">Fuel and pit numbers the planner uses here</span>
        </div>
        {setups === null ? (
          <p className="m-0 px-5 pb-4 text-sm text-ds-muted">Loading...</p>
        ) : setups.length === 0 ? (
          <p className="m-0 px-5 pb-4 text-sm text-ds-muted">No car setups recorded for this track yet.</p>
        ) : (
          setups.map((setup) => {
            const nums = [
              setup.fuelPerLapLiters ? `${Number(setup.fuelPerLapLiters)} L` : null,
              setup.pitLaneTimeSeconds ? `${Number(setup.pitLaneTimeSeconds)} s` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Link
                key={setup.id}
                to={`/cars/${setup.carId}`}
                className="row-hover flex items-center justify-between gap-2.5 border-t border-ds-line px-5 py-3.5 text-ds-ink"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold">{setup.car.name}</span>
                  {setup.notes && <span className="truncate text-xs text-ds-muted">{setup.notes}</span>}
                </span>
                <span className="num whitespace-nowrap text-sm text-ds-ink-soft">{nums || '—'}</span>
              </Link>
            );
          })
        )}
      </section>
      </div>
    </div>
  );
}
