import { api } from '../api';
import type { IracingCarUsageStat, IracingSeriesSeason } from '../../types/iracingSeries';
import type { WeatherForecastPoint } from '../../types/iracingWeatherForecast';

export const iracingSeriesApi = {
  list: () => api.get<IracingSeriesSeason[]>('/iracing/series'),
  getWeatherForecast: (seasonId: number, raceWeekNum: number) =>
    api.get<WeatherForecastPoint[]>(`/iracing/series/${seasonId}/weather/${raceWeekNum}`),
  setTrackCarUsage: (seasonId: number, tracked: boolean) =>
    api.patch<IracingSeriesSeason>(`/iracing/series/${seasonId}/track-car-usage`, { tracked }),
  getCarUsage: (seasonId: number, raceWeekNum: number) =>
    api.get<IracingCarUsageStat[]>(`/iracing/series/${seasonId}/car-usage/${raceWeekNum}`),
  syncCarUsageSince: (seasonId: number, since: string) =>
    api.post<{ ok: true }>(`/iracing/series/${seasonId}/car-usage/sync-since`, { since }),
};
