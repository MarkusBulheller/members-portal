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
  applyIracingSnapshot: (id: string, candidate: IracingDriverCandidate) =>
    api.post<DriverProfile>(`/drivers/${id}/iracing-link`, candidate),
  searchIracing: (query: string) =>
    api.get<IracingDriverCandidate[]>(`/iracing/drivers/search?q=${encodeURIComponent(query)}`),
};
