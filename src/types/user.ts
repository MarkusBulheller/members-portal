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
  /** Ids of the event crews (event teams) this user currently leads (GET /auth/me); a team lead can run
   * the race planning of exactly those crews. Missing/empty = leads nothing. */
  leadOfEventTeamIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Member count per status plus the total, from GET /admin/members/counts. */
export type MemberStatusCounts = Record<UserStatus | 'ALL', number>;
