export interface EventTeamDriverSettings {
  id: string;
  eventTeamId: string;
  userId: string;
  /** Decimal columns, come back as strings — same convention as EventTeam's own settings. */
  lapTimeDrySeconds: string | null;
  lapTimeWetSeconds: string | null;
  fuelUsagePerLapLiters: string | null;
  /** This driver's own fuel saving in percent, replacing the team's; null = follow the team. */
  fuelSavePercent: string | null;
}

export interface UpsertEventTeamDriverSettingsInput {
  lapTimeDrySeconds?: number | null;
  lapTimeWetSeconds?: number | null;
  fuelUsagePerLapLiters?: number | null;
  fuelSavePercent?: number | null;
}
