import type { SignupStatus } from '../types/event';

export const SIGNUP_STATUS_STYLES: Record<SignupStatus, string> = {
  CONFIRMED: 'bg-w2w-red/15 text-w2w-red',
  WAITLISTED: 'bg-white/10 text-white/60',
  CANCELLED: 'bg-white/5 text-white/65 line-through',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local 24-hour wall-clock time, "HH:MM" ("09:00", "23:59"). Built by hand rather than via
 * Intl so the output never depends on the browser's locale or hour cycle. */
export function formatClock(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Local short date, "Sat 31 Oct" (weekday day month). Locale-independent, like formatClock. */
export function formatDayShort(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Local short date + 24-hour time, "Tue 27 Oct · 23:59". */
export function formatDayTime(value: string | Date): string {
  return `${formatDayShort(value)} · ${formatClock(value)}`;
}

/** A start time as a single label, "Sat 31 Oct · 17:00". */
export function formatSlot(iso: string): string {
  return formatDayTime(iso);
}

/** The on-the-hour ISO timestamps spanning a timeslot's race window — used as absolute keys
 * into EventSignup.availableHours so the same real-world hour lines up across every timeslot's
 * grid, rather than matching by column position. Rounds up to a whole number of hour-buckets for
 * non-whole-hour lengths (e.g. 2h40m gets 3 buckets: 0-1, 1-2, 2-2:40) — the final bucket just
 * covers a partial hour, still a meaningful "can you drive the last stretch" choice. */
export function hoursForSlot(startsAtIso: string, raceLengthMinutes: number): string[] {
  const start = new Date(startsAtIso).getTime();
  const hourCount = Math.ceil(raceLengthMinutes / 60);
  return Array.from({ length: hourCount }, (_, h) => new Date(start + h * 3_600_000).toISOString());
}

const HOUR_MS = 3_600_000;

/** Local 24-hour wall-clock label for an hour column ("17:00"). When daylight saving ends the
 * clocks repeat an hour, so a long race can contain two genuinely different hours that read the
 * same (e.g. 02:30 twice) — in that case both get the timezone name appended (02:30 CEST /
 * 02:30 CET) so they can be told apart. Every other hour stays a plain "HH:MM". */
export function formatHour(iso: string): string {
  const cached = hourLabelCache.get(iso);
  if (cached !== undefined) return cached;
  const label = computeHourLabel(iso);
  // Bounded: hour columns are re-used across renders, so a small cache is enough; reset when full.
  if (hourLabelCache.size >= HOUR_LABEL_CACHE_MAX) hourLabelCache.clear();
  hourLabelCache.set(iso, label);
  return label;
}

const HOUR_LABEL_CACHE_MAX = 2000;
const hourLabelCache = new Map<string, string>();
let zoneNameFormat: Intl.DateTimeFormat | null = null;

function computeHourLabel(iso: string): string {
  const date = new Date(iso);
  const label = formatClock(date);
  const repeatsAnHourAway = [-HOUR_MS, HOUR_MS].some(
    (offset) => formatClock(new Date(date.getTime() + offset)) === label,
  );
  if (!repeatsAnHourAway) return label;
  zoneNameFormat ??= new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' });
  const zone = zoneNameFormat
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  return zone ? `${label} ${zone}` : label;
}

const LAP_TIME_PATTERN = /^(\d{1,2}):([0-5]\d)(?:\.(\d{1,3}))?$/;

/** Parses a "mm:ss.ms" lap time (e.g. "01:34.568") into total seconds — null for anything that
 * doesn't match, including an empty string (used to clear a lap time back to unset). */
export function parseLapTimeToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const match = LAP_TIME_PATTERN.exec(trimmed);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const msFraction = match[3] ? Number(match[3].padEnd(3, '0')) / 1000 : 0;
  return minutes * 60 + seconds + msFraction;
}

/** Inverse of parseLapTimeToSeconds — works in integer milliseconds throughout so a value like
 * 94.9996 can't round-trip into an invalid "ss.1000". */
export function formatSecondsAsLapTime(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '';
  const totalMs = Math.round(totalSeconds * 1000);
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
