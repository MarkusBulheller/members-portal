/** Fuel-strategy maths for the team plan page: sizing the final stint to the flag and finding the
 * fuel saving that makes a plan with fewer pit stops. Pure functions, no React. */

/** Laps of extra fuel the final stint carries when the team hasn't set a margin. */
export const DEFAULT_FINISH_MARGIN_LAPS = 1;

/** Fuel use after a planned saving (percent of the normal per-lap figure). */
export function savedFuelUsage(usage: number, savePercent: number): number {
  const clamped = Math.min(Math.max(savePercent, 0), 50);
  return usage * (1 - clamped / 100);
}

export interface FinalStintInput {
  /** Minutes from the end of the previous stint to the end of the race. */
  availableMinutes: number;
  /** Pit time before the stint that doesn't depend on the fuel taken: drive-through and tyres. */
  fixedPitMinutes: number;
  /** How long refuelling a full tank takes. The stop's refuel time is this scaled by the fuel taken. */
  fullRefuelMinutes: number;
  tankLiters: number;
  fuelPerLapLiters: number;
  lapTimeSeconds: number;
  marginLaps: number;
}

export interface FinalStintPlan {
  /** Time the final stint is on track. */
  durationMinutes: number;
  /** The whole stop before it: fixed pit time plus the shortened refuel. */
  pitMinutes: number;
  /** Refuel part of that stop. */
  refuelMinutes: number;
  /** What the shortened refuel saves compared with a full-tank one. */
  refuelSavedMinutes: number;
  /** Fuel in the tank at the start of the final stint: the laps to the flag plus the margin. */
  fuelLiters: number;
  /** Laps to the flag, counting the one in progress when time runs out (without the margin). */
  laps: number;
  /** Laps of extra fuel included in fuelLiters. */
  marginLaps: number;
}

/** The last pit stop and stint, with the car taking only the fuel it needs to reach the flag. Taking
 * less fuel shortens the stop, which in turn gives the stint more time, so the two are solved
 * together (the equations are linear). Returns null when it can't be solved or the needed fuel
 * doesn't fit the tank. */
export function planFinalStint(input: FinalStintInput): FinalStintPlan | null {
  const { availableMinutes, fixedPitMinutes, fullRefuelMinutes, tankLiters, fuelPerLapLiters, lapTimeSeconds, marginLaps } =
    input;
  if (!(tankLiters > 0) || !(fuelPerLapLiters > 0) || !(lapTimeSeconds > 0)) return null;
  if (fullRefuelMinutes < 0 || fixedPitMinutes < 0 || marginLaps < 0) return null;

  const litersPerMinute = (fuelPerLapLiters * 60) / lapTimeSeconds;
  const refuelPerLiter = fullRefuelMinutes / tankLiters;
  // duration = available - fixedPit - refuelPerLiter * (litersPerMinute * duration + margin fuel)
  const marginLiters = fuelPerLapLiters * marginLaps;
  const durationMinutes =
    (availableMinutes - fixedPitMinutes - refuelPerLiter * marginLiters) / (1 + refuelPerLiter * litersPerMinute);
  if (!(durationMinutes > 0)) return null;

  // The car has to finish the lap it is on when the time runs out, so it carries whole laps (plus the
  // margin); the extra fuel lengthens the refuel a little and shortens the stint to match.
  const laps = Math.ceil((durationMinutes * 60) / lapTimeSeconds - 1e-9);
  const fuelLiters = fuelPerLapLiters * (laps + marginLaps);
  if (fuelLiters > tankLiters + 1e-9) return null;

  const refuelMinutes = refuelPerLiter * fuelLiters;
  const pitMinutes = fixedPitMinutes + refuelMinutes;
  const stintMinutes = availableMinutes - pitMinutes;
  if (!(stintMinutes > 0)) return null;
  return {
    durationMinutes: stintMinutes,
    pitMinutes,
    refuelMinutes,
    refuelSavedMinutes: Math.max(0, fullRefuelMinutes - refuelMinutes),
    fuelLiters,
    laps,
    marginLaps,
  };
}

export interface StopsInput {
  raceLengthMinutes: number;
  /** Pit time of one full stop. */
  pitMinutes: number;
  tankLiters: number;
  /** Comes off the first stint's tank only. */
  formationLapFuelLiters: number;
  lapTimeSeconds: number;
  /** Extra laps of fuel on top of the laps to the flag. */
  marginLaps: number;
}

/** Laps the car can cover with `stops` full-tank stints at `fuelPerLap`: the first stint lacks the
 * formation-lap fuel. */
function lapsAvailable(input: StopsInput, stops: number, fuelPerLap: number): number {
  const firstTank = Math.max(0, input.tankLiters - input.formationLapFuelLiters);
  return Math.floor(firstTank / fuelPerLap) + stops * Math.floor(input.tankLiters / fuelPerLap);
}

/** Laps to drive when the race has `stops` stops. */
function lapsNeeded(input: StopsInput, stops: number): number {
  const drivingMinutes = input.raceLengthMinutes - stops * input.pitMinutes;
  return Math.ceil((drivingMinutes * 60) / input.lapTimeSeconds) + Math.ceil(input.marginLaps);
}

/** The highest fuel use per lap (litres, rounded down to 3 decimals) that still finishes the race
 * with exactly `stops` pit stops, or null when even a tiny use can't. */
export function maxFuelPerLapForStops(input: StopsInput, stops: number): number | null {
  if (!(input.tankLiters > 0) || !(input.lapTimeSeconds > 0) || stops < 0) return null;
  if (input.tankLiters - input.formationLapFuelLiters <= 0) return null;
  const needed = lapsNeeded(input, stops);
  if (input.raceLengthMinutes - stops * input.pitMinutes <= 0) return null;

  let low = 0.001;
  if (lapsAvailable(input, stops, low) < needed) return null;
  let high = input.tankLiters; // laps(high) <= stops + 1, a lower bound check below keeps `low` valid
  if (lapsAvailable(input, stops, high) >= needed) return Math.floor(high * 1000) / 1000;
  // laps(u) only falls as u rises, so the highest u that still gets there can be bisected.
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (lapsAvailable(input, stops, mid) >= needed) low = mid;
    else high = mid;
  }
  return Math.floor(low * 1000) / 1000;
}

export interface StopsOption {
  stops: number;
  /** The fuel use per lap the plan has to hold. */
  fuelPerLapLiters: number;
  /** Saving against the normal figure, in litres per lap and as a percentage. */
  saveLiters: number;
  savePercent: number;
}

/** What it takes to run with each of the given stop counts, against the normal fuel use per lap.
 * Counts that need no saving or can't be done are left out. */
export function stopsOptions(input: StopsInput, normalFuelPerLap: number, stopCounts: number[]): StopsOption[] {
  const options: StopsOption[] = [];
  for (const stops of stopCounts) {
    const fuelPerLap = maxFuelPerLapForStops(input, stops);
    if (fuelPerLap === null) continue;
    const saveLiters = normalFuelPerLap - fuelPerLap;
    if (saveLiters <= 0) continue;
    options.push({
      stops,
      fuelPerLapLiters: fuelPerLap,
      saveLiters,
      // Rounded up to 0.1: the saving has to be at least what the figure needs.
      savePercent: Math.ceil((saveLiters / normalFuelPerLap) * 1000) / 10,
    });
  }
  return options;
}
