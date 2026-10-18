export interface TeamHighlight {
  id: string;
  period: string;
  title: string;
  description: string;
  /** Finishing position (1 = win) for the dashboard's "P#" badge; null when the highlight isn't a
   * race result. Optional so payloads from before the column existed still type-check. */
  position?: number | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamHighlightInput {
  period: string;
  title: string;
  description: string;
  /** undefined = leave unchanged (update) / none (create), null = clear, number = set. */
  position?: number | null;
}

export type UpdateTeamHighlightInput = Partial<CreateTeamHighlightInput>;
