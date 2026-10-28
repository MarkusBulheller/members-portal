export interface DiscordBotSettings {
  hasToken: boolean;
  eventsChannelId: string | null;
  /** Channel where automatically/manually imported race results are announced. */
  resultsChannelId: string | null;
  /** Whether the Discord application's public key is stored — never the key itself. */
  publicKeySet: boolean;
  /** Discord user id that gets a DM when someone who isn't linked tries to sign up. */
  alertUserId: string | null;
}

export interface UpdateDiscordBotSettingsInput {
  /** Blank/omitted leaves the currently-stored token untouched. */
  botToken?: string;
  /** Empty string explicitly clears it; omitted leaves it untouched. */
  eventsChannelId?: string;
  /** Empty string explicitly clears it; omitted leaves it untouched. */
  resultsChannelId?: string;
  /** 64 hex chars; blank/omitted leaves the stored key untouched. */
  publicKey?: string;
  /** Empty string clears it; omitted leaves it untouched. */
  alertUserId?: string;
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
