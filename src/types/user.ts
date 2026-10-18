export type Role = 'ADMIN' | 'MEMBER';
export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface User {
  id: string;
  discordId: string;
  discordUsername: string;
  discordGlobalName: string | null;
  discordAvatarUrl: string | null;
  role: Role;
  status: UserStatus;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Member count per status plus the total, from GET /admin/members/counts. */
export type MemberStatusCounts = Record<UserStatus | 'ALL', number>;
