import type { RaceLengthMinutes } from './raceLength';
import type { Track } from './track';

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'SIGNUPS_CLOSED' | 'CANCELLED' | 'COMPLETED';
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
  /** Links this event to a specific iRacing series-season week — see EventWeatherForecast, which
   * uses these to fetch and display that week's forecast on the event detail page. Both null
   * unless explicitly linked. */
  iracingSeasonId: number | null;
  iracingRaceWeekNum: number | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RaceEventDetail extends RaceEvent {
  signups: EventSignup[];
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
  raceLengthMinutes: number;
  isLive: boolean;
  /** This driver's next stint in the crew's rotation, if one is still ahead of them — null once
   * they have none left, or the team has no committed timeslot to schedule from yet. */
  nextStintStartsAt: string | null;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  trackId: string;
  carClasses: string[];
  startsAt: string;
  endsAt?: string;
  signupDeadline?: string;
  raceLengthMinutes: RaceLengthMinutes;
  /** Candidate start times, as local <input type="datetime-local"> strings — converted to ISO
   * right before the API call, same as startsAt/endsAt. */
  timeslots: string[];
  status?: EventStatus;
  /** undefined = leave unchanged (update) / unset (create), null = clear, number = set. */
  iracingSeasonId?: number | null;
  iracingRaceWeekNum?: number | null;
}

export type UpdateEventInput = Partial<CreateEventInput>;
