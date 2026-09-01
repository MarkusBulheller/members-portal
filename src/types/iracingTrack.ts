export interface IracingTrack {
  trackId: number;
  trackName: string;
  configName: string | null;
  category: string | null;
  location: string | null;
  retired: boolean;
  smallImageUrl: string | null;
  logoUrl: string | null;
  syncedAt: string;
}
