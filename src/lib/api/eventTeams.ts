import { api } from '../api';
import type { CreateEventTeamInput, EventTeam, UpdateEventTeamInput } from '../../types/eventTeam';

export const eventTeamsApi = {
  list: (eventId: string) => api.get<EventTeam[]>(`/events/${eventId}/teams`),
  create: (eventId: string, input: CreateEventTeamInput) => api.post<EventTeam>(`/events/${eventId}/teams`, input),
  update: (eventId: string, teamId: string, input: UpdateEventTeamInput) =>
    api.patch<EventTeam>(`/events/${eventId}/teams/${teamId}`, input),
  remove: (eventId: string, teamId: string) => api.delete<void>(`/events/${eventId}/teams/${teamId}`),
};
