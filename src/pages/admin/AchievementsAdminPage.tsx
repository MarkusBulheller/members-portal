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
  LAPS: 'Laps completed',
  WINS: 'Race wins',
  PODIUMS: 'Podiums',
  DISTINCT_CARS_RACED: 'Different cars raced',
  DISTINCT_CARS_WON: 'Different cars won in',
  TRACK_WIN: 'Win at a specific track',
  MANUAL: 'Manual (awarded by hand)',
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

const GHOST_BTN =
  'cut-xs min-h-9 cursor-pointer border-0 bg-transparent px-3 text-[13px] font-bold uppercase transition-colors hover:bg-ds-control-hover disabled:cursor-default disabled:opacity-50';

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
  const [recalculatingAll, setRecalculatingAll] = useState(false);

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

  async function handleRecalculateAll() {
    const scannable = (definitions ?? []).filter((d) => d.metric !== 'MANUAL').length;
    setBusy(true);
    setRecalculatingAll(true);
    setError(null);
    setMessage(
      `Recalculating ${scannable} achievement${scannable === 1 ? '' : 's'} — this scans every race result and can take a little while...`,
    );
    try {
      const result = await achievementsApi.recalculateAll();
      const count = `${result.definitionsProcessed} achievement${result.definitionsProcessed === 1 ? '' : 's'}`;
      setMessage(
        result.newAwards === 0
          ? `Recalculated ${count} — no new tiers earned, everyone eligible already has them.`
          : `Recalculated ${count} — awarded ${result.newAwards} new tier${result.newAwards === 1 ? '' : 's'}.`,
      );
      if (result.failures.length > 0) {
        setError(
          `Couldn't recalculate ${result.failures.map((f) => f.name).join(', ')} — try those individually.`,
        );
      }
      load();
    } catch (err) {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Failed to recalculate');
    } finally {
      setRecalculatingAll(false);
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="max-w-[560px] text-ds-muted">
          Recalculate scans all race results and awards any tier a driver has crossed. Manual achievements are only
          ever handed out by hand.
        </span>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => void handleRecalculateAll()}
            disabled={busy || definitions === null}
            className="btn-secondary"
          >
            {recalculatingAll ? 'Recalculating...' : 'Recalculate'}
          </button>
          {editingId === null && (
            <button onClick={startCreate} className="btn-primary">
              + New achievement
            </button>
          )}
        </div>
      </div>

      {message && (
        <p
          role="status"
          className="cut-sm m-0 bg-ds-panel px-3.5 py-3 text-[13px] text-ds-ink-soft shadow-[inset_3px_0_0_var(--color-w2w-red)]"
        >
          {message}
        </p>
      )}

      {editingId !== null && (
        <section
          aria-labelledby="achievement-form"
          className="cut flex flex-col gap-[18px] bg-ds-panel px-6 py-[22px] shadow-[inset_0_3px_0_var(--color-w2w-red)]"
        >
          <h2 id="achievement-form" className="h2">
            {editingId === 'new' ? 'New achievement' : 'Edit achievement'}
          </h2>

          <div className="flex flex-wrap gap-x-4 gap-y-3.5">
            <Field label="Name" className="flex-[1_1_240px]">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="e.g. Century Club"
              />
            </Field>

            <Field label="Counts" className="flex-[1_1_240px]">
              <select
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value as AchievementMetric })}
                className="input"
              >
                {METRICS.map((metric) => (
                  <option key={metric} value={metric}>
                    {METRIC_LABELS[metric]}
                  </option>
                ))}
              </select>
              {form.metric !== 'MANUAL' && (
                <span className="text-xs text-ds-dim">
                  Recalculate scans race results and auto-awards any tier a driver has crossed.
                </span>
              )}
            </Field>

            {form.metric === 'TRACK_WIN' && (
              <Field label="Track" className="flex-[1_1_100%]">
                <TrackAutocomplete tracks={tracks} value={form.trackId} onChange={(trackId) => setForm({ ...form, trackId })} />
              </Field>
            )}

            <Field
              label={
                <>
                  Description <span className="ml-1 font-normal text-ds-dim">optional</span>
                </>
              }
              className="flex-[1_1_100%]"
            >
              <textarea
                rows={1}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input resize-none"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="lbl">Icon</span>
            <div className="flex flex-wrap gap-1.5">
              {ACHIEVEMENT_ICON_KEYS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setForm({ ...form, icon })}
                  title={icon}
                  aria-label={icon}
                  aria-pressed={form.icon === icon}
                  className={`cut-xs flex h-[42px] w-[42px] cursor-pointer items-center justify-center border-0 transition-colors ${
                    form.icon === icon
                      ? 'bg-w2w-red text-on-accent'
                      : 'bg-ds-field text-ds-muted hover:text-ds-ink'
                  }`}
                >
                  <AchievementIconView icon={icon} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="lbl">Tiers</span>
            {form.tiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={tier.label}
                  onChange={(e) => updateTier(i, { label: e.target.value })}
                  placeholder="Label, e.g. Bronze / 100 Laps"
                  aria-label="Tier label"
                  className="input min-w-0 flex-[2_1_160px]"
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
                    aria-label="Threshold"
                    className="input num min-w-0 max-w-[140px] flex-[1_1_90px]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tiers: form.tiers.filter((_, j) => j !== i) })}
                  disabled={form.tiers.length === 1}
                  aria-label="Remove tier"
                  className="cut-xs flex h-10 w-10 flex-none cursor-pointer items-center justify-center border-0 bg-ds-control text-ds-muted transition-colors hover:bg-ds-control-hover disabled:pointer-events-none disabled:opacity-30"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="square"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, tiers: [...form.tiers, { label: '' }] })}
              className="btn-secondary btn-sm cut-sm self-start !min-h-[38px] !px-4 !text-[13px] text-ds-ink-soft"
            >
              + Add tier
            </button>
          </div>

          {error && (
            <p
              role="alert"
              className="cut-sm m-0 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2.5 border-t border-ds-line pt-4">
            <button onClick={cancelForm} className="btn-secondary">
              Cancel
            </button>
            <button onClick={() => void handleSubmit()} disabled={busy} className="btn-primary">
              {editingId === 'new' ? 'Save achievement' : 'Save changes'}
            </button>
          </div>
        </section>
      )}

      {editingId === null && error && (
        <p
          role="alert"
          className="cut-sm m-0 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]"
        >
          {error}
        </p>
      )}

      {definitions === null ? (
        <p role="status" className="m-0 text-sm text-ds-muted">Loading...</p>
      ) : definitions.length === 0 ? (
        <section className="cut bg-ds-panel">
          <p className="m-0 px-4 py-9 text-center text-ds-muted">No achievements set up yet.</p>
        </section>
      ) : (
        <section aria-label="Achievements" className="cut bg-ds-panel py-1">
          {definitions.map((definition, index) => {
            const tiers = [...definition.tiers].sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={definition.id} className={`row-hover ${index === 0 ? '' : 'border-t border-ds-line'}`}>
                <div className="flex flex-wrap items-center gap-3.5 px-5 py-3.5">
                  <span className="cut-xs flex h-11 w-11 flex-none items-center justify-center bg-ds-field text-w2w-red-ink">
                    <AchievementIconView icon={definition.icon} className="h-[22px] w-[22px]" />
                  </span>
                  <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
                    <span className="font-bold text-ds-ink">
                      {definition.name}
                      <span className="ml-1 text-[13px] font-normal text-ds-muted">
                        · {METRIC_LABELS[definition.metric]}
                        {definition.metric === 'TRACK_WIN' && definition.trackId
                          ? ` · ${trackNames[definition.trackId] ?? 'Unknown track'}`
                          : ''}
                      </span>
                    </span>
                    {definition.description && (
                      <span className="max-w-md text-[13px] text-ds-muted">{definition.description}</span>
                    )}
                    <span className="flex flex-wrap gap-1">
                      {tiers.map((tier) => (
                        <span key={tier.id} className="chip chip-sm">
                          {tier.label}
                          {tier.threshold !== null ? ` · ${tier.threshold}` : ''}
                        </span>
                      ))}
                    </span>
                  </span>
                  {definition.holderCount !== undefined && (
                    <span className="text-[13px] text-ds-muted">
                      {definition.holderCount}{' '}
                      {definition.holderCount === 1 ? 'driver' : 'drivers'}
                    </span>
                  )}
                  <span className="flex flex-wrap gap-1">
                    {definition.metric !== 'MANUAL' && (
                      <button
                        onClick={() => void handleRecalculate(definition.id)}
                        disabled={busy}
                        className={`${GHOST_BTN} text-ds-ink-soft`}
                      >
                        Recalculate
                      </button>
                    )}
                    <button
                      onClick={() => startAward(definition.id, tiers[0]?.id ?? '')}
                      disabled={tiers.length === 0}
                      className={`${GHOST_BTN} text-w2w-red-ink`}
                    >
                      Award
                    </button>
                    <button onClick={() => startEdit(definition)} className={`${GHOST_BTN} text-ds-ink-soft`}>
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDelete(definition.id)}
                      disabled={busy}
                      className={`${GHOST_BTN} text-ds-danger`}
                    >
                      Delete
                    </button>
                  </span>
                </div>

                {awardingFor === definition.id && (
                  <div className="mx-5 flex flex-wrap items-end gap-2.5 border-t border-ds-line pb-4 pt-4">
                    <label className="flex min-w-[200px] flex-col gap-1.5">
                      <span className="lbl">Driver</span>
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
                    </label>
                    <label className="flex min-w-[160px] flex-col gap-1.5">
                      <span className="lbl">Tier</span>
                      <select value={awardTierId} onChange={(e) => setAwardTierId(e.target.value)} className="input">
                        {tiers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() => void handleAward()}
                      disabled={busy || !awardDriverId}
                      className="btn-primary"
                    >
                      Award
                    </button>
                    <button onClick={() => setAwardingFor(null)} className="btn-secondary">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  className = '',
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}
