export interface EventTeamStint {
  id: string;
  eventTeamId: string;
  order: number;
  driverUserId: string | null;
  /** Decimal column, comes back as a string — see EventTeam's own settings fields. */
  durationMinutes: string | null;
  /** Whether tyres get changed during the pit stop before this stint — ignored for the first
   * stint (there's no pit stop before the race starts). */
  tyreChange: boolean;
  /** Tyres changed in the pit stop before this stint (0-4, LMU's per-tyre budget). Null on rows
   * that predate the column — read as 4 when tyreChange is true, else 0 (see lib/tyres.ts). The
   * backend keeps tyreChange === (tyresChanged > 0) whenever this is written. */
  tyresChanged: number | null;
  /** Set via the "Start Now" button — a real recorded moment this stint actually began, which
   * re-anchors every later stint's derived schedule to reality. Null until then. */
  actualStartAt: string | null;
  /** Manual wet/dry override — null leaves it to the weather-forecast auto-detect; true/false
   * forces wet/dry regardless of forecast. */
  wetOverride: boolean | null;
}

export interface CreateEventTeamStintInput {
  driverUserId?: string | null;
  durationMinutes?: number | null;
  tyreChange?: boolean;
  /** 0-4; wins over tyreChange when both are sent. */
  tyresChanged?: number;
  wetOverride?: boolean | null;
}

export type UpdateEventTeamStintInput = Partial<CreateEventTeamStintInput>;
