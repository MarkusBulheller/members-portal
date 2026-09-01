import { api } from '../api';
import type { DashboardFilters, DashboardStats } from '../../types/stats';

export const statsApi = {
  getDashboard: (filters: DashboardFilters) => {
    const params = new URLSearchParams();
    if (filters.year !== null) params.set('year', String(filters.year));
    if (filters.trackId !== null) params.set('trackId', filters.trackId);
    if (filters.carId !== null) params.set('carId', filters.carId);
    if (filters.series !== null) params.set('series', filters.series);
    if (filters.raceLength !== null) params.set('raceLength', filters.raceLength);
    const qs = params.toString();
    return api.get<DashboardStats>(`/stats/dashboard${qs ? `?${qs}` : ''}`);
  },
};
