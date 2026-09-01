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
}
