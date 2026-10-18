import { api } from '../api';
import type {
  Car,
  CarDetail,
  CarTrackSetup,
  CreateCarInput,
  CreateCarTrackSetupInput,
  UpdateCarInput,
  UpdateCarTrackSetupInput,
} from '../../types/car';

export const carsApi = {
  /** Slim list: `liveryCount` / `trackSetupCount` instead of the nested arrays. */
  list: (includeInactive = false) =>
    api.get<Car[]>(`/cars${includeInactive ? '?includeInactive=true' : ''}`),
  getById: (id: string) => api.get<CarDetail>(`/cars/${id}`),
  create: (input: CreateCarInput) => api.post<Car>('/cars', input),
  update: (id: string, input: UpdateCarInput) => api.patch<Car>(`/cars/${id}`, input),
  remove: (id: string) => api.delete<void>(`/cars/${id}`),
  uploadLivery: (carId: string, file: File, name: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    return api.upload<{ id: string }>(`/cars/${carId}/liveries`, formData);
  },
  /** Admin: stores an image and returns its path to send as `imageUrl` on create/update. */
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload<{ imageUrl: string }>('/cars/image', formData);
  },
  removeLivery: (liveryId: string) => api.delete<void>(`/liveries/${liveryId}`),
  addTrackSetup: (carId: string, input: CreateCarTrackSetupInput) =>
    api.post<CarTrackSetup>(`/cars/${carId}/track-setups`, input),
  updateTrackSetup: (id: string, input: UpdateCarTrackSetupInput) =>
    api.patch<CarTrackSetup>(`/track-setups/${id}`, input),
  removeTrackSetup: (id: string) => api.delete<void>(`/track-setups/${id}`),
};
