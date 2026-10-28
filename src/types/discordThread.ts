/** A team's Discord race thread (one per event team). */
export interface DiscordThreadStatus {
  exists: boolean;
  threadId: string | null;
  /** https://discord.com/channels/<guild>/<thread>; null when unknown. */
  url: string | null;
}

export interface DiscordThreadCreateResult {
  /** false = the thread already existed and was left untouched. */
  created: boolean;
  threadId: string;
  url: string | null;
}

export interface DiscordPlanSummaryResult {
  /** How many messages were posted into the thread. */
  posted: number;
}

/** The Discord text channel of a whole event (created inside the event category). */
export interface DiscordChannelStatus {
  exists: boolean;
  channelId: string | null;
  /** https://discord.com/channels/<guild>/<channel>; null when unknown. */
  url: string | null;
}

export interface DiscordChannelCreateResult {
  /** false = the channel already existed and was left untouched. */
  created: boolean;
  channelId: string;
  url: string | null;
}
