export interface DriverStat {
  iracingCustId: number;
  driverProfileId: string | null;
  name: string;
  value: number;
}

export interface EntityStat {
  id: string | null;
  name: string;
  count: number;
}

export interface ResultPoint {
  id: string;
  date: string | null;
  position: number | null;
  trackName: string;
  carName: string | null;
}

export interface DashboardFilterOptions {
  years: number[];
  tracks: { id: string | null; name: string }[];
  cars: { id: string | null; name: string }[];
  series: string[];
  raceLengths: string[];
}

export interface DashboardStats {
  mostEvents: DriverStat[];
  mostLaps: DriverStat[];
  leastIncidentsPerLap: DriverStat[];
  mostDrivenTracks: EntityStat[];
  mostDrivenCars: EntityStat[];
  results: ResultPoint[];
  filterOptions: DashboardFilterOptions;
}

export interface DashboardFilters {
  year: number | null;
  trackId: string | null;
  carId: string | null;
  series: string | null;
  raceLength: string | null;
}
