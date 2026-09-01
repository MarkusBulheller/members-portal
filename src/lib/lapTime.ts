/** Formats a lap time in milliseconds as iRacing itself displays it, e.g. "1:32.456" or
 * "58.123" for a sub-minute lap. Null (no time set) renders as an em dash. */
export function formatLapTime(ms: number | null): string {
  if (ms === null) return '—';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const secondsStr = seconds.toFixed(3).padStart(6, '0');
  return minutes > 0 ? `${minutes}:${secondsStr}` : secondsStr;
}

/** Formats a longer wall-clock duration (e.g. a whole race) as "1h 42m" or "38m" — no seconds
 * precision, unlike formatLapTime, since that level of detail isn't useful at race length. */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** iRacing's own start_time/end_time span includes pre-race formation and post-race cooldown,
 * so it never exactly matches the race's advertised length — this snaps the computed duration
 * to whichever standard endurance format it's closest to, for a clean label instead of an odd
 * number like "24h 56m". */
const STANDARD_RACE_LENGTHS_MIN = [160, 180, 360, 720, 1440]; // 2h40m, 3h, 6h, 12h, 24h

export function guessRaceLength(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  const minutes = ms / 60000;
  const closest = STANDARD_RACE_LENGTHS_MIN.reduce((best, candidate) =>
    Math.abs(candidate - minutes) < Math.abs(best - minutes) ? candidate : best,
  );
  return formatDuration(closest * 60000);
}
