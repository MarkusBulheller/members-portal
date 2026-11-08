import { api } from '../api';
import type { PlanBaseline, SavePlanBaselineInput } from '../../types/follow';

/** The original plan of a crew (what "vs plan" is measured against). Anyone who can see the plan
 * can read it; saving and clearing is for admins and the team's lead. */
export const planBaselineApi = {
  /** null until one is saved. */
  get: async (eventId: string, teamId: string): Promise<PlanBaseline | null> =>
    (await api.get<PlanBaseline | null | undefined>(`/events/${eventId}/teams/${teamId}/plan-baseline`)) ?? null,
  set: (eventId: string, teamId: string, input: SavePlanBaselineInput) =>
    api.put<PlanBaseline>(`/events/${eventId}/teams/${teamId}/plan-baseline`, input),
  clear: (eventId: string, teamId: string) => api.delete<void>(`/events/${eventId}/teams/${teamId}/plan-baseline`),
};
