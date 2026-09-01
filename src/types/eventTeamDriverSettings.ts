export interface EventTeamDriverSettings {
  id: string;
  eventTeamId: string;
  userId: string;
  /** Decimal columns, come back as strings — same convention as EventTeam's own settings. */
  lapTimeDrySeconds: string | null;
  lapTimeWetSeconds: string | null;
  fuelUsagePerLapLiters: string | null;
}

export interface UpsertEventTeamDriverSettingsInput {
  lapTimeDrySeconds?: number | null;
  lapTimeWetSeconds?: number | null;
  fuelUsagePerLapLiters?: number | null;
}
