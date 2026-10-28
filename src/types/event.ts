import type { RaceLengthMinutes } from './raceLength';
import type { Track } from './track';

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'SIGNUPS_CLOSED' | 'CANCELLED' | 'COMPLETED';
export type Sim = 'IRACING' | 'LMU';

export const SIM_LABELS: Record<Sim, string> = { IRACING: 'iRacing', LMU: 'Le Mans Ultimate' };
export type SignupStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';

export interface EventTimeslot {
  id: string;
  startsAt: string;
}

export interface EventSignup {
  id: string;
  eventId: string;
  userId: string;
  carId: string | null;
  carClass: string | null;
  secondaryCarClass: string | null;
  status: SignupStatus;
  notes: string | null;
  timeslots: EventTimeslot[];
  /** Timeslot ids in the driver's preference order, most preferred first — null for signups that
   * were never ranked (treat as chronological). Use rankTimeslots() to apply it. */
  timeslotPreference?: string[] | null;
  /** Actual wall-clock hours (ISO timestamps, on-the-hour) this driver can take a driving
   * stint — absolute, not offsets, so the same real hour lines up across every timeslot's
   * availability grid. Distinct from `timeslots`, which are candidate overall start times. */
  availableHours: string[];
  /** Which EventTeam (car/crew) an admin has placed this driver on — null until assigned. */
  eventTeamId: string | null;
  signedUpAt: string;
}

export interface RaceEvent {
  id: string;
  title: string;
  description: string | null;
  track: Track;
  trackId: string;
  carClasses: string[];
  startsAt: string;
  endsAt: string | null;
  signupDeadline: string | null;
  raceLengthMinutes: number;
  timeslots: EventTimeslot[];
  status: EventStatus;
  sim: Sim;
  /** iRacing only: the session caps how full the tank can be filled, as a percent of the car's
   * max (decimal column, so a string like "98.00"). Null = no limit. */
  fuelLimitPercent: string | null;
  /** LMU only: how many individual tyres (not sets) each car may use over the whole race,
   * including the 4 it starts on. Null = no limit. */
  tyreLimit: number | null;
  /** Links this event to a specific iRacing series-season week — see EventWeatherForecast, which
   * uses these to fetch and display that week's forecast on the event detail page. Both null
   * unless explicitly linked. */
  iracingSeasonId: number | null;
  iracingRaceWeekNum: number | null;
  /** Drivers a team should have for the readiness check; null = the default (4). */
  minDriversPerTeam: number | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  /** The requesting user's own relationship to this event (GET /events list + detail). Optional so
   * older payloads still type-check; the backend fills it in for every authenticated request. */
  viewer?: EventViewerStatus;
}

/** signedUp = has a non-cancelled signup; onTeam = placed on an EventTeam; raced = event COMPLETED
 * and the user was on a team that raced. */
export interface EventViewerStatus {
  signedUp: boolean;
  onTeam: boolean;
  raced: boolean;
}

/** An active signup of a guest driver (a manually added driver with no portal account) — they sign
 * up through Discord. Separate from member `signups`; see GET /events/:id `guestSignups`. */
export interface EventGuestSignup {
  id: string;
  eventId: string;
  /** The guest's DriverProfile id. */
  driverProfileId: string;
  /** iracingName ?? displayName. */
  driverName: string;
  avatarUrl: string | null;
  carClass: string | null;
  /** The chosen start times (EventTimeslot ids). */
  timeslotIds: string[];
  /** Same meaning as EventSignup.timeslotPreference. */
  timeslotPreference: string[] | null;
  status: 'CONFIRMED' | 'CANCELLED';
  signedUpAt: string;
  /** Already placed on one of the event's teams (as a roster guest). */
  onTeam: boolean;
  eventTeamId: string | null;
}

export interface RaceEventDetail extends RaceEvent {
  signups: EventSignup[];
  /** Active guest signups; optional so older payloads still type-check. */
  guestSignups?: EventGuestSignup[];
}

/** One team the current driver has a stint assignment in, for an event that hasn't fully finished
 * — see GET /events/mine/upcoming-stints. Event/team-level only, not a precise stint-by-stint
 * schedule (that needs the planning page's own live fuel-tank/pace cascade). */
export interface UpcomingStintAssignment {
  eventId: string;
  eventTitle: string;
  teamId: string;
  teamName: string;
  timeslotStartsAt: string | null;
  /** The green flag (timeslot start + the team's race-start offset) — what stint times count from.
   * Optional for older payloads; fall back to timeslotStartsAt. */
  raceStartsAt?: string | null;
  raceLengthMinutes: number;
  isLive: boolean;
  /** This driver's next stint in the crew's rotation, if one is still ahead of them — null once
   * they have none left, or the team has no committed timeslot to schedule from yet. */
  nextStintStartsAt: string | null;
  /** Track name of the event, so the dashboard hero can show it. Optional for older payloads. */
  trackName?: string | null;
  /** The whole crew's stint rotation (from the saved stint plan, if any) with this driver's stints
   * flagged — powers the dashboard's "You drive N of M" strip. Empty/absent when no plan exists. */
  stints?: UpcomingStintSlot[];
}

export interface UpcomingStintSlot {
  startsAt: string;
  endsAt: string;
  isMine: boolean;
  driverName: string | null;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  trackId: string;
  carClasses: string[];
  startsAt: string;
  endsAt?: string;
  /** undefined = leave unchanged (update) / unset (create), null = clear, string = set. */
  signupDeadline?: string | null;
  raceLengthMinutes: RaceLengthMinutes;
  /** Candidate start times, as local <input type="datetime-local"> strings — converted to ISO
   * right before the API call, same as startsAt/endsAt. */
  timeslots: string[];
  status?: EventStatus;
  sim?: Sim;
  fuelLimitPercent?: number | null;
  /** LMU only; null clears it. */
  tyreLimit?: number | null;
  /** undefined = leave unchanged (update) / unset (create), null = clear, number = set. */
  iracingSeasonId?: number | null;
  iracingRaceWeekNum?: number | null;
  /** undefined = leave unchanged, null = clear (back to the default), number = set. */
  minDriversPerTeam?: number | null;
}

export type UpdateEventInput = Partial<CreateEventInput>;
