import { api } from '../api';
import type {
  AchievementAward,
  AchievementDefinition,
  CreateAchievementAwardInput,
  CreateAchievementDefinitionInput,
  UpdateAchievementDefinitionInput,
} from '../../types/achievement';

export const achievementsApi = {
  listDefinitions: () => api.get<AchievementDefinition[]>('/achievements/definitions'),
  createDefinition: (input: CreateAchievementDefinitionInput) =>
    api.post<AchievementDefinition>('/achievements/definitions', input),
  updateDefinition: (id: string, input: UpdateAchievementDefinitionInput) =>
    api.patch<AchievementDefinition>(`/achievements/definitions/${id}`, input),
  removeDefinition: (id: string) => api.delete<void>(`/achievements/definitions/${id}`),
  recalculate: (id: string) => api.post<{ newAwards: number }>(`/achievements/definitions/${id}/recalculate`),
  award: (input: CreateAchievementAwardInput) => api.post<AchievementAward>('/achievements/awards', input),
  revokeAward: (id: string) => api.delete<void>(`/achievements/awards/${id}`),
};
