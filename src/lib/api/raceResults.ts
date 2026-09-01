import { api } from '../api';
import type { RaceResult } from '../../types/raceResult';

export const raceResultsApi = {
  list: () => api.get<RaceResult[]>('/race-results'),
  listByDriver: (driverProfileId: string) =>
    api.get<RaceResult[]>(`/race-results/by-driver/${driverProfileId}`),
  listByCar: (carId: string) => api.get<RaceResult[]>(`/race-results/by-car/${carId}`),
  listByTrack: (trackId: string) => api.get<RaceResult[]>(`/race-results/by-track/${trackId}`),
  getById: (id: string) => api.get<RaceResult>(`/race-results/${id}`),
  getShared: (token: string) => api.get<RaceResult>(`/race-results/shared/${token}`),
  import: (subsessionId: number, teamId: number) =>
    api.post<RaceResult>('/race-results', { subsessionId, teamId }),
  remove: (id: string) => api.delete<void>(`/race-results/${id}`),
  share: (id: string) => api.post<{ shareToken: string }>(`/race-results/${id}/share`),
  unshare: (id: string) => api.delete<void>(`/race-results/${id}/share`),
};
