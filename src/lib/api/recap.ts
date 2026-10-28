import { api } from '../api';
import type { RecapStats } from '../../types/recap';

export const recapApi = {
  /** `year` null = the server's default (current year, or the latest with results). `teamId` null = all teams. */
  get: (year: number | null, teamId: number | null) => {
    const params = new URLSearchParams();
    if (year !== null) params.set('year', String(year));
    if (teamId !== null) params.set('teamId', String(teamId));
    const qs = params.toString();
    return api.get<RecapStats>(`/stats/recap${qs ? `?${qs}` : ''}`);
  },
};
