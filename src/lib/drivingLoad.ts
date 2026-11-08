import type { RecapDriver } from '../types/recap';

/** A driver of the event (a signed-up member or guest) for the driving-load view. */
export interface LoadDriver {
  /** Stable key for lists. */
  key: string;
  name: string;
  /** The roster profile whose results count; null when unknown (the driver then shows 0 h). */
  profileId: string | null;
  /** The crew the driver is placed on, if any. */
  teamId: string | null;
}

export interface LoadRow {
  key: string;
  name: string;
  teamId: string | null;
  hours: number;
  races: number;
  /** Well above ("heavy") or well below ("light") what the other drivers of this event have driven. */
  flag: 'heavy' | 'light' | null;
}

export interface CrewLoad {
  teamId: string;
  name: string;
  drivers: number;
  averageHours: number;
}

export interface DrivingLoad {
  rows: LoadRow[];
  averageHours: number;
  maxHours: number;
  crews: CrewLoad[];
  /** Set when two or more crews are clearly unbalanced: the crew with the most and the one with the fewest hours per driver. */
  uneven: { highest: CrewLoad; lowest: CrewLoad } | null;
}

/** A driver counts as heavily used from this many times the average, and lightly used up to this fraction of it. */
export const HEAVY_FACTOR = 1.5;
export const LIGHT_FACTOR = 0.5;
/** Flags need a few drivers to compare against. */
export const MIN_DRIVERS_FOR_FLAGS = 3;
/** Crews are called uneven when the busiest averages this many times the quietest. */
export const UNEVEN_CREW_FACTOR = 1.5;

const MS_PER_HOUR = 3_600_000;

/** Hours in the car this season for the drivers of an event, set against each other and per crew.
 * `recap` is the team's season (GET /stats/recap): each driver's time in the car and race count. */
export function computeDrivingLoad(drivers: readonly LoadDriver[], recap: readonly RecapDriver[], teams: readonly { id: string; name: string }[]): DrivingLoad {
  const byProfile = new Map<string, { hours: number; races: number }>();
  for (const d of recap) {
    if (d.driverProfileId) byProfile.set(d.driverProfileId, { hours: d.driveMs / MS_PER_HOUR, races: d.races });
  }

  const rows: LoadRow[] = drivers
    .map((driver) => {
      const own = driver.profileId ? byProfile.get(driver.profileId) : undefined;
      return {
        key: driver.key,
        name: driver.name,
        teamId: driver.teamId,
        hours: own?.hours ?? 0,
        races: own?.races ?? 0,
        flag: null as LoadRow['flag'],
      };
    })
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  const averageHours = rows.length > 0 ? rows.reduce((sum, r) => sum + r.hours, 0) / rows.length : 0;
  const maxHours = rows.reduce((max, r) => Math.max(max, r.hours), 0);

  if (rows.length >= MIN_DRIVERS_FOR_FLAGS && averageHours > 0) {
    for (const row of rows) {
      if (row.hours >= averageHours * HEAVY_FACTOR) row.flag = 'heavy';
      else if (row.hours <= averageHours * LIGHT_FACTOR) row.flag = 'light';
    }
  }

  const crews: CrewLoad[] = [];
  for (const team of teams) {
    const members = rows.filter((r) => r.teamId === team.id);
    if (members.length === 0) continue;
    crews.push({
      teamId: team.id,
      name: team.name,
      drivers: members.length,
      averageHours: members.reduce((sum, r) => sum + r.hours, 0) / members.length,
    });
  }

  let uneven: DrivingLoad['uneven'] = null;
  if (crews.length >= 2) {
    const ordered = [...crews].sort((a, b) => b.averageHours - a.averageHours);
    const highest = ordered[0];
    const lowest = ordered[ordered.length - 1];
    if (highest.averageHours > 0 && lowest.averageHours * UNEVEN_CREW_FACTOR <= highest.averageHours) uneven = { highest, lowest };
  }

  return { rows, averageHours, maxHours, crews, uneven };
}

/** "14.2 h" (one decimal) / "0 h". */
export function formatHours(hours: number): string {
  return hours <= 0 ? '0 h' : `${hours.toFixed(1)} h`;
}
