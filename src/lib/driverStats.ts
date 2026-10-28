import type { RaceResult, RaceResultDriverStint } from '../types/raceResult';
import { formatDuration } from './lapTime';

/** One car or one track, aggregated over the races a driver drove. */
export interface DriverStatGroup {
  /** Stable grouping key: the roster id when the result is linked to one, else the lower-cased name. */
  key: string;
  /** Roster Car/Track id, null when the results were never linked (then there is no page to link to). */
  id: string | null;
  name: string;
  /** Races the driver has a stint in for this car/track. */
  races: number;
  /** Subset of `races` that carry a finishing position. */
  rankedRaces: number;
  /** Summed driving time in ms (races without timing data contribute nothing). */
  driveMs: number;
  /** Mean finishing position over the ranked races, null when there are none. */
  avgFinish: number | null;
  /** Lowest (best) finishing position, null when there are no ranked races. */
  bestFinish: number | null;
}

export interface DriverBestGroup {
  group: DriverStatGroup;
  /** 'average' = best average finish with >= 2 ranked races; 'single' = fallback to the best single finish. */
  basis: 'average' | 'single';
}

export interface DriverStats {
  /** Races in which the driver has a stint. */
  events: number;
  /** Sum of the driver's completed laps. */
  laps: number;
  /** Sum of drive times, null when no race has timing data. */
  drivenMs: number | null;
  /** Races that contributed to drivenMs. */
  timedEvents: number;
  /** drivenMs / timedEvents. */
  avgStintMs: number | null;
  /** The race in which the driver drove the longest in total (one stint row per race). */
  longestRace: { ms: number; where: string } | null;
  bestFinish: { position: number; where: string } | null;
  /** Ranked races finished P1-P3 (wins included). */
  podiums: number;
  wins: number;
  /** Races that carry a finishing position. */
  rankedRaces: number;
  avgFinish: number | null;
  mostDrivenCar: DriverStatGroup | null;
  bestCar: DriverBestGroup | null;
  mostDrivenTrack: DriverStatGroup | null;
  bestTrack: DriverBestGroup | null;
  topCars: DriverStatGroup[];
  topTracks: DriverStatGroup[];
  /** The ranking metric of the top lists: 'time' when any group has driving time, else 'races'. */
  rankBy: 'time' | 'races';
  fastestLap: { ms: number; where: string } | null;
  /** Total incidents / races that report an incident count. */
  incidentsPerRace: number | null;
  totalIncidents: number;
}

/** The position rule used everywhere in the app (e.g. the Races table pill): class position when
 * present, otherwise overall. Non-positive / non-finite values count as "no position". */
export function racePosition(race: Pick<RaceResult, 'finishingPositionInClass' | 'finishingPosition'>): number | null {
  const position = race.finishingPositionInClass ?? race.finishingPosition;
  return position !== null && Number.isFinite(position) && position > 0 ? position : null;
}

/** Drive time of one stint, reconstructed as average lap time x laps completed (the by-driver
 * endpoint carries no per-lap rows). Null when either input is missing or not positive. */
export function stintDriveMs(stint: Pick<RaceResultDriverStint, 'averageLapTimeMs' | 'lapsComplete'>): number | null {
  const { averageLapTimeMs: avg, lapsComplete: laps } = stint;
  if (avg === null || laps === null || !Number.isFinite(avg) || !Number.isFinite(laps) || avg <= 0 || laps <= 0) {
    return null;
  }
  return avg * laps;
}

function whereLabel(race: RaceResult): string {
  return [race.trackName, race.carName].filter(Boolean).join(' · ');
}

interface MutableGroup extends DriverStatGroup {
  positionSum: number;
}

function addToGroup(
  map: Map<string, MutableGroup>,
  key: string,
  id: string | null,
  name: string,
  position: number | null,
  driveMs: number | null,
) {
  let group = map.get(key);
  if (!group) {
    group = { key, id, name, races: 0, rankedRaces: 0, driveMs: 0, avgFinish: null, bestFinish: null, positionSum: 0 };
    map.set(key, group);
  }
  group.races += 1;
  if (driveMs !== null) group.driveMs += driveMs;
  if (position !== null) {
    group.rankedRaces += 1;
    group.positionSum += position;
    group.bestFinish = group.bestFinish === null ? position : Math.min(group.bestFinish, position);
  }
}

/** Most driving time first; more races, then the name, break ties so the order is deterministic. */
function compareByDriven(a: DriverStatGroup, b: DriverStatGroup): number {
  return b.driveMs - a.driveMs || b.races - a.races || a.name.localeCompare(b.name);
}

function pickBest(groups: DriverStatGroup[]): DriverBestGroup | null {
  const averaged = groups
    .filter((g) => g.rankedRaces >= 2 && g.avgFinish !== null)
    .sort(
      (a, b) =>
        (a.avgFinish as number) - (b.avgFinish as number) ||
        b.rankedRaces - a.rankedRaces ||
        compareByDriven(a, b),
    );
  if (averaged.length > 0) return { group: averaged[0], basis: 'average' };

  const single = groups
    .filter((g) => g.bestFinish !== null)
    .sort((a, b) => (a.bestFinish as number) - (b.bestFinish as number) || compareByDriven(a, b));
  return single.length > 0 ? { group: single[0], basis: 'single' } : null;
}

function finishGroups(map: Map<string, MutableGroup>): DriverStatGroup[] {
  return [...map.values()].map(({ positionSum, ...group }) => ({
    ...group,
    avgFinish: group.rankedRaces > 0 ? positionSum / group.rankedRaces : null,
  }));
}

/** Pure computation of the "Driving stats" for one driver from the by-driver race results.
 * Races without a stint for `driverId` are ignored (the endpoint only returns races with one). */
export function computeDriverStats(races: RaceResult[], driverId: string): DriverStats {
  let events = 0;
  let laps = 0;
  let drivenMs = 0;
  let timedEvents = 0;
  let longestRace: DriverStats['longestRace'] = null;
  let bestFinish: DriverStats['bestFinish'] = null;
  let podiums = 0;
  let wins = 0;
  let rankedRaces = 0;
  let positionSum = 0;
  let fastestLap: DriverStats['fastestLap'] = null;
  let totalIncidents = 0;
  let incidentRaces = 0;
  const cars = new Map<string, MutableGroup>();
  const tracks = new Map<string, MutableGroup>();

  for (const race of races) {
    const stint = race.driverStints.find((s) => s.driverProfileId === driverId);
    if (!stint) continue;
    events += 1;

    if (stint.lapsComplete !== null && stint.lapsComplete > 0) laps += stint.lapsComplete;

    const driveMs = stintDriveMs(stint);
    if (driveMs !== null) {
      drivenMs += driveMs;
      timedEvents += 1;
      if (longestRace === null || driveMs > longestRace.ms) longestRace = { ms: driveMs, where: whereLabel(race) };
    }

    const position = racePosition(race);
    if (position !== null) {
      rankedRaces += 1;
      positionSum += position;
      if (position <= 3) podiums += 1;
      if (position === 1) wins += 1;
      if (bestFinish === null || position < bestFinish.position) bestFinish = { position, where: whereLabel(race) };
    }

    if (stint.bestLapTimeMs !== null && stint.bestLapTimeMs > 0) {
      if (fastestLap === null || stint.bestLapTimeMs < fastestLap.ms) {
        fastestLap = { ms: stint.bestLapTimeMs, where: whereLabel(race) };
      }
    }

    if (stint.incidents !== null && stint.incidents >= 0) {
      totalIncidents += stint.incidents;
      incidentRaces += 1;
    }

    const carName = race.carName?.trim() || null;
    if (race.carId || carName) {
      addToGroup(cars, race.carId ?? `name:${carName!.toLowerCase()}`, race.carId, carName ?? 'Unknown car', position, driveMs);
    }
    const trackName = race.trackName?.trim() || null;
    if (race.trackId || trackName) {
      addToGroup(
        tracks,
        race.trackId ?? `name:${trackName!.toLowerCase()}`,
        race.trackId,
        trackName ?? 'Unknown track',
        position,
        driveMs,
      );
    }
  }

  const carGroups = finishGroups(cars).sort(compareByDriven);
  const trackGroups = finishGroups(tracks).sort(compareByDriven);
  const rankBy: DriverStats['rankBy'] =
    carGroups.some((g) => g.driveMs > 0) || trackGroups.some((g) => g.driveMs > 0) ? 'time' : 'races';
  const byRank = (a: DriverStatGroup, b: DriverStatGroup) =>
    rankBy === 'time' ? compareByDriven(a, b) : b.races - a.races || a.name.localeCompare(b.name);
  carGroups.sort(byRank);
  trackGroups.sort(byRank);

  return {
    events,
    laps,
    drivenMs: timedEvents > 0 ? drivenMs : null,
    timedEvents,
    avgStintMs: timedEvents > 0 ? drivenMs / timedEvents : null,
    longestRace,
    bestFinish,
    podiums,
    wins,
    rankedRaces,
    avgFinish: rankedRaces > 0 ? positionSum / rankedRaces : null,
    mostDrivenCar: carGroups[0] ?? null,
    bestCar: pickBest(carGroups),
    mostDrivenTrack: trackGroups[0] ?? null,
    bestTrack: pickBest(trackGroups),
    topCars: carGroups.slice(0, 3),
    topTracks: trackGroups.slice(0, 3),
    rankBy,
    fastestLap,
    incidentsPerRace: incidentRaces > 0 ? totalIncidents / incidentRaces : null,
    totalIncidents,
  };
}

/** "42h 15m" / "38m" / "<1m"; null renders as an em dash. */
export function formatDriveTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 60_000) return '<1m';
  return formatDuration(ms);
}

/** "P4" for whole numbers, "P4.3" otherwise. */
export function formatAvgPosition(value: number | null): string {
  if (value === null) return '—';
  return `P${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

/** "3 races" / "1 race". */
export function pluralRaces(count: number): string {
  return `${count} race${count === 1 ? '' : 's'}`;
}

/** One decimal, e.g. "2.4"; whole numbers stay whole. */
export function formatDecimal(value: number | null): string {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
