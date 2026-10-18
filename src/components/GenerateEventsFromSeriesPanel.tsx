import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { eventsApi } from '../lib/api/events';
import { iracingTracksApi } from '../lib/api/iracingTracks';
import { tracksApi } from '../lib/api/tracks';
import { formatShortDate } from '../lib/formatShortDate';
import {
  composedTrackName,
  isPastRaceWeek,
  parseSeriesWeeks,
  type SeriesWeekOption,
} from '../lib/iracingSeriesWeeks';
import { CAR_CLASSES } from '../types/carClass';
import type { IracingSeriesSeasonDetail } from '../types/iracingSeries';
import { RACE_LENGTH_PRESETS, type RaceLengthMinutes } from '../types/raceLength';

type WeekOption = SeriesWeekOption;

/** Default for the single "Days after week start" field: every start time is placed this many
 * days after the week's own `start_date` (0 = the week's listed start date). Race weeks can span
 * several days, so this lets an admin target e.g. the Saturday of a week instead of its first day. */
const DEFAULT_DAYS_AFTER_WEEK_START = '4';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/** The series page's inline "Create events for every week" panel (replaces the old modal; the
 * generation logic and API calls are unchanged): one DRAFT event per selected race week, each with
 * the chosen classes, race length and start-time template. */
export default function GenerateEventsFromSeriesPanel({
  season,
  onClose,
  onCreated,
}: {
  season: IracingSeriesSeasonDetail;
  onClose: () => void;
  onCreated: (count: number) => void;
}) {
  const weeks = useMemo(() => parseSeriesWeeks(season.schedule), [season]);
  const pastWeekNums = useMemo(
    () => new Set(weeks.filter((w) => isPastRaceWeek(w)).map((w) => w.weekNum)),
    [weeks],
  );
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(() => {
    // Weeks that already raced start unticked (still tickable, e.g. to backfill) — unless the
    // whole season is over, where "nothing selected" would just be a trap.
    const upcoming = weeks.filter((w) => !pastWeekNums.has(w.weekNum));
    return new Set((upcoming.length > 0 ? upcoming : weeks).map((w) => w.weekNum));
  });
  const [carClasses, setCarClasses] = useState<string[]>([]);
  const [raceLengthMinutes, setRaceLengthMinutes] = useState<RaceLengthMinutes>(1440);
  // Start times are plain "HH:MM" strings; one shared day offset applies to every one of them.
  const [startTimes, setStartTimes] = useState<string[]>(['19:00']);
  const [daysAfterWeekStart, setDaysAfterWeekStart] = useState(DEFAULT_DAYS_AFTER_WEEK_START);
  const [addingTime, setAddingTime] = useState(false);
  const [draftTime, setDraftTime] = useState('19:00');
  const draftTimeRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  // The panel opens in place under the header: bring it into view and move focus into it.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (addingTime) draftTimeRef.current?.focus();
  }, [addingTime]);

  function commitDraftTime() {
    if (TIME_PATTERN.test(draftTime)) {
      setStartTimes((prev) => (prev.includes(draftTime) ? prev : [...prev, draftTime]));
    }
    setAddingTime(false);
  }

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
    const validStartTimes = startTimes.filter((t) => TIME_PATTERN.test(t));
    const dayOffset = Number(daysAfterWeekStart);
    if (carClasses.length === 0) {
      setError('Pick at least one car class.');
      return;
    }
    if (validStartTimes.length === 0) {
      setError('Add at least one valid start time.');
      return;
    }
    if (daysAfterWeekStart.trim() === '' || !Number.isInteger(dayOffset) || dayOffset < 0) {
      setError('Days after week start must be a whole number, 0 or more.');
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
        const timeslots = validStartTimes.map((time) =>
          new Date(`${addDays(week.startDate, dayOffset)}T${time}`).toISOString(),
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
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-labelledby="ce-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onClose();
      }}
      className="cut flex flex-col gap-5 bg-ds-panel px-6 py-[22px] shadow-[inset_0_3px_0_var(--color-w2w-red)] outline-none"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-col gap-1">
          <h2 id="ce-title" className="h2">
            Create events for every week
          </h2>
          <span className="text-[13px] text-ds-muted">
            One draft event per selected week, each with these start times. You can tweak them before publishing.
          </span>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
          className="cut-xs flex h-[38px] w-[38px] flex-none cursor-pointer items-center justify-center border-0 bg-ds-control text-ds-ink-soft hover:bg-ds-control-hover disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <div className="flex flex-col gap-2">
          <span className="lbl">Car classes</span>
          <div role="group" aria-label="Car classes" className="seg seg-field self-start">
            {CAR_CLASSES.map((cls) => (
              <button
                key={cls}
                type="button"
                aria-pressed={carClasses.includes(cls)}
                onClick={() =>
                  setCarClasses((prev) => (prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]))
                }
              >
                {cls}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <span className="lbl">Race length</span>
          <div role="group" aria-label="Race length" className="seg seg-field self-start">
            {RACE_LENGTH_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                aria-pressed={raceLengthMinutes === preset.minutes}
                onClick={() => setRaceLengthMinutes(preset.minutes)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <div className="flex flex-col gap-2">
          <span className="lbl">Available start times (local time zone)</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {startTimes.map((time) => (
              <span
                key={time}
                className="cut-xs inline-flex h-10 items-center gap-1.5 bg-ds-field pl-3.5 pr-1 font-bold tabular-nums"
              >
                {time}
                <button
                  type="button"
                  onClick={() => setStartTimes((prev) => prev.filter((t) => t !== time))}
                  aria-label={`Remove ${time}`}
                  className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center border-0 bg-transparent text-ds-muted hover:bg-ds-control-hover"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            ))}
            {addingTime ? (
              <span className="inline-flex items-center gap-1.5">
                <input
                  ref={draftTimeRef}
                  type="time"
                  value={draftTime}
                  onChange={(e) => setDraftTime(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitDraftTime();
                    } else if (e.key === 'Escape') {
                      // Cancel just this editor, don't let the panel's Escape-to-close fire.
                      e.stopPropagation();
                      setAddingTime(false);
                    }
                  }}
                  className="input !h-10 !w-[130px] font-bold tabular-nums"
                  aria-label="New start time"
                />
                <button
                  type="button"
                  onClick={commitDraftTime}
                  disabled={!TIME_PATTERN.test(draftTime)}
                  className="cut-xs inline-flex h-10 cursor-pointer items-center gap-1.5 border-0 bg-ds-control px-3.5 text-[13px] font-bold uppercase text-ds-ink-soft hover:bg-ds-control-hover disabled:pointer-events-none disabled:opacity-50"
                >
                  Add
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAddingTime(true)}
                className="cut-xs inline-flex h-10 cursor-pointer items-center gap-1.5 border-0 bg-ds-control px-3.5 text-[13px] font-bold uppercase text-ds-ink-soft hover:bg-ds-control-hover"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add start time
              </button>
            )}
          </div>
        </div>
        <label className="flex flex-col gap-2">
          <span className="lbl">Days after week start</span>
          <input
            type="number"
            min={0}
            step={1}
            value={daysAfterWeekStart}
            onChange={(e) => setDaysAfterWeekStart(e.target.value)}
            className="input !w-[90px] font-bold"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="lbl">Weeks</span>
          <button
            type="button"
            onClick={() => setSelectedWeeks(new Set(weeks.map((w) => w.weekNum)))}
            className="cursor-pointer border-0 bg-transparent p-1 text-[13px] font-semibold text-w2w-red-ink hover:underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSelectedWeeks(new Set())}
            className="cursor-pointer border-0 bg-transparent p-1 text-[13px] font-semibold text-w2w-red-ink hover:underline"
          >
            Select none
          </button>
        </div>
        <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))]">
          {weeks.map((week) => {
            const on = selectedWeeks.has(week.weekNum);
            const past = pastWeekNums.has(week.weekNum);
            const date = formatShortDate(week.startDate);
            return (
              <button
                key={week.weekNum}
                type="button"
                aria-pressed={on}
                onClick={() => toggleWeek(week.weekNum)}
                className={`cut-xs flex min-w-0 cursor-pointer items-center gap-2.5 border-0 px-3 py-[9px] text-left text-ds-ink ${
                  on ? 'bg-ds-control shadow-[inset_3px_0_0_var(--color-w2w-red)]' : 'bg-ds-field'
                } ${past ? 'opacity-50' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`box-border flex h-[18px] w-[18px] flex-none items-center justify-center text-xs font-extrabold ${
                    on ? 'bg-w2w-red text-on-accent' : 'border-[1.5px] border-solid border-[#4a4a50] [:root[data-theme=light]_&]:border-ds-dim'
                  }`}
                >
                  {on ? '✓' : ''}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-bold">
                    <span className="num">W{week.weekNum + 1}</span> · {composedTrackName(week)}
                  </span>
                  <span className="text-xs text-ds-muted">{past ? `${date} · already raced` : date}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {progress && <p className="m-0 text-sm text-ds-muted">{progress}</p>}
      {error && (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2.5 border-t border-ds-line pt-4">
        <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={() => void handleGenerate()} disabled={busy} className="btn-primary">
          {busy ? 'Creating...' : `Create ${selectedWeeks.size} draft event${selectedWeeks.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  );
}
