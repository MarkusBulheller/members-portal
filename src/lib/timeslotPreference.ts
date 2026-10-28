import type { EventTimeslot } from '../types/event';

const byStart = (a: EventTimeslot, b: EventTimeslot) => a.startsAt.localeCompare(b.startsAt);

/** A signup's chosen start times in preference order (most preferred first). Ids in
 * `preference` that aren't chosen are ignored; chosen slots missing from it follow
 * chronologically. A never-ranked signup (`null`) is therefore simply chronological. */
export function rankTimeslots(
  timeslots: readonly EventTimeslot[],
  preference: readonly string[] | null | undefined,
): EventTimeslot[] {
  const rest = [...timeslots].sort(byStart);
  const ranked: EventTimeslot[] = [];
  for (const id of preference ?? []) {
    const index = rest.findIndex((slot) => slot.id === id);
    if (index !== -1) ranked.push(...rest.splice(index, 1));
  }
  return [...ranked, ...rest];
}

/** "1st", "2nd", "3rd", "4th" … */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
