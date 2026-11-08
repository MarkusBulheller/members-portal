import { api } from '../api';
import type { FollowLinkSettings, PublishPlanInput, UpdateFollowLinkInput } from '../../types/follow';

/** Admin-only: a team's public "Follow the race" / OBS overlay link. */
export const followLinkApi = {
  get: (eventId: string, teamId: string) =>
    api.get<FollowLinkSettings>(`/events/${eventId}/teams/${teamId}/follow-link`),
  update: (eventId: string, teamId: string, input: UpdateFollowLinkInput) =>
    api.put<FollowLinkSettings>(`/events/${eventId}/teams/${teamId}/follow-link`, input),
  /** The plan page publishes the schedule it computed (times, fuel, tyres) for the follow page and overlay. */
  publishPlan: (eventId: string, teamId: string, input: PublishPlanInput) =>
    api.put<void>(`/events/${eventId}/teams/${teamId}/follow-link/plan`, input),
};
