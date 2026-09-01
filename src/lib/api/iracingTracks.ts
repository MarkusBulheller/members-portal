import { api } from '../api';
import type { IracingTrack } from '../../types/iracingTrack';

export const iracingTracksApi = {
  list: (includeRetired = false) =>
    api.get<IracingTrack[]>(`/iracing/tracks${includeRetired ? '?includeRetired=true' : ''}`),
};
