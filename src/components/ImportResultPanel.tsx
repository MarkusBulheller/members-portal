import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { iracingTeamsApi } from '../lib/api/iracingTeams';
import { raceResultsApi } from '../lib/api/raceResults';
import type { IracingTeam } from '../types/iracingTeam';

/** "Import a result from iRacing" panel: subsession ID + team (picked from the synced iRacing
 * teams), then imports and opens the new result. Used inline on the Results list (toggled by
 * "Add result") and as the body of the /results/new page. If no teams have been synced yet (or
 * the list can't be loaded) the team falls back to a plain numeric ID field. */
export default function ImportResultPanel({
  onCancel,
  headingId = 'add-title',
}: {
  onCancel?: () => void;
  headingId?: string;
}) {
  const navigate = useNavigate();
  const [subsessionId, setSubsessionId] = useState('');
  const [teams, setTeams] = useState<IracingTeam[] | null>(null);
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    iracingTeamsApi
      .list()
      .then((list) => {
        if (cancelled) return;
        // iRacing's team ids can come back negative (the form team entries use in results); the
        // import wants the plain positive id, so show and send that, and drop duplicates.
        const seen = new Set<number>();
        const normalised = list
          .map((team) => ({ ...team, teamId: Math.abs(team.teamId) }))
          .filter((team) => !seen.has(team.teamId) && !!seen.add(team.teamId));
        setTeams(normalised);
        // Default to the first team (the common case is a single team) unless one is already set.
        setTeamId((current) => current || (normalised[0] ? String(normalised[0].teamId) : ''));
      })
      .catch(() => {
        if (!cancelled) setTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await raceResultsApi.import(Number(subsessionId), Number(teamId));
      navigate(`/results/${result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import result');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="cut flex flex-col gap-4 bg-ds-panel px-[22px] pb-6 pt-5 shadow-[inset_0_-3px_0_var(--color-w2w-red)]"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="h2">Import a result from iRacing</h2>
        <span className="text-[13px] text-ds-muted">
          Paste the session ID from the iRacing results page. Laps, stints and incidents come in automatically.
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3.5">
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
            <span className="lbl">Session ID (subsession)</span>
            <input
              required
              type="number"
              min="1"
              placeholder="e.g. 81234567"
              value={subsessionId}
              onChange={(e) => setSubsessionId(e.target.value)}
              className="input"
            />
          </label>
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
            <span className="lbl">Team</span>
            {teams !== null && teams.length > 0 ? (
              <select required value={teamId} onChange={(e) => setTeamId(e.target.value)} className="input">
                {teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName} · {team.teamId}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required
                type="number"
                min="1"
                placeholder={teams === null ? 'Loading teams...' : 'iRacing team ID'}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="input"
              />
            )}
          </label>
          <div className="flex gap-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="btn-secondary">
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="m-0 text-sm text-ds-danger">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
