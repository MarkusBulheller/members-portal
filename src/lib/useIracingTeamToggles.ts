import { useState } from 'react';
import { useConfirm } from '../context/ConfirmContext';
import { ApiError } from './api';
import { iracingTeamsApi } from './api/iracingTeams';
import type { IracingTeam, UpdateIracingTeamInput } from '../types/iracingTeam';

/** Shared by the admin pages that flip an iRacing team's `active` / `autoImport` flags. Nothing
 * changes locally until the server answers (so a failed save never leaves a switch lying); a team
 * is "busy" while its request is in flight so its switches can be disabled. */
export function useIracingTeamToggles(onUpdated: (team: IracingTeam) => void) {
  const confirm = useConfirm();
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function patch(team: IracingTeam, input: UpdateIracingTeamInput) {
    setError(null);
    setBusyIds((ids) => new Set(ids).add(team.teamId));
    try {
      const updated = await iracingTeamsApi.update(team.teamId, input);
      onUpdated({ ...team, ...updated });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update the team.');
    } finally {
      setBusyIds((ids) => {
        const next = new Set(ids);
        next.delete(team.teamId);
        return next;
      });
    }
  }

  async function setActive(team: IracingTeam, next: boolean) {
    if (!next) {
      const ok = await confirm('Inactive teams disappear from team pickers and are not watched.', {
        title: `Deactivate ${team.teamName}?`,
        confirmLabel: 'Deactivate',
      });
      if (!ok) return;
    }
    await patch(team, { active: next });
  }

  function setAutoImport(team: IracingTeam, next: boolean) {
    return patch(team, { autoImport: next });
  }

  return { busyIds, error, setActive, setAutoImport };
}
