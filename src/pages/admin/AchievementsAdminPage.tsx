import { useEffect, useState } from 'react';
import AchievementIconView, { ACHIEVEMENT_ICON_KEYS } from '../../components/AchievementIcon';
import TrackAutocomplete from '../../components/TrackAutocomplete';
import { useConfirm } from '../../context/ConfirmContext';
import { achievementsApi } from '../../lib/api/achievements';
import { driversApi } from '../../lib/api/drivers';
import { tracksApi } from '../../lib/api/tracks';
import { ApiError } from '../../lib/api';
import type { AchievementDefinition, AchievementIcon, AchievementMetric, TierInput } from '../../types/achievement';
import type { DriverProfile } from '../../types/driver';
import type { Track } from '../../types/track';

const METRIC_LABELS: Record<AchievementMetric, string> = {
  LAPS: 'Laps Completed',
  WINS: 'Race Wins',
  PODIUMS: 'Podium Finishes',
  DISTINCT_CARS_RACED: 'Different Cars Raced',
  DISTINCT_CARS_WON: 'Different Cars Won With',
  TRACK_WIN: 'Won at a Specific Track',
  MANUAL: 'Manual (no metric)',
};

const METRICS: AchievementMetric[] = [
  'LAPS',
  'WINS',
  'PODIUMS',
  'DISTINCT_CARS_RACED',
  'DISTINCT_CARS_WON',
  'TRACK_WIN',
  'MANUAL',
];

interface DefinitionFormState {
  name: string;
  description: string;
  metric: AchievementMetric;
  icon: AchievementIcon;
  trackId: string;
  tiers: TierInput[];
}

const EMPTY_FORM: DefinitionFormState = {
  name: '',
  description: '',
  metric: 'MANUAL',
  icon: 'TROPHY',
  trackId: '',
  tiers: [{ label: '' }],
};

export default function AchievementsAdminPage() {
  const confirm = useConfirm();
  const [definitions, setDefinitions] = useState<AchievementDefinition[] | null>(null);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<DefinitionFormState>(EMPTY_FORM);
  const [awardingFor, setAwardingFor] = useState<string | null>(null);
  const [awardDriverId, setAwardDriverId] = useState('');
  const [awardTierId, setAwardTierId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => void achievementsApi.listDefinitions().then(setDefinitions);

  useEffect(load, []);
  useEffect(() => void driversApi.list().then(setDrivers), []);
  useEffect(() => void tracksApi.list().then(setTracks), []);

  const driverNames = Object.fromEntries(drivers.map((d) => [d.id, d.iracingName ?? d.displayName]));
  const trackNames = Object.fromEntries((tracks ?? []).map((t) => [t.id, t.name]));

  function startCreate() {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startEdit(definition: AchievementDefinition) {
    setEditingId(definition.id);
    setForm({
      name: definition.name,
      description: definition.description ?? '',
      metric: definition.metric,
      icon: definition.icon,
      trackId: definition.trackId ?? '',
      tiers: [...definition.tiers]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({ id: t.id, label: t.label, threshold: t.threshold ?? undefined })),
    });
    setError(null);
  }

  function cancelForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    const tiers = form.tiers.filter((t) => t.label.trim() !== '');
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (tiers.length === 0) {
      setError('Add at least one tier.');
      return;
    }
    if (form.metric !== 'MANUAL' && tiers.some((t) => t.threshold === undefined || t.threshold < 1)) {
      setError(`Every tier needs a threshold for a ${METRIC_LABELS[form.metric]} achievement.`);
      return;
    }
    if (form.metric === 'TRACK_WIN' && !form.trackId) {
      setError('Pick which track this achievement is for.');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        metric: form.metric,
        icon: form.icon,
        trackId: form.metric === 'TRACK_WIN' ? form.trackId : undefined,
        tiers,
      };
      if (editingId === 'new') {
        await achievementsApi.createDefinition(payload);
      } else if (editingId) {
        await achievementsApi.updateDefinition(editingId, payload);
      }
      cancelForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save achievement');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm('Delete this achievement and every tier drivers have earned under it? This cannot be undone.', { confirmLabel: 'Delete' }))) {
      return;
    }
    setBusy(true);
    try {
      await achievementsApi.removeDefinition(id);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleRecalculate(id: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await achievementsApi.recalculate(id);
      setMessage(
        result.newAwards === 0
          ? 'No new tiers earned — everyone eligible already has them.'
          : `Awarded ${result.newAwards} new tier${result.newAwards === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to recalculate');
    } finally {
      setBusy(false);
    }
  }

  function startAward(definitionId: string, firstTierId: string) {
    setAwardingFor(definitionId);
    setAwardDriverId('');
    setAwardTierId(firstTierId);
    setError(null);
  }

  async function handleAward() {
    if (!awardDriverId || !awardTierId) return;
    setBusy(true);
    setError(null);
    try {
      await achievementsApi.award({ driverProfileId: awardDriverId, tierId: awardTierId });
      setAwardingFor(null);
      setMessage('Tier awarded.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to award tier');
    } finally {
      setBusy(false);
    }
  }

  function updateTier(index: number, patch: Partial<TierInput>) {
    const tiers = [...form.tiers];
    tiers[index] = { ...tiers[index], ...patch };
    setForm({ ...form, tiers });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Admin</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">Achievements</h1>
        </div>
        {editingId === null && (
          <button
            onClick={startCreate}
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
          >
            New Achievement
          </button>
        )}
      </div>

      {message && <p className="mb-4 text-white/65 text-sm">{message}</p>}

      {editingId !== null && (
        <div className="mb-8 bg-w2w-charcoal border border-white/10 p-6 space-y-4 max-w-xl">
          <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase">
            {editingId === 'new' ? 'New Achievement' : 'Edit Achievement'}
          </h2>

          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              placeholder="e.g. Century Club"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input resize-none"
            />
          </Field>

          <Field label="Metric">
            <div className="flex flex-wrap gap-2">
              {METRICS.map((metric) => (
                <button
                  key={metric}
                  type="button"
                  onClick={() => setForm({ ...form, metric })}
                  aria-pressed={form.metric === metric}
                  className={`px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors ${
                    form.metric === metric
                      ? 'bg-w2w-red text-on-accent'
                      : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
                  }`}
                >
                  {METRIC_LABELS[metric]}
                </button>
              ))}
            </div>
            {form.metric !== 'MANUAL' && (
              <p className="text-white/65 text-xs mt-1">
                Recalculate scans race results and auto-awards any tier a driver has crossed.
              </p>
            )}
          </Field>

          {form.metric === 'TRACK_WIN' && (
            <Field label="Track">
              <TrackAutocomplete tracks={tracks} value={form.trackId} onChange={(trackId) => setForm({ ...form, trackId })} />
            </Field>
          )}

          <Field label="Icon">
            <div className="flex flex-wrap gap-2">
              {ACHIEVEMENT_ICON_KEYS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setForm({ ...form, icon })}
                  title={icon}
                  aria-label={icon}
                  aria-pressed={form.icon === icon}
                  className={`h-10 w-10 flex items-center justify-center transition-colors ${
                    form.icon === icon
                      ? 'bg-w2w-red text-on-accent'
                      : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
                  }`}
                >
                  <AchievementIconView icon={icon} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </Field>

          <Field label="Tiers">
            <div className="space-y-2">
              {form.tiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={tier.label}
                    onChange={(e) => updateTier(i, { label: e.target.value })}
                    placeholder="Label, e.g. Bronze / 100 Laps"
                    className="input flex-1"
                  />
                  {form.metric !== 'MANUAL' && (
                    <input
                      type="number"
                      min={1}
                      value={tier.threshold ?? ''}
                      onChange={(e) =>
                        updateTier(i, { threshold: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                      placeholder="Threshold"
                      className="input w-28"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, tiers: form.tiers.filter((_, j) => j !== i) })}
                    disabled={form.tiers.length === 1}
                    className="shrink-0 px-3 py-2.5 border border-white/15 text-white/65 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:pointer-events-none font-heading text-xs uppercase tracking-wide transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, tiers: [...form.tiers, { label: '' }] })}
              className="mt-1 text-xs text-w2w-red hover:text-w2w-red-bright font-heading uppercase tracking-wide self-start"
            >
              + Add Tier
            </button>
          </Field>

          {error && <p className="text-w2w-red text-sm">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => void handleSubmit()}
              disabled={busy}
              className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
            >
              {editingId === 'new' ? 'Create' : 'Save Changes'}
            </button>
            <button
              onClick={cancelForm}
              className="px-5 py-2.5 border border-white/20 text-white/60 hover:text-white font-heading text-xs uppercase tracking-wide transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {definitions === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : definitions.length === 0 ? (
        <p className="text-white/65 text-sm">No achievements set up yet.</p>
      ) : (
        <div className="space-y-3">
          {definitions.map((definition) => {
            const tiers = [...definition.tiers].sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={definition.id} className="bg-w2w-charcoal border border-white/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 shrink-0 flex items-center justify-center bg-w2w-red/15 text-w2w-red">
                      <AchievementIconView icon={definition.icon} className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-heading font-semibold text-white text-sm">{definition.name}</p>
                      {definition.description && (
                        <p className="text-white/65 text-xs mt-0.5 max-w-md">{definition.description}</p>
                      )}
                      <span className="inline-block mt-2 px-2 py-0.5 text-[11px] font-heading uppercase tracking-wide bg-white/5 text-white/65">
                        {METRIC_LABELS[definition.metric]}
                        {definition.metric === 'TRACK_WIN' && definition.trackId
                          ? ` · ${trackNames[definition.trackId] ?? 'Unknown track'}`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {definition.metric !== 'MANUAL' && (
                      <button
                        onClick={() => void handleRecalculate(definition.id)}
                        disabled={busy}
                        className="px-3 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/40 disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
                      >
                        Recalculate
                      </button>
                    )}
                    <button
                      onClick={() => startAward(definition.id, tiers[0]?.id ?? '')}
                      disabled={tiers.length === 0}
                      className="px-3 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/40 disabled:opacity-40 font-heading text-xs uppercase tracking-wide transition-colors"
                    >
                      Award
                    </button>
                    <button
                      onClick={() => startEdit(definition)}
                      className="px-3 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDelete(definition.id)}
                      disabled={busy}
                      className="px-3 py-1.5 border border-w2w-red/40 text-w2w-red hover:bg-w2w-red/10 disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {tiers.map((tier) => (
                    <span
                      key={tier.id}
                      className="px-2.5 py-1 bg-white/5 text-white/60 text-[11px] font-heading uppercase tracking-wide"
                    >
                      {tier.label}
                      {tier.threshold !== null ? ` (${tier.threshold})` : ''}
                    </span>
                  ))}
                </div>

                {awardingFor === definition.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="font-heading text-[10px] tracking-[0.2em] uppercase text-white/65">
                        Driver
                      </label>
                      <select
                        value={awardDriverId}
                        onChange={(e) => setAwardDriverId(e.target.value)}
                        className="input"
                      >
                        <option value="">Select driver...</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {driverNames[d.id]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-heading text-[10px] tracking-[0.2em] uppercase text-white/65">Tier</label>
                      <select value={awardTierId} onChange={(e) => setAwardTierId(e.target.value)} className="input">
                        {tiers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => void handleAward()}
                      disabled={busy || !awardDriverId}
                      className="px-4 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
                    >
                      Award
                    </button>
                    <button
                      onClick={() => setAwardingFor(null)}
                      className="px-4 py-2.5 border border-white/20 text-white/60 hover:text-white font-heading text-xs uppercase tracking-wide transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">{label}</span>
      {children}
    </label>
  );
}
