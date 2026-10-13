import { api } from '../api';
import type { EventTeamDummyDriver } from '../../types/eventTeamDummyDriver';

export const eventTeamDummyDriversApi = {
  list: (eventId: string, teamId: string) =>
    api.get<EventTeamDummyDriver[]>(`/events/${eventId}/teams/${teamId}/dummy-drivers`),
  /** Either a free-text name (placeholder) or a roster driver's profile id (a guest with no account). */
  create: (eventId: string, teamId: string, input: { name: string } | { driverProfileId: string }) =>
    api.post<EventTeamDummyDriver>(`/events/${eventId}/teams/${teamId}/dummy-drivers`, input),
  update: (
    eventId: string,
    teamId: string,
    dummyId: string,
    input: { name?: string; availableHours?: string[] },
  ) => api.patch<EventTeamDummyDriver>(`/events/${eventId}/teams/${teamId}/dummy-drivers/${dummyId}`, input),
  remove: (eventId: string, teamId: string, dummyId: string) =>
    api.delete<void>(`/events/${eventId}/teams/${teamId}/dummy-drivers/${dummyId}`),
};
