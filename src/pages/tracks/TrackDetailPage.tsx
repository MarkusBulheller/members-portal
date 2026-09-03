import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Pagination from '../../components/Pagination';
import RaceResultRow from '../../components/RaceResultRow';
import { useAuth } from '../../context/AuthContext';
import { raceResultsApi } from '../../lib/api/raceResults';
import { tracksApi } from '../../lib/api/tracks';
import { formatDuration } from '../../lib/lapTime';
import { usePagination } from '../../lib/usePagination';
import type { RaceResult } from '../../types/raceResult';
import type { Track } from '../../types/track';

export default function TrackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [track, setTrack] = useState<Track | null>(null);
  const [races, setRaces] = useState<RaceResult[] | null>(null);

  useEffect(() => {
    if (id) void tracksApi.getById(id).then(setTrack);
  }, [id]);

  useEffect(() => {
    if (id) void raceResultsApi.listByTrack(id).then(setRaces);
  }, [id]);

  const { page, setPage, totalPages, pageItems: pagedRaces } = usePagination(races);

  if (!track) {
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  return (
    <div>
      <Link to="/tracks" className="text-xs text-white/65 hover:text-white">
        ← Back to tracks
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div className="flex items-center gap-4">
          {track.imageUrl && (
            <img
              src={track.imageUrl}
              alt=""
              className="h-16 w-24 object-contain bg-black/30 shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div>
            <h1 className="font-display font-black text-3xl uppercase text-w2w-white">{track.name}</h1>
            <p className="text-white/65 text-sm mt-1">{track.category}</p>
          </div>
        </div>
        {user?.role === 'ADMIN' && (
          <Link
            to={`/tracks/${track.id}/edit`}
            className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors shrink-0"
          >
            Edit
          </Link>
        )}
      </div>

      {track.location && (
        <div className="mt-6 max-w-[280px]">
          <div className="bg-w2w-charcoal border border-white/10 p-4">
            <p className="font-heading text-[11px] tracking-[0.2em] text-white/65 uppercase">Location</p>
            <p className="mt-1 font-display font-bold text-xl text-w2w-white">{track.location}</p>
          </div>
        </div>
      )}

      {track.notes && <p className="mt-6 text-white/60 text-sm leading-relaxed max-w-2xl">{track.notes}</p>}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">Races</h2>
      {races === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : races.length === 0 ? (
        <p className="text-white/65 text-sm">No race results recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {pagedRaces?.map((race) => {
            const durationMs =
              race.startTime && race.endTime
                ? new Date(race.endTime).getTime() - new Date(race.startTime).getTime()
                : null;
            return (
              <RaceResultRow
                key={race.id}
                to={`/results/${race.id}`}
                title={race.carName ?? 'Unknown car'}
                subtitle={[race.seriesName, race.startTime ? new Date(race.startTime).toLocaleDateString() : null]
                  .filter(Boolean)
                  .join(' · ')}
                position={race.finishingPositionInClass ?? race.finishingPosition}
                statsLine={[
                  `${race.teamLapsComplete ?? '—'} laps`,
                  formatDuration(durationMs),
                  `${race.teamIncidents ?? 0}x incidents`,
                ].join(' · ')}
              />
            );
          })}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
