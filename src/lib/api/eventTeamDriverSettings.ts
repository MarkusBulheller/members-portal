import { api } from '../api';
import type {
  EventTeamDriverSettings,
  UpsertEventTeamDriverSettingsInput,
} from '../../types/eventTeamDriverSettings';

export const eventTeamDriverSettingsApi = {
  list: (eventId: string, teamId: string) =>
    api.get<EventTeamDriverSettings[]>(`/events/${eventId}/teams/${teamId}/driver-settings`),
  upsert: (eventId: string, teamId: string, userId: string, input: UpsertEventTeamDriverSettingsInput) =>
    api.patch<EventTeamDriverSettings>(`/events/${eventId}/teams/${teamId}/driver-settings/${userId}`, input),
};
