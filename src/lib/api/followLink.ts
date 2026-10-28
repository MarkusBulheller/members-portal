import { api } from '../api';
import type { FollowLinkSettings, UpdateFollowLinkInput } from '../../types/follow';

/** Admin-only: a team's public "Follow the race" / OBS overlay link. */
export const followLinkApi = {
  get: (eventId: string, teamId: string) =>
    api.get<FollowLinkSettings>(`/events/${eventId}/teams/${teamId}/follow-link`),
  update: (eventId: string, teamId: string, input: UpdateFollowLinkInput) =>
    api.put<FollowLinkSettings>(`/events/${eventId}/teams/${teamId}/follow-link`, input),
};
