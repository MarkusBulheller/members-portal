/** Public "Follow the race" data — what the anonymous follow page and the OBS overlay receive.
 * Deliberately small: who drives when, and nothing else (no fuel, tyres, lap times or settings). */

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
  team: { name: string; carName: string | null };
  race: { startsAt: string | null; endsAt: string | null; lengthMinutes: number };
  stints: FollowStint[];
  stintCount: number;
}

export type FollowNamesMode = 'FULL' | 'FIRST' | 'INITIALS';

/** Admin view of a team's public live link. */
export interface FollowLinkSettings {
  enabled: boolean;
  token: string | null;
  namesMode: FollowNamesMode;
}

export interface UpdateFollowLinkInput {
  enabled?: boolean;
  namesMode?: FollowNamesMode;
  /** Issue a new token; the old link stops working immediately. */
  regenerate?: boolean;
}
