export interface TeamHighlight {
  id: string;
  period: string;
  title: string;
  description: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamHighlightInput {
  period: string;
  title: string;
  description: string;
}

export type UpdateTeamHighlightInput = Partial<CreateTeamHighlightInput>;
