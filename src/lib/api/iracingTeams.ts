import { api } from '../api';
import type { CreateIracingTeamInput, IracingTeam, UpdateIracingTeamInput } from '../../types/iracingTeam';

export const iracingTeamsApi = {
  /** Active teams only by default (what every team picker wants); the admin pages pass
   * `includeInactive` to see deactivated teams too. */
  list: (opts: { includeInactive?: boolean } = {}) =>
    api.get<IracingTeam[]>(opts.includeInactive ? '/iracing/teams?includeInactive=true' : '/iracing/teams'),
  /** Adds a team by hand (admin). The server normalises the id to its positive form. */
  create: (input: CreateIracingTeamInput) => api.post<IracingTeam>('/iracing/teams', input),
  /** Only a team added by hand can be removed. */
  remove: (teamId: number) => api.delete<void>(`/iracing/teams/${teamId}`),
  update: (teamId: number, input: UpdateIracingTeamInput) =>
    api.patch<IracingTeam>(`/iracing/teams/${teamId}`, input),
};
