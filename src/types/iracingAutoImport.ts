export type AutoImportMode = 'NOTIFY' | 'AUTO';
export type AutoImportRunStatus = 'OK' | 'SKIPPED' | 'ERROR';

export interface AutoImportSettings {
  enabled: boolean;
  /** NOTIFY announces a found result and waits for an admin; AUTO imports it straight away. */
  mode: AutoImportMode;
  /** Minutes to wait after a race ends before importing (5-240). */
  delayMinutes: number;
  /** Discord channel the imported results are announced in (set on the Discord bot tab). */
  resultsChannelId: string | null;
  lastRunAt: string | null;
  lastRunStatus: AutoImportRunStatus | null;
  lastRunMessage: string | null;
  /** Only races that finish after this moment are picked up. */
  enabledSince: string | null;
}

export interface UpdateAutoImportSettingsInput {
  enabled?: boolean;
  mode?: AutoImportMode;
  delayMinutes?: number;
}

export interface AutoImportRunResult {
  status: AutoImportRunStatus;
  message: string;
  found: number;
  imported: number;
}

export type AutoImportAttemptStatus = 'FOUND' | 'IMPORTED' | 'FAILED' | 'IGNORED';

export interface AutoImportAttempt {
  id: string;
  subsessionId: number;
  teamId: number;
  teamName: string;
  seriesName: string | null;
  trackName: string | null;
  carName: string | null;
  startTime: string;
  endTime: string | null;
  finishingPositionInClass: number | null;
  finishingPosition: number | null;
  lapsComplete: number | null;
  status: AutoImportAttemptStatus;
  tries: number;
  lastError: string | null;
  raceResultId: string | null;
  createdAt: string;
}

export interface AutoImportAttemptImportResult {
  attempt: AutoImportAttempt;
  raceResultId: string | null;
}
