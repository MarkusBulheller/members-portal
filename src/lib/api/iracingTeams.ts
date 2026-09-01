import { api } from '../api';
import type { IracingTeam } from '../../types/iracingTeam';

export const iracingTeamsApi = {
  list: () => api.get<IracingTeam[]>('/iracing/teams'),
};
