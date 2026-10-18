export interface SeriesWeekOption {
  weekNum: number; // 0-indexed, matches iRacing's own race_week_num
  startDate: string; // "YYYY-MM-DD"
  trackName: string;
  configName: string | null;
  iracingTrackId: number | null;
  /** iRacing's own week_end_time when the schedule carries it (ISO timestamp), else null. */
  endTime: string | null;
}

export function composedTrackName(week: SeriesWeekOption): string {
  return week.configName ? `${week.trackName} - ${week.configName}` : week.trackName;
}

/** `season.schedule` is an untyped raw jsonb blob straight from iRacing's /series/season_schedule
 * — field names confirmed against live synced data, same defensive-parse approach as
 * lib/iracingWeather.ts's summarizeRaceWeek(). */
export function parseSeriesWeeks(schedule: unknown[]): SeriesWeekOption[] {
  return schedule
    .map((entry): SeriesWeekOption | null => {
      const week = (entry ?? {}) as Record<string, unknown>;
      const track = week.track as Record<string, unknown> | undefined;
      const weekNum = typeof week.race_week_num === 'number' ? week.race_week_num : null;
      const startDate = typeof week.start_date === 'string' ? week.start_date : null;
      if (weekNum === null || !startDate || typeof track?.track_name !== 'string') return null;
      return {
        weekNum,
        startDate,
        trackName: track.track_name,
        configName: typeof track.config_name === 'string' ? track.config_name : null,
        iracingTrackId: typeof track.track_id === 'number' ? track.track_id : null,
        endTime: typeof week.week_end_time === 'string' ? week.week_end_time : null,
      };
    })
    .filter((w): w is SeriesWeekOption => w !== null)
    .sort((a, b) => a.weekNum - b.weekNum);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function weekStartMs(week: SeriesWeekOption): number {
  // start_date is a bare "YYYY-MM-DD" — iRacing's week boundaries are UTC, so read it as UTC.
  return Date.parse(week.startDate.includes('T') ? week.startDate : `${week.startDate}T00:00:00Z`);
}

function weekEndMs(week: SeriesWeekOption): number {
  const end = week.endTime ? Date.parse(week.endTime) : NaN;
  return Number.isNaN(end) ? weekStartMs(week) + 7 * DAY_MS : end;
}

/** The race week running right now (start <= now < end), or null between seasons / in a schedule
 * gap. Same window the backend's car-usage scan uses (IracingCarUsageService.findCurrentRaceWeek). */
export function currentRaceWeekNum(weeks: SeriesWeekOption[], now: Date = new Date()): number | null {
  const t = now.getTime();
  const current = weeks.find((w) => !Number.isNaN(weekStartMs(w)) && t >= weekStartMs(w) && t < weekEndMs(w));
  return current ? current.weekNum : null;
}

/** True once a week has fully ended (used to mark "already raced" weeks). */
export function isPastRaceWeek(week: SeriesWeekOption, now: Date = new Date()): boolean {
  return now.getTime() >= weekEndMs(week);
}
