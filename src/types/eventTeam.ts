export interface EventTeam {
  id: string;
  eventId: string;
  name: string;
  carId: string | null;
  iracingTeamId: number | null;
  /** Which of the event's candidate start times this crew has committed to racing — a team plans
   * one specific stint schedule, unlike EventSignup.timeslots (a driver can flag several options
   * before teams are built). */
  timeslotId: string | null;
  /** Race-planning settings for this crew's stint strategy — decimal columns come back as
   * strings (same convention as Car.tankCapacityLiters / CarTrackSetup.fuelPerLapLiters), null
   * until filled in on the team's planning page. */
  refuelDurationSeconds: string | null;
  tyreChangeDurationSeconds: string | null;
  pitstopDrivethroughSeconds: string | null;
  lapTimeDrySeconds: string | null;
  lapTimeWetSeconds: string | null;
  fuelUsagePerLapLiters: string | null;
  /** Minutes between the timeslot's own startsAt and the actual green flag — a practice +
   * qualifying block ahead of the race pushes the real start later than the timeslot alone
   * suggests. */
  raceStartOffsetMinutes: string | null;
  /** Fuel burned on the formation lap, in liters — comes off the first stint's usable tank only. */
  formationLapFuelLiters: string | null;
  /** In-game clock time ("HH:MM") this crew's first stint starts at — iRacing sessions can be
   * configured to start at any sim time-of-day regardless of the real-world green-flag time. */
  simStartTimeOfDay: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventTeamSettingsInput {
  refuelDurationSeconds?: number | null;
  tyreChangeDurationSeconds?: number | null;
  pitstopDrivethroughSeconds?: number | null;
  lapTimeDrySeconds?: number | null;
  lapTimeWetSeconds?: number | null;
  fuelUsagePerLapLiters?: number | null;
  raceStartOffsetMinutes?: number | null;
  formationLapFuelLiters?: number | null;
}

export interface CreateEventTeamInput extends EventTeamSettingsInput {
  name: string;
  carId?: string | null;
  iracingTeamId?: number | null;
  timeslotId?: string | null;
  simStartTimeOfDay?: string | null;
}

export type UpdateEventTeamInput = Partial<CreateEventTeamInput>;
