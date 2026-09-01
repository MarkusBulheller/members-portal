import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { raceResultsApi } from '../../lib/api/raceResults';
import { podiumColor } from '../../lib/podium';
import type { RaceResult } from '../../types/raceResult';

function positionLabel(position: number | null): string {
  return position === null ? '—' : `P${position}`;
}

export default function RaceResultsListPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<RaceResult[] | null>(null);

  useEffect(() => {
    void raceResultsApi.list().then(setResults);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">History</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">Results</h1>
        </div>
        {user?.role === 'ADMIN' && (
          <Link
            to="/results/new"
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
          >
            Add Result
          </Link>
        )}
      </div>

      {results === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : results.length === 0 ? (
        <p className="text-white/65 text-sm">
          No results yet.
          {user?.role === 'ADMIN' ? ' Click "Add Result" to import one from iRacing.' : ''}
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((result) => (
            <Link
              key={result.id}
              to={`/results/${result.id}`}
              className="bg-w2w-charcoal border border-white/10 hover:border-w2w-red/50 p-5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <p className="font-heading font-semibold text-white text-sm">
                  {result.trackName}
                  {result.trackConfig ? ` — ${result.trackConfig}` : ''}
                </p>
                <span
                  className="font-display font-bold text-lg shrink-0 ml-2"
                  style={{
                    color: podiumColor(
                      result.finishingPositionInClass ?? result.finishingPosition,
                      'var(--color-w2w-red)',
                    ),
                  }}
                >
                  {positionLabel(result.finishingPositionInClass ?? result.finishingPosition)}
                </span>
              </div>
              {result.seriesName && <p className="text-white/65 text-xs mt-0.5">{result.seriesName}</p>}
              <div className="mt-3 flex items-center justify-between text-xs text-white/65">
                <span>{result.carName ?? 'Unknown car'}</span>
                <span>{result.startTime ? new Date(result.startTime).toLocaleDateString() : ''}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
