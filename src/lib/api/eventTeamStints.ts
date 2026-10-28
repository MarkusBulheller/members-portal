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
  /** Sets the stint's real start to now, or clears it when it already has one. With `restart` it
   * always sets it to now (for the stint that is running right now). */
  toggleStartNow: (eventId: string, teamId: string, stintId: string, opts: { restart?: boolean } = {}) =>
    api.patch<EventTeamStint>(`/events/${eventId}/teams/${teamId}/stints/${stintId}/start-now`, opts.restart ? { restart: true } : {}),
  /** Drag and drop: puts the stint at a 0-based position; returns the renumbered list. */
  moveTo: (eventId: string, teamId: string, stintId: string, index: number) =>
    api.patch<EventTeamStint[]>(`/events/${eventId}/teams/${teamId}/stints/${stintId}/position`, { index }),
  remove: (eventId: string, teamId: string, stintId: string) =>
    api.delete<void>(`/events/${eventId}/teams/${teamId}/stints/${stintId}`),
};
