import { api } from '../api';
import type { IracingCar } from '../../types/iracingCar';

export const iracingCarsApi = {
  list: (includeRetired = false) =>
    api.get<IracingCar[]>(`/iracing/cars${includeRetired ? '?includeRetired=true' : ''}`),
};
