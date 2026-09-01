import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { iracingTeamsApi } from '../../lib/api/iracingTeams';
import { beginIracingTeamSync } from '../../lib/iracing';
import type { IracingTeam } from '../../types/iracingTeam';

export default function IracingTeamsPage() {
  const [searchParams] = useSearchParams();
  const justSynced = searchParams.get('synced');
  const [teams, setTeams] = useState<IracingTeam[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void iracingTeamsApi.list().then(setTeams);
  }, []);

  function handleSync() {
    setSyncing(true);
    setError(null);
    beginIracingTeamSync().catch((err: unknown) => {
      setSyncing(false);
      setError(err instanceof Error ? err.message : 'Failed to start the iRacing sync.');
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Admin</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">iRacing Teams</h1>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
        >
          {syncing ? 'Syncing...' : 'Sync from iRacing'}
        </button>
      </div>

      {justSynced && (
        <p className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">
          Synced {justSynced} team{justSynced === '1' ? '' : 's'} from iRacing.
        </p>
      )}
      {error && <p className="mb-6 text-sm text-w2w-red">{error}</p>}

      <p className="text-white/65 text-xs mb-6 max-w-2xl">
        Sign in with an iRacing account that belongs to the team(s) you want to import — this pulls
        every team that account is a member of, along with each one's current roster. Used later by
        team building to check that assigned drivers are actually on the roster.
      </p>

      {teams === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : teams.length === 0 ? (
        <p className="text-white/65 text-sm">No teams synced yet. Click "Sync from iRacing" to import.</p>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <div key={team.teamId} className="bg-w2w-charcoal border border-white/10 p-5">
              <div className="flex items-center justify-between">
                <p className="font-heading font-semibold text-white text-sm">{team.teamName}</p>
                <span className="text-white/50 text-xs">
                  {team.rosterCount} on roster · synced {new Date(team.syncedAt).toLocaleDateString()}
                </span>
              </div>
              {team.members.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {team.members.map((member) => (
                    <span
                      key={member.custId}
                      className="px-2.5 py-1 bg-white/5 text-white/65 text-[11px] font-heading uppercase tracking-wide"
                    >
                      {member.displayName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
