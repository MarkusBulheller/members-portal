export interface DiscordBotSettings {
  hasToken: boolean;
  eventsChannelId: string | null;
}

export interface UpdateDiscordBotSettingsInput {
  /** Blank/omitted leaves the currently-stored token untouched. */
  botToken?: string;
  /** Empty string explicitly clears it; omitted leaves it untouched. */
  eventsChannelId?: string;
}

/** Live check against Discord's own API — see GET .../status. Any *boolean|null* field is null
 * when it couldn't be determined (e.g. inGuild stays null if there's no token to check with). */
export interface DiscordBotStatus {
  tokenValid: boolean;
  botUsername: string | null;
  guildConfigured: boolean;
  inGuild: boolean | null;
  channelConfigured: boolean;
  channelPermissionsOk: boolean | null;
  missingPermissions: string[];
  error: string | null;
}
