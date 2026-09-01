export interface SeriesWeekOption {
  weekNum: number; // 0-indexed, matches iRacing's own race_week_num
  startDate: string; // "YYYY-MM-DD"
  trackName: string;
  configName: string | null;
  iracingTrackId: number | null;
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
      };
    })
    .filter((w): w is SeriesWeekOption => w !== null)
    .sort((a, b) => a.weekNum - b.weekNum);
}
