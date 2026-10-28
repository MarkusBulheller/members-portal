const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Jan" … "Dec" for a 1-based month; empty for anything out of range. */
export function monthShort(month: number): string {
  return MONTH_SHORT[month - 1] ?? '';
}

export function monthLong(month: number): string {
  return MONTH_LONG[month - 1] ?? '';
}

/** Total driving time as "128h 40m" ("40m" under an hour, "0m" for none/invalid). Hours are never rolled
 * into days, so a season total stays comparable at a glance. */
export function formatHours(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Whole hours, rounded, for the big headline number ("129"). */
export function wholeHours(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 3_600_000) : 0;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "42,310" */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** One decimal, whole numbers stay whole ("4.5", "8"); em dash for null. */
export function formatDecimal(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** "12 Mar 2026" in UTC (the recap year is a UTC year, so dates must not slip across a boundary). */
export function formatRecapDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Mar 12" style without the year, UTC. */
export function formatRecapDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]}`;
}

/** Share of `part` in `total` as a whole percentage, 0 when there is no total. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

/** "w2w-recap-2026-all-teams-podiums.png" style file names. */
export function recapFileName(year: number, teamName: string | null, slug: string): string {
  const team = (teamName ?? 'all-teams').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `w2w-recap-${year}-${team || 'team'}-${slug}.png`;
}
