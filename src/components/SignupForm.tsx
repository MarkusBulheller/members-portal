import { useId, useState } from 'react';
import { formatHour, formatSlot, hoursForSlot } from '../lib/eventFormatting';
import type { SignupFormValues } from '../lib/signupFormValues';
import type { Car } from '../types/car';
import type { RaceEventDetail } from '../types/event';

const OPTION_ACTIVE = 'bg-w2w-red text-on-accent';
const OPTION_IDLE = 'border border-white/20 text-white/60 hover:text-white hover:border-white/40';

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
}: {
  event: Pick<RaceEventDetail, 'timeslots' | 'carClasses' | 'raceLengthMinutes'>;
  cars: Car[];
  initial: SignupFormValues;
  submitLabel: string;
  submitting: boolean;
  driverLabel?: string;
  onSubmit: (values: SignupFormValues) => void;
  onDiscard?: () => void;
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

  const carsInClass = cars.filter((c) => c.carClass === carClass);

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

  function toggleHour(hourIso: string) {
    setAvailableHours((prev) => (prev.includes(hourIso) ? prev.filter((h) => h !== hourIso) : [...prev, hourIso]));
  }

  return (
    <div>
      <h3 id={startTimeHeadingId} className="font-heading text-xs tracking-[0.2em] uppercase text-white/65 mb-2">
        1. Which start time(s) can {driverLabel === 'You' ? 'you' : 'they'} do?
      </h3>
      <div role="group" aria-labelledby={startTimeHeadingId} className="flex flex-wrap gap-2">
        {event.timeslots.map((slot) => {
          const selected = timeslotIds.includes(slot.id);
          return (
            <button
              key={slot.id}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleSlot(slot.id)}
              className={`px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors ${
                selected ? OPTION_ACTIVE : OPTION_IDLE
              }`}
            >
              {formatSlot(slot.startsAt)}
            </button>
          );
        })}
      </div>

      <h3 id={carClassHeadingId} className="mt-6 font-heading text-xs tracking-[0.2em] uppercase text-white/65 mb-2">
        2. Car class
      </h3>
      <div role="group" aria-labelledby={carClassHeadingId} className="flex flex-wrap gap-2">
        {event.carClasses.map((cls) => (
          <button
            key={cls}
            type="button"
            aria-pressed={carClass === cls}
            onClick={() => {
              setCarClass(carClass === cls ? '' : cls);
              setCarId('');
              if (secondaryCarClass === cls) setSecondaryCarClass('');
            }}
            className={`px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors ${
              carClass === cls ? OPTION_ACTIVE : OPTION_IDLE
            }`}
          >
            {cls}
          </button>
        ))}
      </div>

      {event.carClasses.length > 1 && carClass && (
        <div className="mt-3">
          <p id={secondaryClassHeadingId} className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">
            Secondary class (optional)
          </p>
          <div role="group" aria-labelledby={secondaryClassHeadingId} className="flex flex-wrap gap-2 mt-2">
            {event.carClasses
              .filter((cls) => cls !== carClass)
              .map((cls) => (
                <button
                  key={cls}
                  type="button"
                  aria-pressed={secondaryCarClass === cls}
                  onClick={() => setSecondaryCarClass(secondaryCarClass === cls ? '' : cls)}
                  className={`px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors ${
                    secondaryCarClass === cls ? OPTION_ACTIVE : OPTION_IDLE
                  }`}
                >
                  {cls}
                </button>
              ))}
          </div>
        </div>
      )}

      {carClass && (
        <div className="mt-3 flex flex-col gap-2 max-w-xs">
          <label htmlFor={favouriteCarId} className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">
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

      {timeslotIds.length > 0 && (
        <>
          <h3 className="mt-6 font-heading text-xs tracking-[0.2em] uppercase text-white/65 mb-2">
            3. Which hours can {driverLabel === 'You' ? 'you' : 'they'} drive? (optional)
          </h3>
          <p className="text-white/65 text-xs mb-3">
            For each start time picked, flag the hours of the race {driverLabel === 'You' ? 'you' : 'they'} could take
            a stint.
          </p>
          {event.timeslots
            .filter((slot) => timeslotIds.includes(slot.id))
            .map((slot) => {
              const hours = hoursForSlot(slot.startsAt, event.raceLengthMinutes);
              return (
                <div key={slot.id} className="mb-6">
                  <h4 className="text-white/65 text-xs font-heading uppercase tracking-wide mb-2">
                    {formatSlot(slot.startsAt)}
                  </h4>
                  <div className="overflow-x-auto border border-white/10">
                    <table className="border-collapse text-sm">
                      <caption className="sr-only">
                        Hourly stint availability for the {formatSlot(slot.startsAt)} start option
                      </caption>
                      <thead>
                        <tr className="border-b border-white/10">
                          <th
                            scope="col"
                            className="sticky left-0 bg-w2w-charcoal py-2 px-3 text-left font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase"
                          >
                            Driver
                          </th>
                          {hours.map((hourIso) => (
                            <th
                              key={hourIso}
                              scope="col"
                              className="py-2 px-1 text-center font-heading text-[10px] tracking-wide text-white/65 uppercase whitespace-nowrap"
                            >
                              {formatHour(hourIso)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th
                            scope="row"
                            className="sticky left-0 bg-w2w-charcoal py-1.5 px-3 text-left font-normal text-white whitespace-nowrap"
                          >
                            {driverLabel}
                          </th>
                          {hours.map((hourIso) => {
                            const selected = availableHours.includes(hourIso);
                            return (
                              <td key={hourIso} className="p-0.5">
                                <button
                                  type="button"
                                  aria-pressed={selected}
                                  aria-label={formatHour(hourIso)}
                                  onClick={() => toggleHour(hourIso)}
                                  className={`w-7 h-7 transition-colors hover:bg-w2w-red/70 cursor-pointer ${
                                    selected ? 'bg-w2w-red' : 'bg-white/5'
                                  }`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
        </>
      )}

      <div className="mt-5 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onSubmit({ timeslotIds, carClass, secondaryCarClass, carId, availableHours })}
          disabled={submitting || timeslotIds.length === 0 || !carClass}
          className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-40 text-on-accent font-heading font-bold text-xs uppercase tracking-wide transition-colors clip-corner"
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={submitting}
            className="px-5 py-2.5 border border-white/20 text-white/60 hover:text-white disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
          >
            Discard Changes
          </button>
        )}
      </div>
    </div>
  );
}
