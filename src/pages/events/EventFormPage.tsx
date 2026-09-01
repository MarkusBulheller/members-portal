import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SeriesAutocomplete from '../../components/SeriesAutocomplete';
import TrackAutocomplete from '../../components/TrackAutocomplete';
import { eventsApi } from '../../lib/api/events';
import { iracingSeriesApi } from '../../lib/api/iracingSeries';
import { tracksApi } from '../../lib/api/tracks';
import { parseSeriesWeeks, composedTrackName } from '../../lib/iracingSeriesWeeks';
import { CAR_CLASSES } from '../../types/carClass';
import type { CreateEventInput, EventStatus } from '../../types/event';
import type { IracingSeriesSeason } from '../../types/iracingSeries';
import { RACE_LENGTH_PRESETS, type RaceLengthMinutes } from '../../types/raceLength';
import type { Track } from '../../types/track';

const EMPTY: CreateEventInput = {
  title: '',
  trackId: '',
  carClasses: [],
  startsAt: '',
  raceLengthMinutes: 1440,
  timeslots: [''],
  status: 'DRAFT',
  iracingSeasonId: null,
  iracingRaceWeekNum: null,
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
  const [seasons, setSeasons] = useState<IracingSeriesSeason[]>([]);

  useEffect(() => {
    void tracksApi.list().then(setTracks);
    void iracingSeriesApi.list().then(setSeasons);
  }, []);

  const selectedSeason = seasons.find((s) => s.seasonId === form.iracingSeasonId) ?? null;
  const weeksForSelectedSeason = useMemo(
    () => (selectedSeason ? parseSeriesWeeks(selectedSeason.schedule) : []),
    [selectedSeason],
  );

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
        iracingSeasonId: event.iracingSeasonId,
        iracingRaceWeekNum: event.iracingRaceWeekNum,
      });
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
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        signupDeadline: form.signupDeadline ? new Date(form.signupDeadline).toISOString() : undefined,
        timeslots: timeslots.map((t) => new Date(t).toISOString()),
      };
      const saved = isEdit && id ? await eventsApi.update(id, payload) : await eventsApi.create(payload);
      navigate(`/events/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-8">
        {isEdit ? 'Edit Event' : 'New Event'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Title">
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
        <Field label="Car Classes">
          <div className="flex flex-wrap gap-2">
            {CAR_CLASSES.map((cls) => {
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
                  className={`px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors ${
                    selected
                      ? 'bg-w2w-red text-on-accent'
                      : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
                  }`}
                >
                  {cls}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Race Length">
          <div className="flex flex-wrap gap-2">
            {RACE_LENGTH_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                aria-pressed={form.raceLengthMinutes === preset.minutes}
                onClick={() => setForm({ ...form, raceLengthMinutes: preset.minutes })}
                className={`px-4 py-2 font-heading text-xs uppercase tracking-wide transition-colors ${
                  form.raceLengthMinutes === preset.minutes
                    ? 'bg-w2w-red text-on-accent'
                    : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Starts At">
          <input
            required
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Timeslot Options">
          <p className="text-white/65 text-xs -mt-1 mb-1">
            Candidate start times drivers can flag as "I can do this one" — add as many as apply.
          </p>
          <div className="space-y-2">
            {form.timeslots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={slot}
                  onChange={(e) => {
                    const timeslots = [...form.timeslots];
                    timeslots[i] = e.target.value;
                    setForm({ ...form, timeslots });
                  }}
                  className="input"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, timeslots: form.timeslots.filter((_, j) => j !== i) })}
                  disabled={form.timeslots.length === 1}
                  className="shrink-0 px-3 py-2.5 border border-white/15 text-white/65 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:pointer-events-none font-heading text-xs uppercase tracking-wide transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, timeslots: [...form.timeslots, ''] })}
            className="mt-1 text-xs text-w2w-red hover:text-w2w-red-bright font-heading uppercase tracking-wide self-start"
          >
            + Add Timeslot
          </button>
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}
            className="input"
          >
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="SIGNUPS_CLOSED">Signups Closed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </Field>
        <Field label="Description">
          <textarea
            rows={4}
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input resize-none"
          />
        </Field>
        <Field label="Linked iRacing Week (optional)">
          <p className="text-white/65 text-xs -mt-1 mb-1">
            Shows that week's weather forecast on the event page.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1 min-w-0">
              <SeriesAutocomplete
                seasons={seasons}
                value={form.iracingSeasonId ?? null}
                onChange={(seasonId) => setForm({ ...form, iracingSeasonId: seasonId, iracingRaceWeekNum: null })}
              />
            </div>
            {selectedSeason && (
              <select
                value={form.iracingRaceWeekNum ?? ''}
                onChange={(e) =>
                  setForm({ ...form, iracingRaceWeekNum: e.target.value ? Number(e.target.value) : null })
                }
                className="input flex-1 min-w-0"
              >
                <option value="">Pick a week</option>
                {weeksForSelectedSeason.map((week) => (
                  <option key={week.weekNum} value={week.weekNum}>
                    Week {week.weekNum + 1} — {new Date(`${week.startDate}T00:00:00`).toLocaleDateString()} —{' '}
                    {composedTrackName(week)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </Field>

        {error && <p className="text-w2w-red text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-sm transition-colors clip-corner"
        >
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Event'}
        </button>
      </form>
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
