import { api } from '../api';
import type { DiscordBotSettings, DiscordBotStatus, UpdateDiscordBotSettingsInput } from '../../types/discordBotSettings';

export const discordBotSettingsApi = {
  get: () => api.get<DiscordBotSettings>('/admin/discord-bot-settings'),
  update: (input: UpdateDiscordBotSettingsInput) =>
    api.patch<DiscordBotSettings>('/admin/discord-bot-settings', input),
  checkStatus: () => api.get<DiscordBotStatus>('/admin/discord-bot-settings/status'),
};
