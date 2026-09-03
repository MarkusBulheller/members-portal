import type { AchievementAward } from './achievement';

export interface DriverProfile {
  id: string;
  /** Null for a driver added manually by an admin — a roster entry with no portal login. See
   * the "linked"/"manually added" indicator on the roster and detail pages. */
  userId: string | null;
  displayName: string;
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
  awards: AchievementAward[];
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
}

export interface UpdateManualDriverInput {
  displayName?: string;
  country?: string;
  preferredClasses?: string;
  /** null explicitly clears a previously-set timezone; omitting the field leaves it untouched. */
  timezone?: string | null;
  bio?: string;
  maxSuccessiveStints?: number | null;
  startingDriver?: boolean;
  wetDriver?: boolean;
  nightDriver?: boolean;
}
