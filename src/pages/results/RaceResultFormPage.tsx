import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { raceResultsApi } from '../../lib/api/raceResults';

export default function RaceResultFormPage() {
  const navigate = useNavigate();
  const [subsessionId, setSubsessionId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="max-w-md">
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-8">Add Result</h1>
      <p className="text-white/65 text-sm mb-6">
        Enter the session's subsession ID (from the iRacing results page URL) and your team's ID —
        we'll pull the rest from iRacing.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="flex flex-col gap-2">
          <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">
            Session ID (subsession ID)
          </span>
          <input
            required
            type="number"
            min="1"
            value={subsessionId}
            onChange={(e) => setSubsessionId(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Team ID</span>
          <input
            required
            type="number"
            min="1"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="input"
          />
        </label>

        {error && <p className="text-w2w-red text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-sm transition-colors clip-corner"
        >
          {saving ? 'Importing...' : 'Import Result'}
        </button>
      </form>
    </div>
  );
}
