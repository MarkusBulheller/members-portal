const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "15 Sep" (or "15 Sep 2026" with `withYear`) from either a date-only "YYYY-MM-DD" string (read as
 * that calendar day, no timezone shift) or a full ISO timestamp (shown in the viewer's local day).
 * Fixed 3-letter months — modern ICU renders September as "Sept" in en-GB. Returns '' if unparseable. */
export function formatShortDate(value: string | null | undefined, withYear = false): string {
  if (!value) return '';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  let day: number;
  let month: number;
  let year: number;
  if (dateOnly) {
    year = Number(dateOnly[1]);
    month = Number(dateOnly[2]) - 1;
    day = Number(dateOnly[3]);
  } else {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
  }
  const base = `${day} ${MONTHS_SHORT[month]}`;
  return withYear ? `${base} ${year}` : base;
}
