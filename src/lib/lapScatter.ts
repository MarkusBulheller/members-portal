import { computeStints, type Stint } from './stints';
import type { RaceResultLap } from '../types/raceResult';

export interface LapScatterPoint {
  /** 1-based position of the lap in the team's chronological lap list (the chart's x value). */
  lap: number;
  lapTimeMs: number;
  iracingCustId: number;
  displayName: string;
}

export interface LapScatterModel {
  points: LapScatterPoint[];
  /** Total laps the team ran (the x-axis extent), including the ones not plotted. */
  totalLaps: number;
  /** Only every `step`-th lap is plotted, to keep a 24h race's ~800 laps legible. */
  step: number;
  /** Laps slower than this are hidden (full-course yellows, pit laps, spins). */
  thresholdMs: number;
}

const MAX_POINTS = 200;
/** A lap this much slower than the race's median lap counts as a non-racing lap (same 15% rule
 * lapTimeSpreadMs() uses for its "clean laps"). */
const SLOW_LAP_FACTOR = 1.15;

/** Prepares the "Stints, lap by lap" scatter: every Nth lap, minus pit laps (laps with no time,
 * plus the out-lap and in-lap on each side of a driver change — lap_events doesn't reliably flag
 * pit stops, so a stint boundary is the best signal available) and minus laps over the slow-lap
 * threshold. Returns null when nothing is left to plot. Pass the already-computed stints
 * (from computeStints(laps)) to avoid sorting and splitting the laps a second time: they are already in
 * chronological order, so the flattened list is the sorted lap list. */
export function buildLapScatter(laps: RaceResultLap[], precomputedStints?: Stint[]): LapScatterModel | null {
  const stints = precomputedStints ?? computeStints(laps);
  const sorted = stints.flatMap((stint) => stint.laps);
  const timed = sorted.map((l) => l.lapTimeMs).filter((t): t is number => t !== null);
  if (timed.length === 0) return null;

  const ordered = [...timed].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)];
  const thresholdMs = Math.ceil((median * SLOW_LAP_FACTOR) / 1000) * 1000;

  const pitLapIds = new Set<string>();
  stints.forEach((stint, i) => {
    if (i > 0) pitLapIds.add(stint.laps[0].id); // out-lap
    if (i < stints.length - 1) pitLapIds.add(stint.laps[stint.laps.length - 1].id); // in-lap
  });

  const step = Math.max(1, Math.ceil(sorted.length / MAX_POINTS));
  const points: LapScatterPoint[] = [];
  sorted.forEach((lap, index) => {
    if (index % step !== 0) return;
    if (lap.lapTimeMs === null || lap.lapTimeMs > thresholdMs || pitLapIds.has(lap.id)) return;
    points.push({
      lap: index + 1,
      lapTimeMs: lap.lapTimeMs,
      iracingCustId: lap.iracingCustId,
      displayName: lap.displayName,
    });
  });

  if (points.length === 0) return null;
  return { points, totalLaps: sorted.length, step, thresholdMs };
}

/** "2:05" — whole-second lap time for axis labels and captions. */
export function formatLapSeconds(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 1 -> "1st", 4 -> "4th", 12 -> "12th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Y-axis ticks (in ms) covering [min, max] with a "nice" whole-second step, at most ~5 ticks. */
export function lapAxisTicks(minMs: number, maxMs: number): number[] {
  const spanSec = Math.max(1, (maxMs - minMs) / 1000);
  const step = [1, 2, 5, 10, 15, 30, 60].find((s) => spanSec / s <= 4) ?? 60;
  const first = Math.floor(minMs / 1000 / step) * step;
  const last = Math.ceil(maxMs / 1000 / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= last; t += step) ticks.push(t * 1000);
  return ticks;
}
