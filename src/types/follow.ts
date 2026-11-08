/** "Follow the race" data — what the anonymous follow page and the OBS overlay receive.
 * Through the PUBLIC link it is deliberately small: who drives when, and nothing else (no fuel,
 * tyres, lap times or settings). Only the private strategy link adds `strategy`. */

export type FollowSim = 'IRACING' | 'LMU';

export interface FollowStint {
  number: number;
  /** Already shortened by the backend according to the link's names mode. null = unassigned. */
  driverName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** The crew has pressed "start" on this stint (it is, or has been, on track). */
  started: boolean;
}

export interface FollowState {
  /** Backend clock at response time — the viewer corrects its own clock by the difference. */
  serverNow: string;
  event: { title: string; trackName: string; sim: FollowSim; startsAt: string };
  /** simStartTimeOfDay: in-game clock time ("HH:MM") at the green flag. */
  team: { name: string; carName: string | null; simStartTimeOfDay?: string | null };
  race: { startsAt: string | null; endsAt: string | null; lengthMinutes: number };
  stints: FollowStint[];
  stintCount: number;
  /** Strategy link only: fuel and tyres per stint, and how far the race runs from the plan. */
  strategy?: FollowStrategy;
}

export interface FollowStrategy {
  stints: { number: number; fuelLiters: number | null; tyres: number | null }[];
  /** Seconds the latest started stint began after (+) or before (-) the ORIGINAL plan (the saved
   * baseline), i.e. the time lost so far; null without a baseline or a started stint. */
  driftSeconds: number | null;
}

export type FollowNamesMode = 'FULL' | 'FIRST' | 'INITIALS';

/** Admin view of a team's public live link. */
export interface FollowLinkSettings {
  enabled: boolean;
  token: string | null;
  namesMode: FollowNamesMode;
  /** The private strategy link: the same overlay, with fuel and tyres on top. */
  strategy: { enabled: boolean; token: string | null };
}

export interface UpdateFollowLinkInput {
  enabled?: boolean;
  namesMode?: FollowNamesMode;
  /** Issue a new token; the old link stops working immediately. */
  regenerate?: boolean;
  strategyEnabled?: boolean;
  regenerateStrategy?: boolean;
}

/** What the plan page publishes so the follow page and overlay match it. */
export interface PublishPlanInput {
  stints: { id: string; startsAt: string; endsAt: string; fuelLiters: number | null; tyres: number | null }[];
}

/** The plan as it was before the race: what "vs plan" is measured against. */
export interface PlanBaseline {
  takenAt: string;
  /** AUTO = saved by the plan page at the green flag; MANUAL = saved by hand. */
  source: 'AUTO' | 'MANUAL';
  stints: { id: string; startsAt: string; endsAt: string }[];
}

export interface SavePlanBaselineInput {
  stints: { id: string; startsAt: string; endsAt: string }[];
  source: 'AUTO' | 'MANUAL';
}
