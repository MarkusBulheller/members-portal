import type { RaceResult, RaceResultDriverStint, RaceResultLap } from '../types/raceResult';
import { stintDriveMs } from './driverStats';
import { ordinal } from './lapScatter';
import { averageLapMs, computeStints, lapTimeSpreadMs, stintDurationMs } from './stints';

/**
 * Personal race summary: one driver's mini report of a single race result. Pure functions only.
 *
 * Nothing here is invented: every number comes from the result's per-driver rows (`driverStints`:
 * laps completed, average / best lap, incidents) or from its lap rows (`laps`: used for the
 * chronological stints, the consistency spread and the clean-lap count). Anything the data can't
 * support is `null` (and the UI shows an em dash or hides the line). In particular there are no
 * per-lap positions in the data, so there are NO "positions gained" style highlights.
 *
 * Definitions (all numbers)
 *  - Driver match: the `driverStints` row whose `driverProfileId` equals the given id; its
 *    `iracingCustId` then selects that driver's lap rows. If only lap rows carry the profile id
 *    (no aggregate row) the driver is still found. No row and no laps -> `null`.
 *  - stints: `computeStints(result.laps)` (chronological by sessionTime, cut where the driver
 *    changes) filtered to this driver; `stintNumber` counts the driver's own stints (1..n),
 *    `raceStintNumber` is the global number the result page shows. Per stint: laps = lap rows,
 *    startLap/endLap = first/last lapNumber, avg = mean of timed laps, best = fastest timed lap,
 *    driveMs = sum of timed lap times. With no lap rows `stints` is empty (hasLapData=false).
 *  - laps: the driver's `lapsComplete` when > 0, else the number of their lap rows.
 *  - driveMs: average lap x laps completed, exactly `stintDriveMs()` of lib/driverStats.ts (the
 *    definition behind the driver profile's "driven" total); if that is unavailable, the sum of
 *    their timed lap rows; else null.
 *  - lapShare: laps / sum of every driver's laps (same laps rule). timeShare: driveMs / sum of
 *    every driver's driveMs (same rule) - i.e. the share of the team's driving time.
 *  - avgLapMs: the driver's `averageLapTimeMs` (> 0), else the mean of their timed lap rows.
 *    teamAvgLapMs: mean of every driver's avgLapMs weighted by their laps (so a 60-lap driver
 *    counts three times a 20-lap one); the driver is part of the team average.
 *    paceDeltaMs = avgLapMs - teamAvgLapMs: NEGATIVE = faster. null when there are no teammates
 *    (comparing someone with themselves says nothing). |delta| < 5 ms counts as "even".
 *  - bestLapMs: `bestLapTimeMs` (> 0), else the fastest timed lap row. bestLapRank: 1 + number of
 *    drivers with a strictly faster best lap, of = drivers that have a best lap.
 *  - spreadMs: `lapTimeSpreadMs()` over the driver's lap rows (std-dev of clean laps, LOWER is
 *    better, needs >= 3 clean laps). spreadRank: 1 + drivers with a strictly lower spread, of =
 *    drivers with a spread.
 *  - incidents: the driver's `incidents` (>= 0), null if unreported. incidentsPer100Laps =
 *    incidents / laps x 100; incidentsPerHour = incidents / (driveMs in hours). null when the
 *    divisor is 0/unknown.
 *  - longestStint: the stint with the most laps (ties: more time) -> { laps, ms, stintNumber }.
 *  - cleanLaps: lap rows that are not flagged `incident`, have a time, and are <= 1.15 x the
 *    median of the driver's non-incident timed laps - the very filter lapTimeSpreadMs() uses
 *    (median = sorted[floor(n/2)]). timedLaps = lap rows that have a time.
 *  - highlights: only statements derivable from the above (see `RaceHighlight`).
 *
 * Sanity table (values worked out by hand and re-run against this file with a throwaway bundle+node).
 * Team: A (this driver) 20 laps avg 100 000 ms best 98 000 inc 1; B 40 laps avg 101 000 best
 * 99 000 inc 3; C 20 laps avg 103 000 best 97 500 inc 0. Lap rows: A has laps 1-10 and 31-40
 * (two stints, one incident lap), B 11-30, C 41-50 with a pit lap at 110 000 ms.
 *
 *   input                                         -> expected
 *   ---------------------------------------------------------------------------------------
 *   computeRaceSummary(r, 'nobody')               -> null
 *   computeRaceSummary(r, A).stintCount           -> 2 (stints [1-10], [31-40], race stints 1 & 3)
 *   .laps / .lapShare                             -> 20 / 0.25   (20 of 80)
 *   .driveMs                                      -> 2 000 000   (100 000 x 20)
 *   .timeShare                                    -> 2 000 000 / 8 100 000 = 0.247 (24.7%)
 *   .teamAvgLapMs                                 -> (100 000x20 + 101 000x40 + 103 000x20) / 80 = 101 250
 *   .paceDeltaMs / .paceVerdict                   -> -1 250 / 'faster'
 *   .bestLapMs / .bestLapRank                     -> 98 000 / { rank: 2, of: 3 }  (C is faster)
 *   .incidents / .incidentsPer100Laps             -> 1 / 5
 *   .incidentsPerHour                             -> 1 / (2 000 s / 3 600 s) = 1.8
 *   driver with 0 lap rows (aggregate row only)   -> stints [], hasLapData false, spread null,
 *                                                    laps / driveMs / best / incidents still set
 *   single driver in the team                     -> paceDeltaMs null, ranks of 1, no teammate/start/finish lines
 *   driver whose lapsComplete is null, 5 lap rows -> laps 5 (row count), driveMs = sum of timed rows
 *   lap rows all lapTimeMs null                   -> avg/best/drive null, cleanLaps 0, timedLaps 0
 *   one 1-lap relief stint (< 3 clean laps)       -> spreadMs null, spreadRank null
 *   no incident data (incidents null)             -> incidents null, both rates null, no "clean" highlight
 */

export interface RaceSummaryStint {
  /** 1..n among THIS driver's stints. */
  stintNumber: number;
  /** The global, chronological stint number shown on the result page. */
  raceStintNumber: number;
  laps: number;
  startLap: number;
  endLap: number;
  /** Sum of the stint's timed laps; null when none has a time. */
  driveMs: number | null;
  avgLapMs: number | null;
  bestLapMs: number | null;
  /** Laps flagged as an incident in this stint. */
  incidentLaps: number;
}

export interface RaceSummaryRank {
  /** 1 = best. */
  rank: number;
  /** Drivers that have this measurement (including the driver). */
  of: number;
}

export interface RaceHighlight {
  key: 'fastest-lap' | 'most-consistent' | 'incident-free' | 'started' | 'finished' | 'longest-stint';
  label: string;
}

export interface RaceSummary {
  driverProfileId: string;
  displayName: string;
  iracingCustId: number;

  stints: RaceSummaryStint[];
  stintCount: number;
  /** False when the result has no lap rows for this driver (then `stints` is empty). */
  hasLapData: boolean;

  laps: number;
  driveMs: number | null;
  teamLaps: number;
  teamDriveMs: number | null;
  /** 0..1 */
  lapShare: number | null;
  /** 0..1 */
  timeShare: number | null;

  avgLapMs: number | null;
  teamAvgLapMs: number | null;
  /** avgLapMs - teamAvgLapMs; negative = faster. null without teammates / data. */
  paceDeltaMs: number | null;
  paceVerdict: 'faster' | 'slower' | 'even' | null;

  bestLapMs: number | null;
  bestLapRank: RaceSummaryRank | null;

  spreadMs: number | null;
  spreadRank: RaceSummaryRank | null;

  incidents: number | null;
  incidentsPer100Laps: number | null;
  incidentsPerHour: number | null;

  longestStint: { stintNumber: number; laps: number; ms: number | null } | null;

  cleanLaps: number;
  timedLaps: number;

  /** Drivers in the result, including this one. */
  driverCount: number;
  highlights: RaceHighlight[];
}

const EVEN_PACE_MS = 5;
const CLEAN_LAP_FACTOR = 1.15;

function positive(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function timedLapTimes(laps: RaceResultLap[]): number[] {
  return laps.map((l) => l.lapTimeMs).filter(positive);
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/** Same filter as lapTimeSpreadMs(): not an incident, timed, <= 1.15 x the median of those laps. */
function countCleanLaps(laps: RaceResultLap[]): number {
  const times = laps
    .filter((l) => !l.incident)
    .map((l) => l.lapTimeMs)
    .filter(positive)
    .sort((a, b) => a - b);
  if (times.length === 0) return 0;
  const median = times[Math.floor(times.length / 2)];
  return times.filter((t) => t <= median * CLEAN_LAP_FACTOR).length;
}

interface DriverFigures {
  stint: RaceResultDriverStint;
  laps: number;
  driveMs: number | null;
  avgLapMs: number | null;
  bestLapMs: number | null;
  spreadMs: number | null;
}

function figuresFor(stint: RaceResultDriverStint, driverLaps: RaceResultLap[]): DriverFigures {
  const timed = timedLapTimes(driverLaps);
  const laps = positive(stint.lapsComplete) ? stint.lapsComplete : driverLaps.length;
  const driveMs = stintDriveMs(stint) ?? (timed.length > 0 ? sum(timed) : null);
  const avgLapMs = positive(stint.averageLapTimeMs) ? stint.averageLapTimeMs : averageLapMs(driverLaps);
  const bestLapMs = positive(stint.bestLapTimeMs) ? stint.bestLapTimeMs : timed.length > 0 ? Math.min(...timed) : null;
  return { stint, laps, driveMs, avgLapMs, bestLapMs, spreadMs: lapTimeSpreadMs(driverLaps) };
}

/** 1 + number of others strictly better (lower); `of` counts those with a value. null without own value. */
function rankLower(own: number | null, all: (number | null)[]): RaceSummaryRank | null {
  if (own === null) return null;
  const values = all.filter((v): v is number => v !== null);
  return { rank: 1 + values.filter((v) => v < own).length, of: values.length };
}

/** Computes one driver's summary of a race, or null when they have no stint in it. */
export function computeRaceSummary(result: RaceResult, driverProfileId: string): RaceSummary | null {
  if (!driverProfileId) return null;

  const lapsByCust = new Map<number, RaceResultLap[]>();
  for (const lap of result.laps) {
    const list = lapsByCust.get(lap.iracingCustId);
    if (list) list.push(lap);
    else lapsByCust.set(lap.iracingCustId, [lap]);
  }

  const ownRow = result.driverStints.find((s) => s.driverProfileId === driverProfileId) ?? null;
  const custId = ownRow?.iracingCustId ?? result.laps.find((l) => l.driverProfileId === driverProfileId)?.iracingCustId;
  if (custId === undefined) return null;

  // A driver known only from lap rows gets a stand-in aggregate row so every figure falls back to the laps.
  const ownLapRows = lapsByCust.get(custId) ?? [];
  const ownStint: RaceResultDriverStint =
    ownRow ??
    ({
      id: `laps-${custId}`,
      driverProfileId,
      iracingCustId: custId,
      displayName: ownLapRows[0]?.displayName ?? '',
      startingPosition: null,
      finishingPosition: null,
      averageLapTimeMs: null,
      bestLapTimeMs: null,
      incidents: null,
      lapsComplete: null,
    } satisfies RaceResultDriverStint);

  const team = result.driverStints.map((s) => figuresFor(s, lapsByCust.get(s.iracingCustId) ?? []));
  if (!ownRow) team.push(figuresFor(ownStint, ownLapRows));
  const me = team.find((f) => f.stint === ownStint) as DriverFigures;
  const teammates = team.length - 1;

  // --- Stints -------------------------------------------------------------------------------------
  const allStints = computeStints(result.laps);
  const stints: RaceSummaryStint[] = allStints
    .filter((s) => s.iracingCustId === custId)
    .map((s, i) => {
      const timed = timedLapTimes(s.laps);
      return {
        stintNumber: i + 1,
        raceStintNumber: s.stintNumber,
        laps: s.laps.length,
        startLap: s.laps[0].lapNumber,
        endLap: s.laps[s.laps.length - 1].lapNumber,
        driveMs: stintDurationMs(s),
        avgLapMs: averageLapMs(s.laps),
        bestLapMs: timed.length > 0 ? Math.min(...timed) : null,
        incidentLaps: s.laps.filter((l) => l.incident).length,
      };
    });

  let longestStint: RaceSummary['longestStint'] = null;
  for (const s of stints) {
    if (
      longestStint === null ||
      s.laps > longestStint.laps ||
      (s.laps === longestStint.laps && (s.driveMs ?? 0) > (longestStint.ms ?? 0))
    ) {
      longestStint = { stintNumber: s.stintNumber, laps: s.laps, ms: s.driveMs };
    }
  }

  // --- Shares -------------------------------------------------------------------------------------
  const teamLaps = sum(team.map((f) => f.laps));
  const teamDriveParts = team.map((f) => f.driveMs).filter((v): v is number => v !== null);
  const teamDriveMs = teamDriveParts.length > 0 ? sum(teamDriveParts) : null;
  const lapShare = teamLaps > 0 ? me.laps / teamLaps : null;
  const timeShare = me.driveMs !== null && teamDriveMs !== null && teamDriveMs > 0 ? me.driveMs / teamDriveMs : null;

  // --- Pace ---------------------------------------------------------------------------------------
  const paced = team.filter((f) => f.avgLapMs !== null && f.laps > 0);
  const pacedLaps = sum(paced.map((f) => f.laps));
  const teamAvgLapMs = pacedLaps > 0 ? sum(paced.map((f) => (f.avgLapMs as number) * f.laps)) / pacedLaps : null;
  const paceDeltaMs = teammates > 0 && me.avgLapMs !== null && teamAvgLapMs !== null ? me.avgLapMs - teamAvgLapMs : null;
  const paceVerdict: RaceSummary['paceVerdict'] =
    paceDeltaMs === null ? null : Math.abs(paceDeltaMs) < EVEN_PACE_MS ? 'even' : paceDeltaMs < 0 ? 'faster' : 'slower';

  const bestLapRank = rankLower(
    me.bestLapMs,
    team.map((f) => f.bestLapMs),
  );
  const spreadRank = rankLower(
    me.spreadMs,
    team.map((f) => f.spreadMs),
  );

  // --- Incidents ----------------------------------------------------------------------------------
  const incidents = ownRow && ownRow.incidents !== null && ownRow.incidents >= 0 ? ownRow.incidents : null;
  const incidentsPer100Laps = incidents !== null && me.laps > 0 ? (incidents / me.laps) * 100 : null;
  const incidentsPerHour = incidents !== null && me.driveMs !== null && me.driveMs > 0 ? incidents / (me.driveMs / 3_600_000) : null;

  // --- Highlights (only what the numbers above prove) ---------------------------------------------
  const highlights: RaceHighlight[] = [];
  if (teammates > 0 && bestLapRank?.rank === 1) {
    highlights.push({ key: 'fastest-lap', label: 'Fastest lap of the team' });
  }
  if (teammates > 0 && spreadRank?.rank === 1 && spreadRank.of > 1) {
    highlights.push({ key: 'most-consistent', label: 'Most consistent driver' });
  }
  if (incidents === 0 && me.laps > 0) {
    highlights.push({ key: 'incident-free', label: 'Incident-free race' });
  }
  if (teammates > 0 && allStints.length > 0 && allStints[0].iracingCustId === custId) {
    highlights.push({ key: 'started', label: 'Started the race' });
  }
  if (teammates > 0 && allStints.length > 0 && allStints[allStints.length - 1].iracingCustId === custId) {
    highlights.push({ key: 'finished', label: 'Took the chequered flag' });
  }
  if (longestStint !== null && teammates > 0) {
    const raceLongest = Math.max(...allStints.map((s) => s.laps.length));
    if (longestStint.laps === raceLongest && longestStint.laps > 1) {
      highlights.push({ key: 'longest-stint', label: 'Longest stint of the race' });
    }
  }

  return {
    driverProfileId,
    displayName: ownStint.displayName,
    iracingCustId: custId,
    stints,
    stintCount: stints.length,
    hasLapData: ownLapRows.length > 0,
    laps: me.laps,
    driveMs: me.driveMs,
    teamLaps,
    teamDriveMs,
    lapShare,
    timeShare,
    avgLapMs: me.avgLapMs,
    teamAvgLapMs,
    paceDeltaMs,
    paceVerdict,
    bestLapMs: me.bestLapMs,
    bestLapRank,
    spreadMs: me.spreadMs,
    spreadRank,
    incidents,
    incidentsPer100Laps,
    incidentsPerHour,
    longestStint,
    cleanLaps: countCleanLaps(ownLapRows),
    timedLaps: timedLapTimes(ownLapRows).length,
    driverCount: team.length,
    highlights,
  };
}

// --- Formatting helpers ---------------------------------------------------------------------------

/** "−0.41s" / "+0.41s" (true minus sign); null -> em dash. A zero-ish value reads "±0.00s". */
export function formatPaceDelta(ms: number | null): string {
  if (ms === null) return '—';
  const seconds = Math.abs(ms) / 1000;
  const text = seconds.toFixed(2);
  if (text === '0.00') return '±0.00s';
  return `${ms < 0 ? '−' : '+'}${text}s`;
}

/** "faster than the team average" etc.; null verdict -> ''. */
export function paceVerdictLabel(verdict: RaceSummary['paceVerdict']): string {
  if (verdict === 'faster') return 'faster than the team average';
  if (verdict === 'slower') return 'slower than the team average';
  if (verdict === 'even') return 'on the team average';
  return '';
}

/** "fastest of 4" / "2nd of 4"; '' when the rank is unknown or the driver is alone (of < 2). */
export function formatRank(rank: RaceSummaryRank | null, best: 'fastest' | 'best' = 'fastest'): string {
  if (rank === null || rank.of < 2) return '';
  return rank.rank === 1 ? `${best} of ${rank.of}` : `${ordinal(rank.rank)} of ${rank.of}`;
}

/** "62%" ; null -> em dash; shares under 1% read "<1%". */
export function formatPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

/** One decimal rate ("1.8"), null -> em dash. */
export function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(1);
}

// --- Race strip -----------------------------------------------------------------------------------

export interface RaceStripSegment {
  /** Global stint number on the result page. */
  stintNumber: number;
  /** Share of the strip, 0-100; widths sum to 100. */
  widthPct: number;
  /** True for this driver's own stints. */
  mine: boolean;
}

/** The whole race as proportional segments (one per chronological stint, wide = long), flagging the
 * driver's own. Width = the stint's summed lap time, or its lap count when no stint has lap times.
 * Empty when the result has no lap rows. */
export function computeRaceStrip(result: RaceResult, iracingCustId: number): RaceStripSegment[] {
  const stints = computeStints(result.laps);
  if (stints.length === 0) return [];
  const durations = stints.map((s) => stintDurationMs(s) ?? 0);
  const useTime = durations.some((d) => d > 0);
  const weights = stints.map((s, i) => (useTime ? durations[i] : s.laps.length));
  const total = sum(weights) || 1;
  return stints.map((s, i) => ({
    stintNumber: s.stintNumber,
    widthPct: (weights[i] / total) * 100,
    mine: s.iracingCustId === iracingCustId,
  }));
}
