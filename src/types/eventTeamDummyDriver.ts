/** A named placeholder driver that lives only in one team's stint plan (no portal account). Its
 * `id` doubles as the driver id on stints and per-driver settings, the same slot a real driver's
 * userId fills. An empty `availableHours` means "free for any stint", not "never available". */
export interface EventTeamDummyDriver {
  id: string;
  eventTeamId: string;
  name: string;
  /** The Drivers-roster entry this guest was added from; null for a free-text placeholder. */
  driverProfileId: string | null;
  availableHours: string[];
  createdAt: string;
}
