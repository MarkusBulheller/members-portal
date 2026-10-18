export interface RaceResultDriverStint {
  id: string;
  driverProfileId: string | null;
  iracingCustId: number;
  displayName: string;
  startingPosition: number | null;
  finishingPosition: number | null;
  averageLapTimeMs: number | null;
  bestLapTimeMs: number | null;
  incidents: number | null;
  lapsComplete: number | null;
}

export interface RaceResultLap {
  id: string;
  driverProfileId: string | null;
  iracingCustId: number;
  displayName: string;
  lapNumber: number;
  lapTimeMs: number | null;
  incident: boolean;
  /** iRacing's own running session clock — not a real time unit, only used to sort laps into
   * true chronological order (see lib/stints.ts, which splits stints on driver changes). */
  sessionTime: number;
}

export interface RaceResult {
  id: string;
  subsessionId: number;
  teamId: number;
  /** Display name of the iRacing team (resolved from the synced team cache). Present on the
   * single-result endpoints only; null if the team was never synced. */
  teamName?: string | null;
  seriesName: string | null;
  trackName: string;
  trackConfig: string | null;
  carName: string | null;
  carId: string | null;
  trackId: string | null;
  startTime: string | null;
  endTime: string | null;
  startingPosition: number | null;
  finishingPosition: number | null;
  startingPositionInClass: number | null;
  finishingPositionInClass: number | null;
  teamLapsComplete: number | null;
  totalLaps: number | null;
  teamIncidents: number | null;
  splitNumber: number | null;
  totalSplits: number | null;
  shareToken: string | null;
  driverStints: RaceResultDriverStint[];
  laps: RaceResultLap[];
  createdAt: string;
}

/** A row of the race-result list endpoints (GET /race-results, /by-car/:id, /by-track/:id): the
 * result's own columns only — no driverStints and no laps. `by-driver` still returns full
 * RaceResult rows (the driver page reads the stints). */
export type RaceResultSummary = Omit<RaceResult, 'driverStints' | 'laps'>;
