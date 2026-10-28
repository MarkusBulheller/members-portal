import { api } from '../api';
import type { DiscordPlanSummaryResult, DiscordThreadCreateResult, DiscordThreadStatus } from '../../types/discordThread';

/** Admin-only: the Discord thread for a team's race. */
export const discordThreadApi = {
  get: (eventId: string, teamId: string) =>
    api.get<DiscordThreadStatus>(`/events/${eventId}/teams/${teamId}/discord-thread`),
  create: (eventId: string, teamId: string) =>
    api.post<DiscordThreadCreateResult>(`/events/${eventId}/teams/${teamId}/discord-thread`),
  postPlanSummary: (eventId: string, teamId: string) =>
    api.post<DiscordPlanSummaryResult>(`/events/${eventId}/teams/${teamId}/discord-thread/plan-summary`),
};
