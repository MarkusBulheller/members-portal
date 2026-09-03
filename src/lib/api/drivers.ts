import { api } from '../api';
import type {
  CreateManualDriverInput,
  DriverProfile,
  IracingDriverCandidate,
  UpdateDriverProfileInput,
  UpdateManualDriverInput,
} from '../../types/driver';

export const driversApi = {
  list: () => api.get<DriverProfile[]>('/drivers'),
  getOwn: () => api.get<DriverProfile>('/drivers/me'),
  updateOwn: (input: UpdateDriverProfileInput) => api.patch<DriverProfile>('/drivers/me', input),
  getById: (id: string) => api.get<DriverProfile>(`/drivers/${id}`),
  create: (input: CreateManualDriverInput) => api.post<DriverProfile>('/drivers', input),
  update: (id: string, input: UpdateManualDriverInput) => api.patch<DriverProfile>(`/drivers/${id}`, input),
  updateSettingsAsAdmin: (id: string, input: UpdateDriverProfileInput) =>
    api.patch<DriverProfile>(`/drivers/${id}/settings`, input),
  uploadOwnAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload<DriverProfile>('/drivers/me/avatar', formData);
  },
  removeOwnAvatar: () => api.delete<DriverProfile>('/drivers/me/avatar'),
  uploadAvatarAsAdmin: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload<DriverProfile>(`/drivers/${id}/avatar`, formData);
  },
  removeAvatarAsAdmin: (id: string) => api.delete<DriverProfile>(`/drivers/${id}/avatar`),
  applyIracingSnapshot: (id: string, candidate: IracingDriverCandidate) =>
    api.post<DriverProfile>(`/drivers/${id}/iracing-link`, candidate),
  searchIracing: (query: string) =>
    api.get<IracingDriverCandidate[]>(`/iracing/drivers/search?q=${encodeURIComponent(query)}`),
};
