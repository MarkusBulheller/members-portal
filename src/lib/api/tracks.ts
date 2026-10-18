import { api } from '../api';
import type { CreateTrackInput, Track, TrackCarSetup, UpdateTrackInput } from '../../types/track';

export const tracksApi = {
  list: (includeInactive = false) =>
    api.get<Track[]>(`/tracks${includeInactive ? '?includeInactive=true' : ''}`),
  getById: (id: string) => api.get<Track>(`/tracks/${id}`),
  create: (input: CreateTrackInput) => api.post<Track>('/tracks', input),
  update: (id: string, input: UpdateTrackInput) => api.patch<Track>(`/tracks/${id}`, input),
  remove: (id: string) => api.delete<void>(`/tracks/${id}`),
  /** Admin: stores an image and returns its path to send as `imageUrl` on create/update. */
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload<{ imageUrl: string }>('/tracks/image', formData);
  },
  listSetups: (trackId: string) => api.get<TrackCarSetup[]>(`/tracks/${trackId}/setups`),
};
