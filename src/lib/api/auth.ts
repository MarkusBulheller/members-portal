import { api } from '../api';
import type { User } from '../../types/user';

export const authApi = {
  me: () => api.get<User>('/auth/me'),
  logout: () => api.post<{ success: boolean }>('/auth/logout'),
};
