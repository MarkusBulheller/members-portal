import { api } from '../api';
import type {
  IracingCarUsageStat,
  IracingCarUsageSummary,
  IracingSeriesSeason,
  IracingSeriesSeasonDetail,
} from '../../types/iracingSeries';
import type { WeatherForecastPoint } from '../../types/iracingWeatherForecast';

export const iracingSeriesApi = {
  /** Slim list — no `schedule`. Use getById() for a season's schedule. */
  list: () => api.get<IracingSeriesSeason[]>('/iracing/series'),
  getById: (seasonId: number) => api.get<IracingSeriesSeasonDetail>(`/iracing/series/${seasonId}`),
  getWeatherForecast: (seasonId: number, raceWeekNum: number) =>
    api.get<WeatherForecastPoint[]>(`/iracing/series/${seasonId}/weather/${raceWeekNum}`),
  setTrackCarUsage: (seasonId: number, tracked: boolean) =>
    api.patch<IracingSeriesSeason>(`/iracing/series/${seasonId}/track-car-usage`, { tracked }),
  getCarUsage: (seasonId: number, raceWeekNum: number) =>
    api.get<IracingCarUsageStat[]>(`/iracing/series/${seasonId}/car-usage/${raceWeekNum}`),
  getCarUsageSummary: (seasonId: number, raceWeekNum: number) =>
    api.get<IracingCarUsageSummary>(`/iracing/series/${seasonId}/car-usage/${raceWeekNum}/summary`),
  syncCarUsageSince: (seasonId: number, since: string) =>
    api.post<{ ok: true }>(`/iracing/series/${seasonId}/car-usage/sync-since`, { since }),
};
