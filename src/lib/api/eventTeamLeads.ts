import { api } from '../api';

export interface EventTeamLeadView {
  userId: string;
  name: string;
}

/** Admin management of the leads of ONE event crew. */
export const eventTeamLeadsApi = {
  list: (eventId: string, teamId: string) => api.get<EventTeamLeadView[]>(`/events/${eventId}/teams/${teamId}/leads`),
  /** Replaces the crew's whole lead set (approved drivers placed on the crew, max 5). */
  replace: (eventId: string, teamId: string, userIds: string[]) =>
    api.put<EventTeamLeadView[]>(`/events/${eventId}/teams/${teamId}/leads`, { userIds }),
};
