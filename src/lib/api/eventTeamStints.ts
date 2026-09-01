import { api } from '../api';
import type { CreateEventTeamStintInput, EventTeamStint, UpdateEventTeamStintInput } from '../../types/eventTeamStint';

export const eventTeamStintsApi = {
  list: (eventId: string, teamId: string) =>
    api.get<EventTeamStint[]>(`/events/${eventId}/teams/${teamId}/stints`),
  create: (eventId: string, teamId: string, input: CreateEventTeamStintInput) =>
    api.post<EventTeamStint>(`/events/${eventId}/teams/${teamId}/stints`, input),
  update: (eventId: string, teamId: string, stintId: string, input: UpdateEventTeamStintInput) =>
    api.patch<EventTeamStint>(`/events/${eventId}/teams/${teamId}/stints/${stintId}`, input),
  move: (eventId: string, teamId: string, stintId: string, direction: 'up' | 'down') =>
    api.patch<EventTeamStint[]>(`/events/${eventId}/teams/${teamId}/stints/${stintId}/move`, { direction }),
  toggleStartNow: (eventId: string, teamId: string, stintId: string) =>
    api.patch<EventTeamStint>(`/events/${eventId}/teams/${teamId}/stints/${stintId}/start-now`, {}),
  remove: (eventId: string, teamId: string, stintId: string) =>
    api.delete<void>(`/events/${eventId}/teams/${teamId}/stints/${stintId}`),
};
