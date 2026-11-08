import { useMemo } from 'react';
import { maxFuelPerLapForStops, stopsOptions, type StopsInput } from '../lib/fuelStrategy';

/** How many stop counts below the no-saving plan are listed. */
const OPTIONS_SHOWN = 3;
/** A saving above this is flagged as very hard to hold over a whole race. */
const HARD_SAVING_PERCENT = 10;
const MAX_STOPS_SEARCHED = 60;

export interface FuelStrategyDriver {
  name: string;
  /** The driver's own fuel use per lap, when they have one. */
  fuelPerLapLiters: number | null;
  /** The driver's own fuel saving in percent, replacing the team's; null follows the team. */
  savePercentOverride: number | null;
}

interface FuelStrategyPanelProps extends StopsInput {
  /** The team's normal fuel use per lap, before any planned saving. */
  normalFuelPerLap: number;
  /** The saving the plan currently assumes, in percent. */
  appliedSavePercent: number;
  /** Stops in the plan as it stands now (with the applied saving). */
  currentStops: number;
  drivers: FuelStrategyDriver[];
  canManage: boolean;
  busy: boolean;
  onApply: (savePercent: number | null) => void;
}

/** Fewest stops that finish the race at the normal fuel use. */
function stopsWithoutSaving(input: StopsInput, normalFuelPerLap: number): number | null {
  for (let stops = 0; stops <= MAX_STOPS_SEARCHED; stops += 1) {
    const maxUse = maxFuelPerLapForStops(input, stops);
    if (maxUse !== null && maxUse >= normalFuelPerLap) return stops;
  }
  return null;
}

/** "What fuel saving makes this race one stop shorter?" Lists the saving needed for fewer stops and
 * applies the chosen one to the plan (Race settings → Fuel saving), which re-sizes the stints. */
export default function FuelStrategyPanel({
  normalFuelPerLap,
  appliedSavePercent,
  currentStops,
  drivers,
  canManage,
  busy,
  onApply,
  ...input
}: FuelStrategyPanelProps) {
  const { raceLengthMinutes, pitMinutes, tankLiters, formationLapFuelLiters, lapTimeSeconds, marginLaps } = input;
  const baseline = useMemo(
    () => stopsWithoutSaving(input, normalFuelPerLap),
    // `input` is rebuilt every render; its fields are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raceLengthMinutes, pitMinutes, tankLiters, formationLapFuelLiters, lapTimeSeconds, marginLaps, normalFuelPerLap],
  );
  const options = useMemo(() => {
    if (baseline === null) return [];
    const counts: number[] = [];
    for (let i = 1; i <= OPTIONS_SHOWN && baseline - i >= 0; i += 1) counts.push(baseline - i);
    return stopsOptions(input, normalFuelPerLap, counts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, raceLengthMinutes, pitMinutes, tankLiters, formationLapFuelLiters, lapTimeSeconds, marginLaps, normalFuelPerLap]);

  const overridden = drivers.filter((d) => d.savePercentOverride !== null);
  // Drivers with their own saving don't follow the option's percentage, so they're listed apart.
  const driversWithOwnFuel = drivers.filter(
    (d) => d.savePercentOverride === null && d.fuelPerLapLiters !== null && d.fuelPerLapLiters > 0,
  );
  const driverSavings = (percent: number) =>
    driversWithOwnFuel.map((d) => `${d.name} −${(((d.fuelPerLapLiters as number) * percent) / 100).toFixed(2)} L`).join(' · ');

  return (
    <section aria-labelledby="fuel-strategy-title" className="cut flex flex-col gap-3.5 bg-ds-panel px-6 py-[22px]">
      <div className="flex flex-col gap-1">
        <h2 id="fuel-strategy-title" className="h2">
          Fuel strategy
        </h2>
        <span className="text-[13px] text-ds-muted">
          Fewer stops need less fuel per lap. Pick a target to see the saving it takes, then apply it to size the stints on it.
        </span>
      </div>

      <p className="m-0 text-[13px] text-ds-ink-soft">
        {baseline === null ? (
          'The race can’t be finished on this setup with a sensible number of stops.'
        ) : (
          <>
            At {normalFuelPerLap.toFixed(2)} L/lap the race needs{' '}
            <span className="num font-bold text-ds-ink">{baseline}</span> {baseline === 1 ? 'stop' : 'stops'}.
          </>
        )}
        {appliedSavePercent > 0 && (
          <>
            {' '}
            The plan currently assumes a <span className="num font-bold text-ds-ink">{appliedSavePercent}%</span> saving and has{' '}
            <span className="num font-bold text-ds-ink">{currentStops}</span> {currentStops === 1 ? 'stop' : 'stops'}.
          </>
        )}
      </p>

      {overridden.length > 0 && (
        <p className="m-0 text-[13px] text-ds-ink-soft">
          Own fuel saving set for {overridden.map((d) => `${d.name} (${d.savePercentOverride}%)`).join(', ')}: their stints use
          that instead of the team saving, so the real number of stops can differ from the options below.
        </p>
      )}

      {options.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {options.map((option) => {
            const applied = Math.abs(appliedSavePercent - option.savePercent) < 0.05;
            const hard = option.savePercent > HARD_SAVING_PERCENT;
            return (
              <li
                key={option.stops}
                className="cut-sm flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-ds-field px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-bold text-ds-ink">
                    {option.stops} {option.stops === 1 ? 'stop' : 'stops'}
                  </span>
                  <span className="text-[13px] text-ds-muted">
                    {option.fuelPerLapLiters.toFixed(3)} L/lap: save {option.saveLiters.toFixed(2)} L per lap (
                    <span className={hard ? 'font-semibold text-ds-warn' : undefined}>{option.savePercent}%</span>
                    {hard ? ', very hard to hold' : ''})
                  </span>
                  {driversWithOwnFuel.length > 0 && (
                    <span className="text-xs text-ds-dim">{driverSavings(option.savePercent)}</span>
                  )}
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => onApply(option.savePercent)}
                    disabled={busy || applied}
                    className="btn-secondary btn-sm"
                  >
                    {applied ? 'Applied' : 'Apply'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {baseline !== null && options.length === 0 && (
        <p className="m-0 text-[13px] text-ds-muted">No shorter plan is possible with this tank and pit time.</p>
      )}

      {canManage && appliedSavePercent > 0 && (
        <div>
          <button type="button" onClick={() => onApply(null)} disabled={busy} className="btn-secondary btn-sm">
            Clear fuel saving
          </button>
        </div>
      )}
      <p className="m-0 text-xs text-ds-dim">
        Based on dry lap time and a full pit stop each time; stints are cut to a full tank, and the final stint takes only the
        fuel it needs (plus the finish margin).
      </p>
    </section>
  );
}
