/** Pure helpers for the team plan page's header clock tile and summary row. */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Countdown text: "9d 02:14" (days, hours:minutes) from a day out, "02:14:09" inside the last
 * day. Negative input clamps to zero. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Elapsed race time as "HH:MM:SS" (hours keep growing past 99 rather than wrapping). */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(totalSeconds % 60)}`;
}

export type RacePhase = 'before' | 'live' | 'finished';

export function racePhase(nowMs: number, raceStartMs: number, raceEndMs: number): RacePhase {
  if (nowMs < raceStartMs) return 'before';
  return nowMs < raceEndMs ? 'live' : 'finished';
}

export interface ClockRow {
  startMs: number | null;
  durationMinutes: number;
  driverLabel: string | null;
}

/** Which stint is "current" at `nowMs` — the one whose window contains it, or, during a pit stop
 * (between two windows), the one that just finished. -1 before the first stint starts. */
export function currentStintIndex(rows: ClockRow[], nowMs: number): number {
  let current = -1;
  rows.forEach((row, index) => {
    if (row.startMs !== null && nowMs >= row.startMs) current = index;
  });
  return current;
}

/** "Stint 4 · Jonas K. · Markus up next" — the live clock tile's sub line. */
export function liveClockSubline(rows: ClockRow[], nowMs: number): string {
  const index = currentStintIndex(rows, nowMs);
  if (index === -1) return 'Waiting for the first stint';
  const driver = rows[index].driverLabel ?? 'Unassigned';
  const next = rows[index + 1];
  return `Stint ${index + 1} · ${driver}${next ? ` · ${next.driverLabel ?? 'Unassigned'} up next` : ' · final stint'}`;
}

const HOUR_MS = 3_600_000;

/** Whether any stint overlaps the one-hour bucket starting at `hourStartMs`. */
export function isDrivingInHour(stints: { startMs: number; endMs: number }[], hourStartMs: number): boolean {
  return stints.some((s) => s.startMs < hourStartMs + HOUR_MS && s.endMs > hourStartMs);
}

/** `text-*` colour class matching a driverColors.ts `dot` class, for outlining a driver's stint
 * hours in their own colour (via `currentColor`). Full class names so Tailwind picks them up. */
const OUTLINE_BY_DOT: Record<string, string> = {
  'bg-blue-500': 'text-blue-500',
  'bg-emerald-500': 'text-emerald-500',
  'bg-amber-500': 'text-amber-500',
  'bg-red-500': 'text-red-500',
  'bg-purple-500': 'text-purple-500',
  'bg-cyan-500': 'text-cyan-500',
  'bg-pink-500': 'text-pink-500',
  'bg-lime-500': 'text-lime-500',
};

export function outlineClassForDot(dotClass: string): string {
  return OUTLINE_BY_DOT[dotClass] ?? 'text-ds-ink';
}
