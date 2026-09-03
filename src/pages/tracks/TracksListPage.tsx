import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { tracksApi } from '../../lib/api/tracks';
import type { Track } from '../../types/track';

export default function TracksListPage() {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    void tracksApi.list().then(setTracks);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Circuits</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">Tracks</h1>
        </div>
        {user?.role === 'ADMIN' && (
          <Link
            to="/tracks/new"
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
          >
            New Track
          </Link>
        )}
      </div>

      {tracks === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : tracks.length === 0 ? (
        <p className="text-white/65 text-sm">No tracks yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map((track) => (
            <Link
              key={track.id}
              to={`/tracks/${track.id}`}
              className="bg-w2w-charcoal border border-white/10 hover:border-w2w-red/50 overflow-hidden transition-colors"
            >
              {track.imageUrl && (
                <img
                  src={track.imageUrl}
                  alt=""
                  className="w-full h-32 object-contain bg-black/30"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="p-4">
                <p className="font-heading font-semibold text-white text-sm">{track.name}</p>
                <p className="text-white/65 text-xs mt-0.5">{track.category}</p>
                {track.location && <p className="text-white/65 text-xs mt-2">{track.location}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
