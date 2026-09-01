import { api } from '../api';
import type { CreateTrackInput, Track, UpdateTrackInput } from '../../types/track';

export const tracksApi = {
  list: (includeInactive = false) =>
    api.get<Track[]>(`/tracks${includeInactive ? '?includeInactive=true' : ''}`),
  getById: (id: string) => api.get<Track>(`/tracks/${id}`),
  create: (input: CreateTrackInput) => api.post<Track>('/tracks', input),
  update: (id: string, input: UpdateTrackInput) => api.patch<Track>(`/tracks/${id}`, input),
  remove: (id: string) => api.delete<void>(`/tracks/${id}`),
};
