import { api } from '../api';
import type { User } from '../../types/user';

export interface PublicAuthConfig {
  /** Public Discord invite link (backend DISCORD_INVITE_URL), or null when not configured. */
  discordInviteUrl: string | null;
}

export const authApi = {
  me: () => api.get<User>('/auth/me'),
  logout: () => api.post<{ success: boolean }>('/auth/logout'),
  config: () => api.get<PublicAuthConfig>('/auth/config'),
};
