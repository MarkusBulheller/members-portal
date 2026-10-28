import { api } from '../api';
import type { ReadinessResult } from '../../types/readiness';
import type {
  CreateEventInput,
  EventGuestSignup,
  RaceEvent,
  RaceEventDetail,
  SignupStatus,
  UpcomingStintAssignment,
  UpdateEventInput,
} from '../../types/event';

export interface SignupInput {
  carId?: string | null;
  carClass?: string | null;
  secondaryCarClass?: string | null;
  notes?: string;
  timeslotIds?: string[];
  /** Preference order over timeslotIds (most preferred first); null clears it. */
  timeslotPreference?: string[] | null;
  availableHours?: string[];
}

export const eventsApi = {
  list: () => api.get<RaceEvent[]>('/events'),
  getById: (id: string) => api.get<RaceEventDetail>(`/events/${id}`),
  /** Informational go/no-go check for an event (admins: every team; members: only their teams). */
  getReadiness: (id: string) => api.get<ReadinessResult>(`/events/${id}/readiness`),
  getMyUpcomingStints: () => api.get<UpcomingStintAssignment[]>('/events/mine/upcoming-stints'),
  create: (input: CreateEventInput) => api.post<RaceEvent>('/events', input),
  update: (id: string, input: UpdateEventInput) => api.patch<RaceEvent>(`/events/${id}`, input),
  remove: (id: string) => api.delete<void>(`/events/${id}`),
  signup: (id: string, input: SignupInput) => api.post<{ id: string }>(`/events/${id}/signup`, input),
  /** Admin-only: edits another driver's signup (start times, class, stint hours) by signup id. */
  updateSignupDetails: (id: string, signupId: string, input: SignupInput) =>
    api.patch<{ id: string }>(`/events/${id}/signups/${signupId}/details`, input),
  /** Admin-only: signs an approved member up (optionally straight onto a team) without them
   * having signed up themselves. */
  addSignup: (id: string, input: { userId: string; eventTeamId?: string | null }) =>
    api.post<{ id: string }>(`/events/${id}/signups`, input),
  cancelSignup: (id: string) => api.delete<void>(`/events/${id}/signup`),
  overrideSignup: (id: string, signupId: string, status: SignupStatus) =>
    api.patch<{ id: string }>(`/events/${id}/signups/${signupId}`, { status }),
  deleteSignup: (id: string, signupId: string) => api.delete<void>(`/events/${id}/signups/${signupId}`),
  assignSignupTeam: (id: string, signupId: string, eventTeamId: string | null) =>
    api.patch<{ id: string }>(`/events/${id}/signups/${signupId}/team`, { eventTeamId }),
  /** Admin-only: active signups of guest drivers (no portal account). */
  listGuestSignups: (id: string) => api.get<EventGuestSignup[]>(`/events/${id}/guest-signups`),
  /** Admin-only: removes (cancels) a guest driver's signup. */
  cancelGuestSignup: (id: string, driverProfileId: string) =>
    api.delete<void>(`/events/${id}/guest-signups/${driverProfileId}`),
  /** Admin-only: puts a signed-up guest on a team as a roster guest (409 if already on one). */
  placeGuestOnTeam: (id: string, driverProfileId: string, eventTeamId: string) =>
    api.post<{ id: string }>(`/events/${id}/guest-signups/${driverProfileId}/team`, { eventTeamId }),
};
