export interface IracingSeriesSeason {
  seasonId: number;
  seriesId: number;
  seriesName: string;
  seasonName: string;
  category: string | null;
  licenseGroup: number | null;
  official: boolean;
  active: boolean;
  /** Raw per-race-week entries exactly as iRacing returns them (track + weather per week) —
   * shape isn't fully pinned down yet, see lib/iracingWeather.ts for defensive rendering. */
  schedule: unknown[];
  logoUrl: string | null;
  syncedAt: string;
  /** Admin opt-in for the hourly car-usage scan (see IracingCarUsageSyncService on the backend) —
   * most series aren't worth tracking, so this defaults off. */
  trackCarUsage: boolean;
}

/** One car's tally for a race week's most-used-cars tierlist — see GET
 * /iracing/series/:seasonId/car-usage/:raceWeekNum. Already sorted by entryCount descending. */
export interface IracingCarUsageStat {
  id: string;
  seasonId: number;
  raceWeekNum: number;
  carId: number;
  carName: string;
  /** e.g. "GT3" — from the race result's own per-entry class, not iRacing's global car catalog
   * category. Lets a mixed-class series' tierlist split into tabs instead of one flat list. */
  carClass: string;
  entryCount: number;
  updatedAt: string;
}
