import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DateTimeField from '../../components/DateTimeField';
import TrackAutocomplete from '../../components/TrackAutocomplete';
import { eventsApi } from '../../lib/api/events';
import { formatDayShort } from '../../lib/eventFormatting';
import { iracingSeriesApi } from '../../lib/api/iracingSeries';
import { tracksApi } from '../../lib/api/tracks';
import { parseSeriesWeeks, composedTrackName } from '../../lib/iracingSeriesWeeks';
import { CAR_CLASSES_BY_SIM } from '../../types/carClass';
import { SIM_LABELS, type CreateEventInput, type EventStatus, type Sim } from '../../types/event';
import type { IracingSeriesSeason, IracingSeriesSeasonDetail } from '../../types/iracingSeries';
import { formatRaceLength, RACE_LENGTH_PRESETS, type RaceLengthMinutes } from '../../types/raceLength';
import type { Track } from '../../types/track';

const EMPTY: CreateEventInput = {
  title: '',
  trackId: '',
  carClasses: [],
  startsAt: '',
  raceLengthMinutes: 1440,
  timeslots: [''],
  status: 'DRAFT',
  sim: 'IRACING',
  fuelLimitPercent: null,
  tyreLimit: null,
  iracingSeasonId: null,
  iracingRaceWeekNum: null,
};

/** Status tag in the preview card (label + .chip modifier) — same as the event page's header. */
const PREVIEW_STATUS_CHIPS: Record<EventStatus, { label: string; className: string }> = {
  PUBLISHED: { label: 'Signups open', className: 'chip-solid' },
  SIGNUPS_CLOSED: { label: 'Team building', className: '' },
  DRAFT: { label: 'Draft', className: 'chip-draft' },
  COMPLETED: { label: 'Completed', className: 'chip-muted' },
  CANCELLED: { label: 'Cancelled', className: 'chip-muted' },
};

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateEventInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  // Slim series list (no schedules) for the dropdown; only fetched for iRacing events. In edit
  // mode we wait for the event itself so an LMU event never triggers the request at all.
  const [seasons, setSeasons] = useState<IracingSeriesSeason[] | null>(null);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [eventLoaded, setEventLoaded] = useState(!id);
  const wantsSeries = form.sim !== 'LMU' && eventLoaded;
  // The schedule of the SELECTED season only, fetched on demand.
  const [seasonDetail, setSeasonDetail] = useState<IracingSeriesSeasonDetail | null>(null);
  const [seasonDetailError, setSeasonDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    tracksApi
      .list()
      .then((loaded) => {
        if (!cancelled) setTracks(loaded);
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wantsSeries || seasons !== null) return;
    let cancelled = false;
    iracingSeriesApi
      .list()
      .then((loaded) => {
        if (!cancelled) setSeasons(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSeasonsError(err instanceof Error ? err.message : 'Failed to load series.');
      });
    return () => {
      cancelled = true;
    };
  }, [wantsSeries, seasons]);

  const selectedSeasonId = wantsSeries ? (form.iracingSeasonId ?? null) : null;
  useEffect(() => {
    if (selectedSeasonId === null) return;
    let cancelled = false;
    iracingSeriesApi
      .getById(selectedSeasonId)
      .then((loaded) => {
        if (cancelled) return;
        setSeasonDetail(loaded);
        setSeasonDetailError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSeasonDetailError(err instanceof Error ? err.message : 'Failed to load the schedule.');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId]);

  const weeksForSelectedSeason = useMemo(
    () => (seasonDetail && seasonDetail.seasonId === selectedSeasonId ? parseSeriesWeeks(seasonDetail.schedule) : []),
    [seasonDetail, selectedSeasonId],
  );
  const weeksLoading =
    selectedSeasonId !== null && seasonDetail?.seasonId !== selectedSeasonId && seasonDetailError === null;

  useEffect(() => {
    if (!id) return;
    void eventsApi.getById(id).then((event) => {
      setForm({
        title: event.title,
        description: event.description ?? undefined,
        trackId: event.trackId,
        carClasses: event.carClasses,
        startsAt: toLocalInputValue(event.startsAt),
        endsAt: event.endsAt ? toLocalInputValue(event.endsAt) : undefined,
        signupDeadline: event.signupDeadline ? toLocalInputValue(event.signupDeadline) : undefined,
        // The backend only ever stores one of RACE_LENGTH_PRESETS' values (@IsIn-validated on
        // every create/update), so this is a safe narrowing, not a guess.
        raceLengthMinutes: event.raceLengthMinutes as RaceLengthMinutes,
        timeslots: event.timeslots.length > 0 ? event.timeslots.map((t) => toLocalInputValue(t.startsAt)) : [''],
        status: event.status,
        sim: event.sim,
        fuelLimitPercent: event.fuelLimitPercent !== null ? Number(event.fuelLimitPercent) : null,
        tyreLimit: event.tyreLimit ?? null,
        iracingSeasonId: event.iracingSeasonId,
        iracingRaceWeekNum: event.iracingRaceWeekNum,
        minDriversPerTeam: event.minDriversPerTeam ?? null,
      });
      setEventLoaded(true);
    });
  }, [id]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!form.trackId) {
      setError('Pick a track from the list.');
      return;
    }
    const timeslots = form.timeslots.filter((t) => t.trim() !== '');
    if (timeslots.length === 0) {
      setError('Add at least one timeslot.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        // An LMU event has no iRacing series/week to link — make sure an earlier iRacing
        // selection doesn't ride along if the sim was switched.
        ...(form.sim === 'LMU'
          ? { iracingSeasonId: null, iracingRaceWeekNum: null, fuelLimitPercent: null }
          : { tyreLimit: null }),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        signupDeadline: form.signupDeadline ? new Date(form.signupDeadline).toISOString() : isEdit ? null : undefined,
        timeslots: timeslots.map((t) => new Date(t).toISOString()),
        // Empty = the default (4): cleared on edit, simply left out on create.
        minDriversPerTeam: form.minDriversPerTeam ?? (isEdit ? null : undefined),
      };
      const saved = isEdit && id ? await eventsApi.update(id, payload) : await eventsApi.create(payload);
      navigate(`/events/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = isEdit ? 'Edit event' : 'New event';

  // "How drivers will see it" preview — derived from the live form state.
  const previewStatus = PREVIEW_STATUS_CHIPS[form.status ?? 'DRAFT'];
  const previewTrack = tracks?.find((t) => t.id === form.trackId)?.name ?? 'No track yet';
  const previewClasses = form.carClasses.length > 0 ? form.carClasses.join(' / ') : 'no class yet';
  const previewSlotCount = form.timeslots.filter((t) => t.trim() !== '').length;
  const previewDeadline = form.signupDeadline ? new Date(form.signupDeadline) : null;
  const previewSlotSummary = [
    `${previewSlotCount} start time${previewSlotCount === 1 ? '' : 's'}`,
    previewDeadline && !Number.isNaN(previewDeadline.getTime())
      ? `signups close ${formatDayShort(previewDeadline)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ds-muted">
          <Link to="/events" className="font-semibold text-ds-muted hover:text-[#ff6a5f] [:root[data-theme=light]_&]:hover:text-w2w-red-ink">
            Events
          </Link>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="text-ds-ink">{pageTitle}</span>
        </nav>
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">{pageTitle}</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-5">
          <section aria-labelledby="s1" className="cut flex flex-col gap-[18px] bg-ds-panel px-6 pb-6 pt-[22px]">
            <h2 id="s1" className="h2">
              The race
            </h2>
            <Group label="Sim">
              <div className="seg seg-field self-start [&>button]:px-3.5">
                {(Object.keys(SIM_LABELS) as Sim[]).map((sim) => (
                  <button
                    key={sim}
                    type="button"
                    aria-pressed={form.sim === sim}
                    onClick={() =>
                      setForm({
                        ...form,
                        sim,
                        // Drop any selected class the other sim doesn't offer.
                        carClasses: form.carClasses.filter((c) => (CAR_CLASSES_BY_SIM[sim] as readonly string[]).includes(c)),
                      })
                    }
                  >
                    {SIM_LABELS[sim]}
                  </button>
                ))}
              </div>
            </Group>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
              <Field label="Title" className="col-span-full">
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Track">
                <TrackAutocomplete
                  tracks={tracks}
                  value={form.trackId}
                  onChange={(trackId) => setForm({ ...form, trackId })}
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}
                  className="input"
                >
                  <option value="DRAFT">Draft (only admins see it)</option>
                  <option value="PUBLISHED">Published (signups open)</option>
                  <option value="SIGNUPS_CLOSED">Signups closed</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </Field>
            </div>
            <Group label="Car classes">
              <div className="flex flex-wrap gap-1.5">
                {CAR_CLASSES_BY_SIM[form.sim ?? 'IRACING'].map((cls) => {
                  const selected = form.carClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          carClasses: selected
                            ? form.carClasses.filter((c) => c !== cls)
                            : [...form.carClasses, cls],
                        })
                      }
                      aria-pressed={selected}
                      className={toggleClass(selected)}
                    >
                      {cls}
                    </button>
                  );
                })}
              </div>
            </Group>
            <Group label="Race length">
              <div className="flex flex-wrap gap-1.5">
                {RACE_LENGTH_PRESETS.map((preset) => (
                  <button
                    key={preset.minutes}
                    type="button"
                    aria-pressed={form.raceLengthMinutes === preset.minutes}
                    onClick={() => setForm({ ...form, raceLengthMinutes: preset.minutes })}
                    className={toggleClass(form.raceLengthMinutes === preset.minutes)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </Group>
            {form.sim !== 'LMU' && (
              <Field
                label={
                  <>
                    Fuel limit <span className="font-normal text-ds-dim">(% of tank, optional)</span>
                  </>
                }
                className="max-w-[260px]"
              >
                <input
                  type="number"
                  min={1}
                  max={100}
                  step="0.1"
                  placeholder="No limit"
                  value={form.fuelLimitPercent ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, fuelLimitPercent: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  className="input"
                />
                <span className="text-xs text-ds-muted">
                  If the session caps how full the tank can be filled, e.g. 98. Applied to each team's tank size on the
                  plan page. Leave blank for no limit.
                </span>
              </Field>
            )}
            {form.sim === 'LMU' && (
              <Field
                label={
                  <>
                    Tyre limit <span className="font-normal text-ds-dim">(tyres per car, optional)</span>
                  </>
                }
                className="max-w-[260px]"
              >
                <input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  placeholder="No limit"
                  value={form.tyreLimit ?? ''}
                  onChange={(e) => setForm({ ...form, tyreLimit: e.target.value === '' ? null : Number(e.target.value) })}
                  className="input"
                />
                <span className="text-xs text-ds-muted">
                  Individual tyres (not sets) each car may use over the whole race, including the 4 it starts on. Shown
                  on the team plan. Leave blank for no limit.
                </span>
              </Field>
            )}
            <Field label="Drivers needed per team" className="max-w-[260px]">
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                placeholder="4"
                value={form.minDriversPerTeam ?? ''}
                onChange={(e) =>
                  setForm({ ...form, minDriversPerTeam: e.target.value === '' ? null : Number(e.target.value) })
                }
                className="input"
              />
              <span className="text-xs text-ds-muted">The readiness check warns when a team has fewer drivers.</span>
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input resize-y"
              />
            </Field>
          </section>

          <section aria-labelledby="s2" className="cut flex flex-col gap-[18px] bg-ds-panel px-6 pb-6 pt-[22px]">
            <div className="flex flex-col gap-1">
              <h2 id="s2" className="h2">
                When
              </h2>
              <span className="text-[13px] text-ds-muted">
                Add every start time on offer. Drivers flag the ones they can do.
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
              <Field label="Main start">
                <DateTimeField
                  required
                  value={form.startsAt}
                  onChange={(value) => setForm({ ...form, startsAt: value })}
                />
              </Field>
              <Field label="Signups close">
                <DateTimeField
                  value={form.signupDeadline ?? ''}
                  onChange={(value) => setForm({ ...form, signupDeadline: value || undefined })}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <span className="lbl">Timeslot options</span>
              {form.timeslots.map((slot, i) => (
                <div key={i} className="flex items-center gap-2">
                  <DateTimeField
                    aria-label={`Timeslot ${i + 1}`}
                    value={slot}
                    onChange={(value) => {
                      const timeslots = [...form.timeslots];
                      timeslots[i] = value;
                      setForm({ ...form, timeslots });
                    }}
                    className="max-w-xs flex-1"
                  />
                  <button
                    type="button"
                    aria-label={`Remove timeslot ${i + 1}`}
                    onClick={() => setForm({ ...form, timeslots: form.timeslots.filter((_, j) => j !== i) })}
                    disabled={form.timeslots.length === 1}
                    className="cut-xs flex h-10 w-10 shrink-0 items-center justify-center border-0 bg-ds-control text-ds-muted transition-colors hover:bg-ds-control-hover disabled:pointer-events-none disabled:opacity-30"
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
                onClick={() => setForm({ ...form, timeslots: [...form.timeslots, ''] })}
                className="btn-secondary min-h-10 gap-2 self-start px-4 text-[13px]"
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
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add timeslot
              </button>
            </div>
          </section>

          {form.sim !== 'LMU' && (
            <section aria-labelledby="s3" className="cut flex flex-col gap-[18px] bg-ds-panel px-6 pb-6 pt-[22px]">
              <div className="flex flex-col gap-1">
                <h2 id="s3" className="h2">
                  Linked iRacing week <span className="text-[13px] font-normal text-ds-dim">optional</span>
                </h2>
                <span className="text-[13px] text-ds-muted">Shows that week’s weather forecast on the event page.</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
                <Field label="Series">
                  <select
                    value={form.iracingSeasonId ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        iracingSeasonId: e.target.value ? Number(e.target.value) : null,
                        iracingRaceWeekNum: null,
                      })
                    }
                    className="input min-w-0"
                  >
                    <option value="">Not linked</option>
                    {(seasons ?? []).map((season) => (
                      <option key={season.seasonId} value={season.seasonId}>
                        {[season.seriesName, season.seasonName].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Week">
                  <select
                    value={form.iracingRaceWeekNum ?? ''}
                    disabled={selectedSeasonId === null}
                    onChange={(e) =>
                      setForm({ ...form, iracingRaceWeekNum: e.target.value ? Number(e.target.value) : null })
                    }
                    className="input min-w-0"
                  >
                    <option value="">
                      {selectedSeasonId === null ? 'Pick a series first' : weeksLoading ? 'Loading weeks...' : 'Pick a week'}
                    </option>
                    {weeksForSelectedSeason.map((week) => (
                      <option key={week.weekNum} value={week.weekNum}>
                        Week {week.weekNum + 1} · {composedTrackName(week)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {(seasonsError ?? seasonDetailError) && (
                <p role="alert" className="m-0 text-[13px] text-ds-danger">
                  {seasonsError ?? seasonDetailError}
                </p>
              )}
            </section>
          )}

        </div>

        <aside aria-labelledby="pv" className="flex min-w-0 flex-[2_1_300px] flex-col gap-3">
          <h2 id="pv" className="h2 text-base">
            How drivers will see it
          </h2>
          <div className="cut flex flex-col gap-2.5 bg-ds-panel px-[22px] py-5 shadow-[inset_3px_0_0_var(--color-w2w-red)]">
            <div className="flex flex-wrap gap-1.5">
              <span className={`chip ${previewStatus.className}`}>{previewStatus.label}</span>
              <span className="chip">{SIM_LABELS[form.sim ?? 'IRACING']}</span>
            </div>
            <span className="text-2xl font-extrabold leading-[1.1] text-ds-ink [overflow-wrap:anywhere]">
              {form.title.trim() || 'Untitled event'}
            </span>
            <span className="text-[13px] text-ds-muted">
              {previewTrack} · {previewClasses} · {formatRaceLength(form.raceLengthMinutes)}
            </span>
            <span className="text-[13px] text-ds-muted">{previewSlotSummary}</span>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            {error && (
              <p role="alert" className="m-0 text-sm text-ds-danger">
                {error}
              </p>
            )}
            <button type="submit" disabled={saving} className="btn-primary min-h-[46px] justify-center">
              {saving ? 'Saving...' : 'Save event'}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="square"
                aria-hidden="true"
              >
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
            <Link to={isEdit && id ? `/events/${id}` : '/events'} className="btn-secondary justify-center">
              Cancel
            </Link>
            <span className="text-center text-xs text-ds-dim">Publishing posts it to the Discord events channel.</span>
          </div>
        </aside>
      </form>
    </div>
  );
}

/** Toggle button (cut-xs): selected = accent fill, idle = raised neutral. */
function toggleClass(selected: boolean): string {
  return `cut-xs min-h-9 border-0 px-3.5 text-sm font-bold transition-colors ${
    selected
      ? 'bg-w2w-red text-on-accent'
      : 'bg-ds-control text-ds-ink-soft hover:bg-ds-control-hover'
  }`;
}

function Field({
  label,
  children,
  className = '',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

/** Label + a group of buttons — a <div role="group"> rather than a <label>, since a label
 * wrapping several buttons would forward clicks on the label text to the first one. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}
