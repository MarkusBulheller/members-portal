import { ApiError, apiUrl } from '../api';
import type { FollowState } from '../../types/follow';

/** Anonymous endpoints behind the public follow page and the OBS overlay. Plain fetch WITHOUT
 * credentials (the shared `api` client always sends cookies): these pages work logged out and must
 * not depend on, or leak, a session. The link token is the only secret involved. */
export const publicFollowApi = {
  async getState(token: string, signal?: AbortSignal): Promise<FollowState> {
    const response = await fetch(apiUrl(`/public/follow/${encodeURIComponent(token)}`), {
      credentials: 'omit',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw new ApiError(response.status, response.statusText);
    return (await response.json()) as FollowState;
  },

  /** URL of the change-notice SSE stream (open it with `new EventSource(url)` — no credentials). */
  streamUrl: (token: string) => apiUrl(`/public/follow/${encodeURIComponent(token)}/stream`),
};
