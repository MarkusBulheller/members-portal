import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Modal from './Modal';
import { ApiError } from '../lib/api';
import { eventsApi } from '../lib/api/events';
import { iracingTracksApi } from '../lib/api/iracingTracks';
import { tracksApi } from '../lib/api/tracks';
import { composedTrackName, parseSeriesWeeks, type SeriesWeekOption } from '../lib/iracingSeriesWeeks';
import { CAR_CLASSES } from '../types/carClass';
import type { IracingSeriesSeason } from '../types/iracingSeries';
import { RACE_LENGTH_PRESETS, type RaceLengthMinutes } from '../types/raceLength';

type WeekOption = SeriesWeekOption;

interface StartTimeTemplate {
  /** Days after the week's own `start_date` — 0 means "the week's listed start date" (the old,
   * only, behavior). Race weeks can span several days, so this lets an admin target e.g. the
   * Saturday of a Mon-Sun week instead of always the week's first day. */
  dayOffset: number;
  time: string; // "HH:MM"
}

/** Local-calendar date math (no UTC round-trip) so a date string always lands on the same
 * calendar day regardless of the browser's timezone offset. */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
}

export default function GenerateEventsFromSeriesModal({
  season,
  onClose,
  onCreated,
}: {
  season: IracingSeriesSeason;
  onClose: () => void;
  onCreated: (count: number) => void;
}) {
  const weeks = useMemo(() => parseSeriesWeeks(season.schedule), [season]);
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(() => new Set(weeks.map((w) => w.weekNum)));
  const referenceWeek = useMemo(
    () => weeks.find((w) => selectedWeeks.has(w.weekNum)) ?? weeks[0],
    [weeks, selectedWeeks],
  );
  const [carClasses, setCarClasses] = useState<string[]>([]);
  const [raceLengthMinutes, setRaceLengthMinutes] = useState<RaceLengthMinutes>(1440);
  const [startTimes, setStartTimes] = useState<StartTimeTemplate[]>([{ dayOffset: 0, time: '19:00' }]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleWeek(weekNum: number) {
    setSelectedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekNum)) next.delete(weekNum);
      else next.add(weekNum);
      return next;
    });
  }

  async function handleGenerate() {
    setError(null);
    const validStartTimes = startTimes.filter(
      (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) && Number.isInteger(s.dayOffset) && s.dayOffset >= 0,
    );
    if (carClasses.length === 0) {
      setError('Pick at least one car class.');
      return;
    }
    if (validStartTimes.length === 0) {
      setError('Add at least one valid start time.');
      return;
    }
    const chosenWeeks = weeks.filter((w) => selectedWeeks.has(w.weekNum));
    if (chosenWeeks.length === 0) {
      setError('Select at least one week.');
      return;
    }

    setBusy(true);
    try {
      setProgress('Resolving tracks...');
      const [existingTracks, catalogTracks] = await Promise.all([tracksApi.list(), iracingTracksApi.list(true)]);
      const trackIdByName = new Map(existingTracks.map((t) => [t.name.toLowerCase(), t.id]));

      const uniqueNames = new Map<string, WeekOption>();
      for (const week of chosenWeeks) {
        const name = composedTrackName(week);
        if (!uniqueNames.has(name)) uniqueNames.set(name, week);
      }

      for (const [name, week] of uniqueNames) {
        if (trackIdByName.has(name.toLowerCase())) continue;
        const catalogMatch = catalogTracks.find((t) => t.trackId === week.iracingTrackId);
        const created = await tracksApi.create({
          name,
          category: catalogMatch?.category ?? 'road',
          location: catalogMatch?.location ?? undefined,
          imageUrl: catalogMatch?.smallImageUrl ?? undefined,
        });
        trackIdByName.set(name.toLowerCase(), created.id);
      }

      let created = 0;
      const failures: string[] = [];
      for (const week of chosenWeeks) {
        const name = composedTrackName(week);
        const trackId = trackIdByName.get(name.toLowerCase());
        if (!trackId) {
          failures.push(`Week ${week.weekNum + 1}: couldn't resolve a track`);
          continue;
        }
        setProgress(`Creating week ${week.weekNum + 1} of ${chosenWeeks[chosenWeeks.length - 1].weekNum + 1}...`);
        const timeslots = validStartTimes.map((s) =>
          new Date(`${addDays(week.startDate, s.dayOffset)}T${s.time}`).toISOString(),
        );
        try {
          await eventsApi.create({
            title: `${season.seriesName} — Week ${week.weekNum + 1}: ${name}`,
            trackId,
            carClasses,
            startsAt: timeslots[0],
            raceLengthMinutes,
            timeslots,
            status: 'DRAFT',
            iracingSeasonId: season.seasonId,
            iracingRaceWeekNum: week.weekNum,
          });
          created++;
        } catch (err) {
          failures.push(`Week ${week.weekNum + 1}: ${err instanceof ApiError ? err.message : 'failed to create'}`);
        }
      }

      setProgress(null);
      if (failures.length > 0) {
        setError(`Created ${created} of ${chosenWeeks.length}. Failed: ${failures.join('; ')}`);
      }
      if (created > 0) {
        onCreated(created);
      }
      if (failures.length === 0) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Create Events for Every Week" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Car Classes">
          <div className="flex flex-wrap gap-2">
            {CAR_CLASSES.map((cls) => (
              <button
                key={cls}
                type="button"
                aria-pressed={carClasses.includes(cls)}
                onClick={() =>
                  setCarClasses((prev) => (prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]))
                }
                className={`px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors ${
                  carClasses.includes(cls)
                    ? 'bg-w2w-red text-on-accent'
                    : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
                }`}
              >
                {cls}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Race Length">
          <div className="flex flex-wrap gap-2">
            {RACE_LENGTH_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                aria-pressed={raceLengthMinutes === preset.minutes}
                onClick={() => setRaceLengthMinutes(preset.minutes)}
                className={`px-4 py-2 font-heading text-xs uppercase tracking-wide transition-colors ${
                  raceLengthMinutes === preset.minutes
                    ? 'bg-w2w-red text-on-accent'
                    : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Available Start Times">
          <p className="text-white/50 text-xs -mt-1 mb-1">
            Day offset is relative to each week's own start date (0 = that date). Same offset is applied across
            every selected week.
          </p>
          <div className="space-y-2">
            {startTimes.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={slot.dayOffset}
                    onChange={(e) => {
                      const next = [...startTimes];
                      next[i] = { ...next[i], dayOffset: Math.max(0, Math.floor(Number(e.target.value) || 0)) };
                      setStartTimes(next);
                    }}
                    className="input w-16"
                    aria-label="Days after week start"
                  />
                  <span className="text-white/40 text-xs w-20 shrink-0">
                    {referenceWeek ? weekdayName(addDays(referenceWeek.startDate, slot.dayOffset)) : 'days'}
                  </span>
                </div>
                <input
                  type="time"
                  value={slot.time}
                  onChange={(e) => {
                    const next = [...startTimes];
                    next[i] = { ...next[i], time: e.target.value };
                    setStartTimes(next);
                  }}
                  className="input w-40"
                />
                <button
                  type="button"
                  onClick={() => setStartTimes(startTimes.filter((_, j) => j !== i))}
                  disabled={startTimes.length === 1}
                  className="shrink-0 px-3 py-2 border border-white/15 text-white/50 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:pointer-events-none font-heading text-xs uppercase tracking-wide transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStartTimes([...startTimes, { dayOffset: 0, time: '19:00' }])}
            className="mt-1 text-xs text-w2w-red hover:text-w2w-red-bright font-heading uppercase tracking-wide self-start"
          >
            + Add Start Time
          </button>
        </Field>

        <Field label={`Weeks (${selectedWeeks.size} of ${weeks.length} selected)`}>
          <div className="flex gap-3 mb-2">
            <button
              type="button"
              onClick={() => setSelectedWeeks(new Set(weeks.map((w) => w.weekNum)))}
              className="text-xs text-w2w-red hover:text-w2w-red-bright font-heading uppercase tracking-wide"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => setSelectedWeeks(new Set())}
              className="text-xs text-white/50 hover:text-white font-heading uppercase tracking-wide"
            >
              Select None
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto border border-white/10 divide-y divide-white/5">
            {weeks.map((week) => (
              <label
                key={week.weekNum}
                className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={selectedWeeks.has(week.weekNum)}
                  onChange={() => toggleWeek(week.weekNum)}
                  className="shrink-0"
                />
                <span className="text-white/50 w-14 shrink-0">Week {week.weekNum + 1}</span>
                <span className="text-white/50 w-24 shrink-0">
                  {new Date(`${week.startDate}T00:00:00`).toLocaleDateString()}
                </span>
                <span className="text-white truncate">{composedTrackName(week)}</span>
              </label>
            ))}
          </div>
        </Field>

        {progress && <p className="text-white/65 text-sm">{progress}</p>}
        {error && (
          <p role="alert" className="text-w2w-red text-sm">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => void handleGenerate()}
            disabled={busy}
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
          >
            {busy ? 'Creating...' : `Create ${selectedWeeks.size} Draft Event${selectedWeeks.size === 1 ? '' : 's'}`}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="px-5 py-2.5 border border-white/20 text-white/60 hover:text-white disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/50">{label}</span>
      {children}
    </label>
  );
}
