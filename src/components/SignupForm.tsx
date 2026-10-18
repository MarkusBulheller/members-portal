import { useEffect, useId, useRef, useState } from 'react';
import { formatClock, formatDayShort, formatHour, formatSlot, hoursForSlot } from '../lib/eventFormatting';
import type { SignupFormValues } from '../lib/signupFormValues';
import type { Car } from '../types/car';
import type { RaceEventDetail } from '../types/event';

/** Numbered step badge — filled with the accent once the step has an answer. */
function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`num cut-xs flex h-[26px] w-[26px] flex-none items-center justify-center text-sm ${
        done ? 'bg-w2w-red text-on-accent' : 'bg-ds-control text-ds-muted'
      }`}
    >
      {n}
    </span>
  );
}

const slotTime = formatClock;
const slotDay = formatDayShort;

const STEP_HEADING = 'm-0 flex items-center gap-2.5 text-[15px] font-bold text-ds-ink';

/** The guided signup form: start time(s) → car class (+ optional secondary class and favourite
 * car) → the hours of the race the driver can take a stint. Holds its own draft state, seeded from
 * `initial` on mount, so nothing is saved until the caller's onSubmit runs — mount a fresh
 * instance (or change `key`) to reseed it. Used for a driver's own signup and, with
 * `driverLabel` set, for an admin editing someone else's. */
export default function SignupForm({
  event,
  cars,
  initial,
  submitLabel,
  submitting,
  driverLabel = 'You',
  onSubmit,
  onDiscard,
  slotCounts,
  onChange,
}: {
  event: Pick<RaceEventDetail, 'timeslots' | 'carClasses' | 'raceLengthMinutes'>;
  cars: Car[];
  initial: SignupFormValues;
  submitLabel: string;
  submitting: boolean;
  driverLabel?: string;
  onSubmit: (values: SignupFormValues) => void;
  onDiscard?: () => void;
  /** Per-timeslot (id) count of OTHER drivers already signed up for it — shown as "N signed up"
   * on each start-time button, plus one for this form's own pick while it's selected. Omit to
   * show no counts. */
  slotCounts?: Record<string, number>;
  /** Called with the current draft whenever it changes (and once on mount), so the page can show
   * the driver's own row in the availability grid live, before anything is saved. */
  onChange?: (values: SignupFormValues) => void;
}) {
  const startTimeHeadingId = useId();
  const carClassHeadingId = useId();
  const secondaryClassHeadingId = useId();
  const favouriteCarId = useId();

  const [timeslotIds, setTimeslotIds] = useState(initial.timeslotIds);
  const [carClass, setCarClass] = useState(initial.carClass);
  const [secondaryCarClass, setSecondaryCarClass] = useState(initial.secondaryCarClass);
  const [carId, setCarId] = useState(initial.carId);
  const [availableHours, setAvailableHours] = useState(initial.availableHours);

  // Report edits upward only when a value actually changes. `onChange` is read through a ref: the
  // parent usually passes a fresh function every render, and depending on it here would re-fire
  // this effect after each parent re-render — which the parent answers with setState, i.e. an
  // endless render loop ("Maximum update depth exceeded").
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({ timeslotIds, carClass, secondaryCarClass, carId, availableHours });
  }, [timeslotIds, carClass, secondaryCarClass, carId, availableHours]);

  const carsInClass = cars.filter((c) => c.carClass === carClass);
  const you = driverLabel === 'You' ? 'you' : 'they';

  function toggleSlot(slotId: string) {
    if (timeslotIds.includes(slotId)) {
      setTimeslotIds((prev) => prev.filter((s) => s !== slotId));
      // Dropping a slot drops its hour picks too — an hour only means something relative to
      // the timeslot it belongs to.
      const slot = event.timeslots.find((s) => s.id === slotId);
      if (slot) {
        const dropped = new Set(hoursForSlot(slot.startsAt, event.raceLengthMinutes));
        setAvailableHours((prev) => prev.filter((h) => !dropped.has(h)));
      }
    } else {
      setTimeslotIds((prev) => [...prev, slotId]);
    }
  }

  /** "Select all" / "Clear" for one start time's hours. */
  function setSlotHours(hours: string[], on: boolean) {
    setAvailableHours((prev) => {
      const rest = prev.filter((h) => !hours.includes(h));
      return on ? [...rest, ...hours] : rest;
    });
  }

  function toggleHour(hourIso: string) {
    setAvailableHours((prev) => (prev.includes(hourIso) ? prev.filter((h) => h !== hourIso) : [...prev, hourIso]));
  }

  const canSubmit = timeslotIds.length > 0 && !!carClass;
  const summary = !canSubmit
    ? 'Pick at least one start time and a class'
    : `${timeslotIds.length} start time${timeslotIds.length === 1 ? '' : 's'} · ${carClass}${
        secondaryCarClass ? ` (or ${secondaryCarClass})` : ''
      } · ${availableHours.length} hour${availableHours.length === 1 ? '' : 's'} flagged`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <h3 id={startTimeHeadingId} className={STEP_HEADING}>
          <StepBadge n={1} done={timeslotIds.length > 0} />
          Which start times can {you} do?
        </h3>
        <div
          role="group"
          aria-labelledby={startTimeHeadingId}
          className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-2"
        >
          {event.timeslots.map((slot) => {
            const selected = timeslotIds.includes(slot.id);
            const start = new Date(slot.startsAt);
            const count = slotCounts ? (slotCounts[slot.id] ?? 0) + (selected ? 1 : 0) : null;
            return (
              <button
                key={slot.id}
                type="button"
                aria-pressed={selected}
                aria-label={count === null ? formatSlot(slot.startsAt) : `${formatSlot(slot.startsAt)}, ${count} signed up`}
                onClick={() => toggleSlot(slot.id)}
                className={`cut-sm flex min-h-[68px] flex-col items-start gap-0.5 border-0 px-4 py-2.5 text-left text-ds-ink ${
                  selected ? 'bg-ds-control shadow-[inset_0_-3px_0_var(--color-w2w-red)]' : 'bg-ds-field hover:bg-ds-raised'
                }`}
              >
                <span className="num text-2xl leading-[1.1]">{slotTime(start)}</span>
                <span className="text-xs text-ds-muted">
                  {slotDay(start)}
                  {count !== null && ` · ${count} signed up`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <h3 className={STEP_HEADING}>
          <StepBadge n={2} done={!!carClass} />
          Car class
        </h3>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="flex flex-col gap-1.5">
            <span id={carClassHeadingId} className="lbl text-xs">
              Main class
            </span>
            <div role="group" aria-labelledby={carClassHeadingId} className="seg seg-field">
              {event.carClasses.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  className="min-h-9 px-[18px] font-extrabold"
                  aria-pressed={carClass === cls}
                  onClick={() => {
                    setCarClass(carClass === cls ? '' : cls);
                    setCarId('');
                    if (secondaryCarClass === cls) setSecondaryCarClass('');
                  }}
                >
                  {cls}
                </button>
              ))}
            </div>
          </div>

          {event.carClasses.length > 1 && carClass && (
            <div className="flex flex-col gap-1.5">
              <span id={secondaryClassHeadingId} className="lbl text-xs">
                Would also drive
              </span>
              <div role="group" aria-labelledby={secondaryClassHeadingId} className="seg seg-field">
                {event.carClasses
                  .filter((cls) => cls !== carClass)
                  .map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      className="min-h-9 px-[18px] font-extrabold"
                      aria-pressed={secondaryCarClass === cls}
                      onClick={() => setSecondaryCarClass(secondaryCarClass === cls ? '' : cls)}
                    >
                      {cls}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {carClass && (
            <div className="flex flex-[1_1_220px] flex-col gap-1.5">
              <label htmlFor={favouriteCarId} className="lbl text-xs">
                Favourite car (optional)
              </label>
              <select id={favouriteCarId} value={carId} onChange={(e) => setCarId(e.target.value)} className="input">
                <option value="">No preference</option>
                {carsInClass.map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={STEP_HEADING}>
            <StepBadge n={3} done={availableHours.length > 0} />
            Which hours could {you} drive?
          </h3>
          <span className="text-xs text-ds-muted">Optional · helps whoever builds the stint plan</span>
        </div>
        {timeslotIds.length === 0 && (
          <p className="cut-sm m-0 bg-ds-field px-4 py-3.5 text-ds-muted">
            Pick a start time first. Your hour grid shows up here.
          </p>
        )}
        {event.timeslots
          .filter((slot) => timeslotIds.includes(slot.id))
          .map((slot) => {
            const hours = hoursForSlot(slot.startsAt, event.raceLengthMinutes);
            const start = new Date(slot.startsAt);
            const allOn = hours.every((h) => availableHours.includes(h));
            return (
              <div key={slot.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="m-0 text-[13px] font-bold text-ds-ink-soft">
                    {slotDay(start)} · {slotTime(start)} start
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSlotHours(hours, !allOn)}
                    aria-label={`${allOn ? 'Clear' : 'Select all'} hours for the ${formatSlot(slot.startsAt)} start`}
                    className="min-h-8 border-0 bg-transparent px-1 text-xs font-bold uppercase text-w2w-red-ink transition-colors hover:text-ds-ink"
                  >
                    {allOn ? 'Clear' : 'Select all'}
                  </button>
                </div>
                <div
                  role="group"
                  aria-label={`Hours for the ${formatSlot(slot.startsAt)} start`}
                  className="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1"
                >
                  {hours.map((hourIso) => {
                    const selected = availableHours.includes(hourIso);
                    return (
                      <button
                        key={hourIso}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleHour(hourIso)}
                        className={`cut-xs h-10 min-w-0 border-0 p-0 text-[13px] font-bold tabular-nums transition-colors ${
                          selected
                            ? 'bg-w2w-red text-on-accent hover:bg-w2w-red-bright'
                            : 'bg-ds-field text-ds-muted hover:bg-ds-raised'
                        }`}
                      >
                        {formatHour(hourIso)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-line pt-[18px]">
        <span className="text-[13px] text-ds-muted">{summary}</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSubmit({ timeslotIds, carClass, secondaryCarClass, carId, availableHours })}
            disabled={submitting || timeslotIds.length === 0 || !carClass}
            className="btn-primary disabled:bg-ds-control disabled:text-ds-dim disabled:opacity-100"
          >
            {submitting ? 'Saving...' : submitLabel}
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
          {onDiscard && (
            <button type="button" onClick={onDiscard} disabled={submitting} className="btn-secondary">
              Discard changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
