export type RecapAwardKey = 'iron-driver' | 'lap-leader' | 'fastest-lap' | 'cleanest' | 'most-stints';

export interface RecapGroupStat {
  id: string | null;
  name: string;
  races: number;
  bestFinish: number | null;
}

export interface RecapDriver {
  driverProfileId: string | null;
  name: string;
  races: number;
  laps: number;
  driveMs: number;
  bestLapMs: number | null;
  incidents: number;
  stints: number;
}

export interface RecapAward {
  key: RecapAwardKey;
  title: string;
  driverName: string;
  value: string;
  detail: string | null;
}

/** GET /stats/recap — the team's season, with every driver's contribution inside it. */
export interface RecapStats {
  year: number;
  teamId: number | null;
  teamName: string | null;
  availableYears: number[];
  teams: { teamId: number; teamName: string }[];
  totals: {
    races: number;
    laps: number;
    driveMs: number;
    wins: number;
    podiums: number;
    topTens: number;
    incidents: number;
    avgFinish: number | null;
    bestFinish: number | null;
    avgIncidentsPerRace: number | null;
  };
  longestRace: {
    resultId: string;
    trackName: string;
    seriesName: string | null;
    lapsComplete: number;
    driveMs: number | null;
    /** Wall-clock race length (end - start), null when the result has no end time. */
    durationMs: number | null;
    date: string;
  } | null;
  bestResult: {
    resultId: string;
    trackName: string;
    seriesName: string | null;
    carName: string | null;
    position: number;
    date: string;
  } | null;
  topTracks: RecapGroupStat[];
  topCars: RecapGroupStat[];
  topSeries: { name: string; races: number }[];
  byMonth: { month: number; races: number; podiums: number }[];
  drivers: RecapDriver[];
  awards: RecapAward[];
  firsts: {
    firstRace: { date: string; trackName: string } | null;
    lastRace: { date: string; trackName: string } | null;
  };
}
