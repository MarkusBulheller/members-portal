import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import Switch from '../../components/Switch';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { iracingTeamsApi } from '../../lib/api/iracingTeams';
import { beginIracingTeamSync } from '../../lib/iracing';
import { shortDate } from '../../lib/relativeTime';
import { useIracingTeamToggles } from '../../lib/useIracingTeamToggles';
import type { IracingTeam } from '../../types/iracingTeam';

export default function IracingTeamsPage() {
  const [searchParams] = useSearchParams();
  const justSynced = searchParams.get('synced');
  const [teams, setTeams] = useState<IracingTeam[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const toggles = useIracingTeamToggles((updated) =>
    setTeams((list) => list?.map((t) => (t.teamId === updated.teamId ? updated : t)) ?? list),
  );

  useEffect(() => {
    void iracingTeamsApi.list({ includeInactive: true }).then(setTeams);
  }, []);

  function handleSync() {
    setSyncing(true);
    setError(null);
    beginIracingTeamSync().catch((err: unknown) => {
      setSyncing(false);
      setError(err instanceof Error ? err.message : 'Failed to start the iRacing sync.');
    });
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const teamId = Math.abs(Math.trunc(Number(newId)));
    if (!teamId || !newName.trim()) {
      setError('Enter the iRacing team id (a number) and a name.');
      return;
    }
    setSaving(true);
    try {
      const created = await iracingTeamsApi.create({ teamId, teamName: newName.trim() });
      setTeams((list) => [...(list ?? []), created].sort((a, b) => a.teamName.localeCompare(b.teamName)));
      setNewId('');
      setNewName('');
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the team.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(team: IracingTeam) {
    const ok = await confirm(
      `Removes it from the list. Event crews already pointing at team ${team.teamId} keep the id, but it will show as an unknown team.`,
      { title: `Remove ${team.teamName}?`, confirmLabel: 'Remove' },
    );
    if (!ok) return;
    setError(null);
    try {
      await iracingTeamsApi.remove(team.teamId);
      setTeams((list) => list?.filter((t) => t.teamId !== team.teamId) ?? list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the team.');
    }
  }

  async function handleRename(team: IracingTeam) {
    const name = renameValue.trim();
    if (!name || name === team.teamName) {
      setRenamingId(null);
      return;
    }
    setError(null);
    try {
      const updated = await iracingTeamsApi.update(team.teamId, { teamName: name });
      setTeams((list) => list?.map((t) => (t.teamId === team.teamId ? { ...t, ...updated } : t)) ?? list);
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to rename the team.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="max-w-[560px] text-ds-muted">
          The iRacing teams you can attach to event crews. Syncing signs you in to iRacing and pulls the teams your
          account belongs to; add any other team by hand with its iRacing team id.
        </span>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="btn-secondary"
          >
            Add team by hand
          </button>
          <button onClick={handleSync} disabled={syncing} className="btn-primary">
            {syncing ? 'Syncing...' : 'Sync from iRacing'}
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="cut flex flex-col gap-3.5 bg-ds-panel px-5 py-[18px]">
          <div className="flex flex-col gap-1">
            <h2 className="h2">Add a team by hand</h2>
            <span className="text-[13px] text-ds-muted">
              For a team you aren't a member of, or one that no longer exists on iRacing. Nothing is checked against
              iRacing, so it has no roster; its results can still be imported by team id. You'll find the id in the
              team's iRacing page address or in a race result.
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-team-id" className="lbl">iRacing team id</label>
              <input
                id="new-team-id"
                type="number"
                inputMode="numeric"
                step={1}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                className="input w-[160px] tabular-nums"
                required
              />
            </div>
            <div className="flex min-w-[220px] flex-[1_1_240px] flex-col gap-1">
              <label htmlFor="new-team-name" className="lbl">Team name</label>
              <input
                id="new-team-name"
                type="text"
                maxLength={100}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="input"
                required
              />
            </div>
            <div className="flex gap-2.5">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Adding...' : 'Add team'}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {justSynced && (
        <p
          role="status"
          className="cut-sm m-0 bg-ds-panel px-3.5 py-3 text-[13px] text-ds-ink-soft shadow-[inset_3px_0_0_var(--color-w2w-red)]"
        >
          Synced {justSynced} team{justSynced === '1' ? '' : 's'} from iRacing.
        </p>
      )}
      {(error ?? toggles.error) && (
        <p
          role="alert"
          className="cut-sm m-0 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]"
        >
          {error ?? toggles.error}
        </p>
      )}

      {teams === null ? (
        <p role="status" className="m-0 text-sm text-ds-muted">Loading...</p>
      ) : teams.length === 0 ? (
        <section className="cut bg-ds-panel">
          <p className="m-0 px-4 py-9 text-center text-ds-muted">
            No teams yet. Click "Sync from iRacing" to import, or add one by hand.
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
              <span className={`flex min-w-0 flex-[1_1_220px] items-center gap-3.5 ${team.active ? '' : 'opacity-60'}`}>
                <span className="cut-xs flex h-10 w-10 flex-none items-center justify-center bg-ds-control text-[15px] font-black italic text-ds-ink">
                  {team.teamName.charAt(0).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  {renamingId === team.teamId ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`New name for ${team.teamName}`}
                        value={renameValue}
                        maxLength={100}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRename(team);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="input min-h-9 min-w-0 flex-1"
                      />
                      <button type="button" onClick={() => void handleRename(team)} className="btn-primary btn-sm">
                        Save
                      </button>
                      <button type="button" onClick={() => setRenamingId(null)} className="btn-secondary btn-sm">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="font-bold text-ds-ink">{team.teamName}</span>
                  )}
                  <span className="text-[13px] text-ds-muted">
                    Team ID {team.teamId}
                    {team.manual ? ' · no roster' : <> · <span className="num">{team.rosterCount}</span> on roster</>}
                  </span>
                </span>
              </span>
              {!team.active && <span className="chip chip-sm chip-muted">Inactive</span>}
              {team.manual ? (
                <>
                  <span className="chip chip-sm">Added by hand</span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(team.teamId);
                        setRenameValue(team.teamName);
                      }}
                      className="btn-secondary btn-sm"
                    >
                      Rename
                    </button>
                    <button type="button" onClick={() => void handleRemove(team)} className="btn-secondary btn-sm">
                      Remove
                    </button>
                  </span>
                </>
              ) : (
                <span className="chip chip-sm">Synced {shortDate(team.syncedAt)}</span>
              )}
              <span className="flex items-center gap-2.5">
                <span className="text-[13px] font-semibold text-ds-muted" aria-hidden="true">
                  Active
                </span>
                <Switch
                  checked={team.active}
                  label={`Active: ${team.teamName}`}
                  disabled={toggles.busyIds.has(team.teamId)}
                  onChange={(next) => void toggles.setActive(team, next)}
                />
              </span>
              {team.members.length > 0 && (
                <span className={`flex basis-full flex-wrap gap-1 pl-[54px] ${team.active ? '' : 'opacity-60'}`}>
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
