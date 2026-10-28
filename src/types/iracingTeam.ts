export interface IracingTeamMember {
  custId: number;
  displayName: string;
}

export interface IracingTeam {
  teamId: number;
  teamName: string;
  ownerCustId: number;
  rosterCount: number;
  members: IracingTeamMember[];
  syncedAt: string;
  /** Inactive teams are hidden from team pickers (GET /iracing/teams omits them unless
   * `includeInactive`) and are never watched for results. */
  active: boolean;
  /** Added by hand (a team we are not a member of, or one that no longer exists): no roster, no
   * owner, nothing synced from iRacing. */
  manual: boolean;
  /** Whether the auto-import job watches this team for newly finished races. */
  autoImport: boolean;
  /** When the auto-import job last looked at this team's results; null if it never has. */
  lastCheckedAt: string | null;
}

export interface UpdateIracingTeamInput {
  active?: boolean;
  autoImport?: boolean;
  /** Rename; the server only accepts it for a team added by hand. */
  teamName?: string;
}

export interface CreateIracingTeamInput {
  teamId: number;
  teamName: string;
}
