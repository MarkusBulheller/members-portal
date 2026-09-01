import type { RaceResultLap } from '../types/raceResult';

export interface Stint {
  /** Global, chronological across the whole race — not reset per driver. A driver who returns
   * to the car later gets a new, later-numbered stint, never merged with their earlier one. */
  stintNumber: number;
  iracingCustId: number;
  displayName: string;
  driverProfileId: string | null;
  laps: RaceResultLap[];
}

/** Splits a race result's flat lap list into stints in true chronological order, by sorting on
 * sessionTime (not lapNumber, which may or may not reset per stint) and cutting a new stint
 * wherever the driver changes. */
export function computeStints(laps: RaceResultLap[]): Stint[] {
  const sorted = [...laps].sort((a, b) => a.sessionTime - b.sessionTime);

  const stints: Stint[] = [];
  for (const lap of sorted) {
    const last = stints[stints.length - 1];
    if (last && last.iracingCustId === lap.iracingCustId) {
      last.laps.push(lap);
    } else {
      stints.push({
        stintNumber: stints.length + 1,
        iracingCustId: lap.iracingCustId,
        displayName: lap.displayName,
        driverProfileId: lap.driverProfileId,
        laps: [lap],
      });
    }
  }
  return stints;
}

function sumMs(values: (number | null)[]): number | null {
  const timed = values.filter((v): v is number => v !== null);
  if (timed.length === 0) return null;
  return timed.reduce((sum, v) => sum + v, 0);
}

/** Stint duration, summed from each lap's confirmed-scale lapTimeMs — sessionTime's own scale
 * isn't confirmed, so it's used only for ordering, never for a displayed duration. */
export function stintDurationMs(stint: Stint): number | null {
  return sumMs(stint.laps.map((l) => l.lapTimeMs));
}

/** Consistency score (0-100, higher = more consistent) for one driver's laps in a race — based
 * on the coefficient of variation (stdev / mean) of their "clean" laps: timed, incident-free, and
 * within 15% of their own median (so pit in/out laps and full-course-yellow laps don't swamp the
 * genuine pace signal). Needs at least 3 clean laps to be meaningful — returns null otherwise
 * (a one-lap relief stint, a DNF before their first timed lap, etc). A CV of 0% (identical laps)
 * maps to 100; a CV of 5% or worse (loose for a full stint once traffic/tire wear are factored
 * in — a tight stint is usually under 1.5%) maps to 0. */
export function consistencyScore(laps: RaceResultLap[]): number | null {
  const timed = laps.filter((l): l is RaceResultLap & { lapTimeMs: number } => !l.incident && l.lapTimeMs !== null);
  if (timed.length < 3) return null;

  const sortedTimes = timed.map((l) => l.lapTimeMs).sort((a, b) => a - b);
  const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
  const clean = sortedTimes.filter((t) => t <= median * 1.15);
  if (clean.length < 3) return null;

  const mean = clean.reduce((sum, t) => sum + t, 0) / clean.length;
  const variance = clean.reduce((sum, t) => sum + (t - mean) ** 2, 0) / clean.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;

  return Math.max(0, Math.min(100, Math.round((1 - coefficientOfVariation / 0.05) * 100)));
}

export function averageLapMs(laps: RaceResultLap[]): number | null {
  const timed = laps.map((l) => l.lapTimeMs).filter((t): t is number => t !== null);
  if (timed.length === 0) return null;
  return Math.round(timed.reduce((sum, t) => sum + t, 0) / timed.length);
}

// A validated categorical palette (orange/aqua/yellow/magenta/green/violet/red), stepped for
// this app's dark surface (#1a1a1d) — chosen for maximum perceptual distinctness rather than
// eyeballed, and re-checked with the dataviz skill's validator after dropping blue in favor of
// red (adjacent-pair CVD ΔE 8.4, normal-vision ΔE 19.3, both still clear the pass floor). Drops
// blue specifically because it's this app's brand accent elsewhere on the page, so a driver's
// color is never confused for it.
const DRIVER_COLORS = ['#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** Assigns each driver in a race a distinct palette slot — sorted by cust_id so the assignment
 * is stable regardless of call-site ordering, and shared by every chart on the page (built once
 * from the race's full driver list, then passed down) so the same driver always gets the same
 * color everywhere. A hash-based assignment (custId % length) was tried first but risked two
 * drivers colliding on the same color whenever their ids happened to land in the same bucket —
 * this guarantees uniqueness for any race with up to DRIVER_COLORS.length drivers, only
 * repeating a color once a race has more drivers than the palette has slots. */
export function buildDriverColorMap(custIds: number[]): Map<number, string> {
  const unique = Array.from(new Set(custIds)).sort((a, b) => a - b);
  return new Map(unique.map((custId, i) => [custId, DRIVER_COLORS[i % DRIVER_COLORS.length]]));
}
