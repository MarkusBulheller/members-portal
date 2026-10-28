import type { AchievementAward } from './achievement';

export interface DriverProfile {
  id: string;
  /** Null for a driver added manually by an admin — a roster entry with no portal login. See
   * the "linked"/"manually added" indicator on the roster and detail pages. */
  userId: string | null;
  displayName: string;
  /** Relative path under /uploads — pass through resolveAssetUrl() before rendering. Null shows
   * the initials fallback used on the roster/detail pages. */
  avatarUrl: string | null;
  iracingCustomerId: string | null;
  /** Verified snapshot from iRacing's OAuth flow, captured at link time — see EditMyProfilePage's
   * "Link iRacing Account" button. Null until linked. */
  iracingName: string | null;
  iracingLocation: string | null;
  /** ISO 3166-1 alpha-2 code (e.g. "DE") — pass to the CountryFlag component. */
  iracingCountryCode: string | null;
  sportsCarIrating: number | null;
  sportsCarSafetyRating: string | null;
  /** Set whenever the snapshot is (re-)captured — either a manual "Re-link" or the weekly
   * auto-refresh cron. Null if never linked. */
  iracingStatsSyncedAt: string | null;
  country: string | null;
  /** IANA timezone name (e.g. "America/Los_Angeles") — self-set on EditMyProfilePage, drives the
   * Strategy table's "Driver Time" column. Null until the driver picks one. */
  timezone: string | null;
  preferredClasses: string | null;
  bio: string | null;
  /** Endurance-planning flags — how many stints in a row this driver can do before needing a
   * break, and which conditions they're suited/willing to drive. */
  maxSuccessiveStints: number | null;
  startingDriver: boolean;
  wetDriver: boolean;
  nightDriver: boolean;
  /** Opt-in: the team bot DMs this member their personal race summary on Discord after a result
   * they drove in is imported. Members only; false for guests. */
  raceSummaryDm: boolean;
  /** Full award list — GET /drivers/:id and the other single-profile endpoints. Absent from the roster
   * list (GET /drivers), which sends `awardCount` instead. */
  awards?: AchievementAward[];
  /** Roster list only: how many awards this driver holds. */
  awardCount?: number;
  /** Discord handle (no @) — a linked member's, sent only to the profile's owner and admins; for a
   * manually added (guest) driver, the username an admin entered so they can sign up through
   * Discord (admins only). Null otherwise; absent on list responses. */
  discordUsername?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateDriverProfileInput {
  displayName?: string;
  iracingCustomerId?: string;
  country?: string;
  /** null explicitly clears a previously-set timezone; omitting the field leaves it untouched. */
  timezone?: string | null;
  preferredClasses?: string;
  bio?: string;
  /** null explicitly clears a previously-set value, same convention as timezone above. */
  maxSuccessiveStints?: number | null;
  startingDriver?: boolean;
  wetDriver?: boolean;
  nightDriver?: boolean;
  raceSummaryDm?: boolean;
}

/** One candidate from GET /iracing/drivers/search — the same shape as a real member's link
 * snapshot, minus the refresh token (always null for a searched-up driver, since only the
 * driver themselves could grant that). */
export interface IracingDriverCandidate {
  custId: number;
  name: string;
  location: string | null;
  countryCode: string | null;
  sportsCarIrating: number | null;
  sportsCarSafetyRating: string | null;
}

export interface CreateManualDriverInput {
  displayName: string;
  iracingCustId?: number;
  iracingName?: string;
  iracingLocation?: string;
  iracingCountryCode?: string;
  sportsCarIrating?: number;
  sportsCarSafetyRating?: string;
  country?: string;
  preferredClasses?: string;
  timezone?: string;
  bio?: string;
  maxSuccessiveStints?: number;
  startingDriver?: boolean;
  wetDriver?: boolean;
  nightDriver?: boolean;
  /** Discord username (e.g. delta2611, no @); omit when unknown. */
  discordUsername?: string;
}

export interface UpdateManualDriverInput {
  displayName?: string;
  country?: string;
  preferredClasses?: string;
  /** null explicitly clears a previously-set timezone; omitting the field leaves it untouched. */
  timezone?: string | null;
  bio?: string;
  /** Discord username; null explicitly clears it, omitting leaves it untouched. */
  discordUsername?: string | null;
  maxSuccessiveStints?: number | null;
  startingDriver?: boolean;
  wetDriver?: boolean;
  nightDriver?: boolean;
}
