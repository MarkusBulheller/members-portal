import { api } from '../api';
import type {
  DiscordChannelCreateResult,
  DiscordChannelStatus,
  DiscordPlanSummaryResult,
  DiscordThreadCreateResult,
  DiscordThreadStatus,
} from '../../types/discordThread';

/** Admin-only: Discord threads per team's race (with a plan summary), and a channel per event. */
export const discordThreadApi = {
  get: (eventId: string, teamId: string) =>
    api.get<DiscordThreadStatus>(`/events/${eventId}/teams/${teamId}/discord-thread`),
  create: (eventId: string, teamId: string) =>
    api.post<DiscordThreadCreateResult>(`/events/${eventId}/teams/${teamId}/discord-thread`),
  postPlanSummary: (eventId: string, teamId: string) =>
    api.post<DiscordPlanSummaryResult>(`/events/${eventId}/teams/${teamId}/discord-thread/plan-summary`),
  /** The text channel for the whole event (created in the configured category). */
  getEventChannel: (eventId: string) => api.get<DiscordChannelStatus>(`/events/${eventId}/discord-channel`),
  createEventChannel: (eventId: string) => api.post<DiscordChannelCreateResult>(`/events/${eventId}/discord-channel`),
};
