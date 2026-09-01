import type { SignupStatus } from '../types/event';

export const SIGNUP_STATUS_STYLES: Record<SignupStatus, string> = {
  CONFIRMED: 'bg-w2w-red/15 text-w2w-red',
  WAITLISTED: 'bg-white/10 text-white/60',
  CANCELLED: 'bg-white/5 text-white/65 line-through',
};

export function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

export function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
