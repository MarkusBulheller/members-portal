import { api } from '../api';
import type { Role, User, UserStatus } from '../../types/user';

export const adminApi = {
  listMembers: (status?: UserStatus) => api.get<User[]>(`/admin/members${status ? `?status=${status}` : ''}`),
  approve: (id: string) => api.post<User>(`/admin/members/${id}/approve`),
  reject: (id: string, reason?: string) => api.post<User>(`/admin/members/${id}/reject`, { reason }),
  suspend: (id: string) => api.post<User>(`/admin/members/${id}/suspend`),
  updateRole: (id: string, role: Role) => api.patch<User>(`/admin/members/${id}/role`, { role }),
};
