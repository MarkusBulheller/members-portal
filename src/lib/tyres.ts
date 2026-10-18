/** Le Mans Ultimate tyre budget helpers. Tyres are counted individually (a stop can change 0-4),
 * and the 4 tyres the car starts the race on count toward the event's tyre limit.
 *
 * Pure functions — the portal has no test runner, so the edge cases are documented here:
 *  - tyresChangedOf: null `tyresChanged` (legacy rows) -> 4 when `tyreChange`, else 0.
 *  - tyresUsed: 4 for the start + the changed tyres of every stint after the first; the first
 *    stint's own value is ignored (no stop before the race). 0 stints -> 4 (the starting set is
 *    on the car regardless).
 *  - distributeTyres: see the function doc; stops = 0 -> [], limit < 4 -> all zeros. */

export const TYRES_AT_START = 4;
export const MAX_TYRES_PER_STOP = 4;

export interface StintTyres {
  tyreChange: boolean;
  tyresChanged: number | null;
}

/** Tyres changed in the stop before this stint (0-4), deriving legacy null rows. */
export function tyresChangedOf(stint: StintTyres): number {
  if (stint.tyresChanged !== null && stint.tyresChanged !== undefined) {
    return Math.min(MAX_TYRES_PER_STOP, Math.max(0, Math.trunc(stint.tyresChanged)));
  }
  return stint.tyreChange ? MAX_TYRES_PER_STOP : 0;
}

/** Total tyres a plan uses: the 4 starting tyres plus every later stint's changed tyres. `stints`
 * must be in race order — index 0 is the start and never counts a stop. */
export function tyresUsed(stints: readonly StintTyres[]): number {
  let used = TYRES_AT_START;
  for (let i = 1; i < stints.length; i += 1) used += tyresChangedOf(stints[i]);
  return used;
}

/** Spreads a tyre budget across `stops` pit stops. remaining = limit - 4 starting tyres; each
 * stop gets floor(remaining / stops) capped at 4, then the leftover tyres go to the earliest stops
 * one at a time (each still capped at 4). If the budget can't cover the 4 starting tyres
 * (limit < 4), every stop gets 0 — the caller shows the over-limit notice. A budget larger than
 * 4 per stop simply caps at 4 everywhere. Returns one entry per stop, in order. */
export function distributeTyres(limit: number, stops: number): number[] {
  const count = Math.max(0, Math.floor(stops));
  if (count === 0) return [];
  const remaining = Math.floor(limit) - TYRES_AT_START;
  if (!Number.isFinite(remaining) || remaining <= 0) return Array<number>(count).fill(0);

  const share = Math.min(MAX_TYRES_PER_STOP, Math.floor(remaining / count));
  const result = Array<number>(count).fill(share);
  let leftover = remaining - share * count;
  for (let i = 0; i < count && leftover > 0; i += 1) {
    if (result[i] < MAX_TYRES_PER_STOP) {
      result[i] += 1;
      leftover -= 1;
    }
  }
  return result;
}

/** LMU: seconds for a pit stop that changes only 1-2 tyres, used when the team hasn't set its own
 * "Tyre change (up to 2 tyres)" value. Mirrors the backend's PARTIAL_TYRE_CHANGE_SECONDS_DEFAULT. */
export const PARTIAL_TYRE_CHANGE_SECONDS_DEFAULT = 5;
/** Most tyres a stop can change and still count as a partial (fast) change. */
export const PARTIAL_TYRE_CHANGE_MAX_TYRES = 2;

/** Tyre portion of an LMU pit stop, in seconds: 0 tyres -> 0, 1-2 tyres -> `partialSeconds`
 * (null/undefined falls back to the 5 s default; an explicit 0 is respected), 3-4 tyres -> the
 * team's full tyre-change time. Same rule as the backend's tyreStopSeconds(). */
export function lmuTyreStopSeconds(
  tyresChanged: number,
  fullSeconds: number,
  partialSeconds: number | null | undefined,
): number {
  if (tyresChanged <= 0) return 0;
  if (tyresChanged <= PARTIAL_TYRE_CHANGE_MAX_TYRES) return partialSeconds ?? PARTIAL_TYRE_CHANGE_SECONDS_DEFAULT;
  return fullSeconds;
}
