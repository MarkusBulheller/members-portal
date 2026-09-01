/** All but MANUAL are auto-awarded from race results via the "Recalculate" admin action; MANUAL
 * tiers are always awarded by hand. TRACK_WIN is additionally scoped to one specific track — see
 * AchievementDefinition.trackId. */
export type AchievementMetric =
  | 'LAPS'
  | 'WINS'
  | 'PODIUMS'
  | 'DISTINCT_CARS_RACED'
  | 'DISTINCT_CARS_WON'
  | 'TRACK_WIN'
  | 'MANUAL';

/** Purely presentational — see components/AchievementIcon.tsx for the actual artwork. Keep in
 * sync with members-backend's AchievementIcon enum. */
export type AchievementIcon =
  | 'TROPHY'
  | 'FLAG'
  | 'MEDAL'
  | 'ODOMETER'
  | 'STOPWATCH'
  | 'WHEEL'
  | 'STAR'
  | 'SHIELD'
  | 'FLAME'
  | 'CROWN'
  | 'WRENCH'
  | 'BOLT';

export interface AchievementTier {
  id: string;
  definitionId: string;
  label: string;
  /** The metric count needed to earn this tier — null for MANUAL definitions. */
  threshold: number | null;
  sortOrder: number;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string | null;
  metric: AchievementMetric;
  icon: AchievementIcon;
  /** Only set (and only meaningful) when metric is TRACK_WIN. */
  trackId: string | null;
  tiers: AchievementTier[];
  createdAt: string;
  updatedAt: string;
}

export interface AchievementAward {
  id: string;
  driverProfileId: string;
  tierId: string;
  tier: AchievementTier & { definition: AchievementDefinition };
  eventId: string | null;
  achievedAt: string;
  createdAt: string;
}

export interface TierInput {
  /** Present only when editing an existing tier — omit for a brand new one. */
  id?: string;
  label: string;
  /** Required unless the definition's metric is MANUAL. */
  threshold?: number;
}

export interface CreateAchievementDefinitionInput {
  name: string;
  description?: string;
  metric: AchievementMetric;
  icon?: AchievementIcon;
  /** Required when metric is TRACK_WIN. */
  trackId?: string;
  tiers: TierInput[];
}

export type UpdateAchievementDefinitionInput = Partial<CreateAchievementDefinitionInput>;

export interface CreateAchievementAwardInput {
  driverProfileId: string;
  tierId: string;
  eventId?: string;
  achievedAt?: string;
}
