import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { iracingTeamsApi } from '../../lib/api/iracingTeams';
import { beginIracingTeamSync } from '../../lib/iracing';
import { shortDate } from '../../lib/relativeTime';
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="max-w-[560px] text-ds-muted">
          The iRacing teams you can attach to event crews. Syncing signs you in to iRacing and pulls the teams your
          account belongs to.
        </span>
        <button onClick={handleSync} disabled={syncing} className="btn-primary">
          {syncing ? 'Syncing...' : 'Sync from iRacing'}
        </button>
      </div>

      {justSynced && (
        <p
          role="status"
          className="cut-sm m-0 bg-ds-panel px-3.5 py-3 text-[13px] text-ds-ink-soft shadow-[inset_3px_0_0_var(--color-w2w-red)]"
        >
          Synced {justSynced} team{justSynced === '1' ? '' : 's'} from iRacing.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="cut-sm m-0 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]"
        >
          {error}
        </p>
      )}

      {teams === null ? (
        <p role="status" className="m-0 text-sm text-ds-muted">Loading...</p>
      ) : teams.length === 0 ? (
        <section className="cut bg-ds-panel">
          <p className="m-0 px-4 py-9 text-center text-ds-muted">
            No teams synced yet. Click "Sync from iRacing" to import.
          </p>
        </section>
      ) : (
        <section aria-label="iRacing teams" className="cut bg-ds-panel py-1">
          {teams.map((team, i) => (
            <div
              key={team.teamId}
              className={`row-hover flex flex-wrap items-center gap-3.5 px-5 py-3.5 ${
                i === 0 ? '' : 'border-t border-ds-line'
              }`}
            >
              <span className="cut-xs flex h-10 w-10 flex-none items-center justify-center bg-ds-control text-[15px] font-black italic text-ds-ink">
                {team.teamName.charAt(0).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold text-ds-ink">{team.teamName}</span>
                <span className="text-[13px] text-ds-muted">
                  Team ID {team.teamId} · <span className="num">{team.rosterCount}</span> on roster
                </span>
              </span>
              <span className="chip chip-sm">Synced {shortDate(team.syncedAt)}</span>
              {team.members.length > 0 && (
                <span className="flex basis-full flex-wrap gap-1 pl-[54px]">
                  {team.members.map((member) => (
                    <span key={member.custId} className="chip chip-sm chip-muted">
                      {member.displayName}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
