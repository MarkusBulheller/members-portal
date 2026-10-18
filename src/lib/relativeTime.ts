const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Short date as on the design boards: "3 Oct", or "3 Oct 2025" when it isn't this year. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "Mar 2024". */
export function monthYear(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Relative timestamp as on the design boards: "just now", "2 hours ago", "yesterday", then "3 Oct".
 *  Future timestamps (clock skew) fall back to the short date. `capitalize` upper-cases the first
 *  letter for list cells ("Yesterday"). */
export function relativeTime(iso: string, opts: { capitalize?: boolean; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  let text: string;
  if (Number.isNaN(diffMs) || diffMs < 0) {
    text = Number.isNaN(diffMs) ? '' : shortDate(iso, now);
  } else if (diffMs < 60_000) {
    text = 'just now';
  } else if (diffMs < 3_600_000) {
    const m = Math.floor(diffMs / 60_000);
    text = `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffMs < 86_400_000) {
    const h = Math.floor(diffMs / 3_600_000);
    text = `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  } else if (Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000) === 1) {
    text = 'yesterday';
  } else {
    text = shortDate(iso, now);
  }
  return opts.capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
