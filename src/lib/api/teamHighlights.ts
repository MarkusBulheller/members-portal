import { api } from '../api';
import type { CreateTeamHighlightInput, TeamHighlight, UpdateTeamHighlightInput } from '../../types/teamHighlight';

export const teamHighlightsApi = {
  list: () => api.get<TeamHighlight[]>('/team-highlights'),
  create: (input: CreateTeamHighlightInput) => api.post<TeamHighlight>('/team-highlights', input),
  update: (id: string, input: UpdateTeamHighlightInput) => api.patch<TeamHighlight>(`/team-highlights/${id}`, input),
  move: (id: string, direction: 'up' | 'down') =>
    api.patch<TeamHighlight[]>(`/team-highlights/${id}/move`, { direction }),
  remove: (id: string) => api.delete<void>(`/team-highlights/${id}`),
};
