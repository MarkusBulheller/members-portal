/** Fixed preset list, validated identically server-side (see create-event.dto.ts's @IsIn) — kept
 * as a duplicated constant rather than shared code since frontend/backend are separate npm
 * projects (same convention as CAR_CLASSES). Stored in minutes so non-whole-hour lengths like
 * 2h40m are exact, not a lossy fractional-hour value. */
export const RACE_LENGTH_PRESETS = [
  { minutes: 160, label: '2h 40m' },
  { minutes: 180, label: '3h' },
  { minutes: 360, label: '6h' },
  { minutes: 600, label: '10h' },
  { minutes: 720, label: '12h' },
  { minutes: 1440, label: '24h' },
] as const;

export type RaceLengthMinutes = (typeof RACE_LENGTH_PRESETS)[number]['minutes'];

export function formatRaceLength(minutes: number): string {
  const preset = RACE_LENGTH_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
