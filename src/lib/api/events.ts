import { api } from '../api';
import type {
  CreateEventInput,
  RaceEvent,
  RaceEventDetail,
  SignupStatus,
  UpcomingStintAssignment,
  UpdateEventInput,
} from '../../types/event';

export const eventsApi = {
  list: () => api.get<RaceEvent[]>('/events'),
  getById: (id: string) => api.get<RaceEventDetail>(`/events/${id}`),
  getMyUpcomingStints: () => api.get<UpcomingStintAssignment[]>('/events/mine/upcoming-stints'),
  create: (input: CreateEventInput) => api.post<RaceEvent>('/events', input),
  update: (id: string, input: UpdateEventInput) => api.patch<RaceEvent>(`/events/${id}`, input),
  remove: (id: string) => api.delete<void>(`/events/${id}`),
  signup: (
    id: string,
    input: {
      carId?: string | null;
      carClass?: string | null;
      secondaryCarClass?: string | null;
      notes?: string;
      timeslotIds?: string[];
      availableHours?: string[];
    },
  ) => api.post<{ id: string }>(`/events/${id}/signup`, input),
  cancelSignup: (id: string) => api.delete<void>(`/events/${id}/signup`),
  overrideSignup: (id: string, signupId: string, status: SignupStatus) =>
    api.patch<{ id: string }>(`/events/${id}/signups/${signupId}`, { status }),
  deleteSignup: (id: string, signupId: string) => api.delete<void>(`/events/${id}/signups/${signupId}`),
  assignSignupTeam: (id: string, signupId: string, eventTeamId: string | null) =>
    api.patch<{ id: string }>(`/events/${id}/signups/${signupId}/team`, { eventTeamId }),
};
