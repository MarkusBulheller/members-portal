export interface Track {
  id: string;
  name: string;
  category: string;
  location: string | null;
  notes: string | null;
  imageUrl: string | null;
  active: boolean;
  /** Imported race results at this track and the most recent one's start (list + detail payloads). */
  raceCount?: number;
  lastRacedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One car's setup at a track — GET /tracks/:trackId/setups (active cars only). */
export interface TrackCarSetup {
  id: string;
  carId: string;
  trackId: string;
  car: { id: string; name: string; carClass: string };
  fuelPerLapLiters: string | null;
  pitLaneTimeSeconds: string | null;
  notes: string | null;
}

export interface CreateTrackInput {
  name: string;
  category: string;
  location?: string;
  notes?: string;
  imageUrl?: string;
}

export type UpdateTrackInput = Partial<CreateTrackInput> & { active?: boolean };
