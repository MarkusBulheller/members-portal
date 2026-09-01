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
