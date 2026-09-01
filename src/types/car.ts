export interface Livery {
  id: string;
  carId: string;
  imageUrl: string;
  name: string;
  uploadedByUserId: string;
  createdAt: string;
}

export interface CarTrackSetup {
  id: string;
  carId: string;
  trackId: string;
  track: { id: string; name: string; category: string; location: string | null };
  fuelPerLapLiters: string | null;
  pitLaneTimeSeconds: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Car {
  id: string;
  name: string;
  carClass: string;
  tankCapacityLiters: string;
  notes: string | null;
  /** iRacing's stock car image, if this car was created via the "Pick from iRacing" picker —
   * a full CDN URL already, unlike Livery.imageUrl which needs resolveAssetUrl(). */
  imageUrl: string | null;
  active: boolean;
  liveries: Livery[];
  trackSetups: CarTrackSetup[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCarTrackSetupInput {
  trackId: string;
  fuelPerLapLiters?: number;
  pitLaneTimeSeconds?: number;
  notes?: string;
}

export type UpdateCarTrackSetupInput = Partial<Omit<CreateCarTrackSetupInput, 'trackId'>>;

export interface CreateCarInput {
  name: string;
  carClass: string;
  tankCapacityLiters: number;
  notes?: string;
  imageUrl?: string;
}

export type UpdateCarInput = Partial<CreateCarInput> & { active?: boolean };
