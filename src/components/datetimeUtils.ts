/** Pure helpers shared by DateField / TimeField / DateTimeField and their popover. Everything here is
 * local wall-clock arithmetic with the same string formats the native inputs use:
 *   date      "YYYY-MM-DD"
 *   time      "HH:mm"
 *   datetime  "YYYY-MM-DDTHH:mm"
 * Names and formats are hand-built (like lib/eventFormatting) so nothing depends on the browser's
 * locale, hour cycle or Intl. */

export type PickerMode = 'date' | 'time' | 'datetime';

/** Calendar day; `m` is 1-12 (not the JS 0-11). */
export interface Ymd {
  y: number;
  m: number;
  d: number;
}
export interface Hm {
  h: number;
  mi: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export const WEEKDAYS_SHORT_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // indexed by Date#getDay
export const WEEKDAYS_LONG_SUN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday-first column headers. */
export const WEEKDAYS_SHORT_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG_MON = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
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

/** What a day / time gets when the user picks the other half first (or types a date with no time). */
export const DEFAULT_TIME: Hm = { h: 12, mi: 0 };

/* ------------------------------------------------------------------ calendar maths */

export const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

export function isValidYmd(y: number, m: number, d: number): boolean {
  return y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export const ymdKey = ({ y, m, d }: Ymd) => `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;

const YMD_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
export function parseYmdKey(s: string): Ymd | null {
  const match = YMD_KEY.exec(s);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return isValidYmd(y, m, d) ? { y, m, d } : null;
}

/** 0 = Monday .. 6 = Sunday. */
export const weekdayMon = ({ y, m, d }: Ymd) => (new Date(y, m - 1, d).getDay() + 6) % 7;

export function addDays({ y, m, d }: Ymd, n: number): Ymd {
  const date = new Date(y, m - 1, d + n);
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

/** Same day-of-month `n` months away, clamped to the target month's length (31 Jan + 1 = 28/29 Feb). */
export function addMonths({ y, m, d }: Ymd, n: number): Ymd {
  const index = y * 12 + (m - 1) + n;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
}

export const compareYmd = (a: Ymd, b: Ymd) => (a.y - b.y) * 10000 + (a.m - b.m) * 100 + (a.d - b.d);

export function todayYmd(): Ymd {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

export function clampYmd(day: Ymd, min: Ymd | null, max: Ymd | null): Ymd {
  if (min && compareYmd(day, min) < 0) return min;
  if (max && compareYmd(day, max) > 0) return max;
  return day;
}

export interface DayCell extends Ymd {
  key: string;
  inMonth: boolean;
  /** "Saturday 24 October 2026" */
  label: string;
}

/** Fixed 6x7 Monday-first grid for the month (always 42 cells so the popover never changes height). */
export function buildMonthCells(y: number, m: number): DayCell[] {
  const first: Ymd = { y, m, d: 1 };
  const start = addDays(first, -weekdayMon(first));
  return Array.from({ length: 42 }, (_, i) => {
    const day = addDays(start, i);
    return {
      ...day,
      key: ymdKey(day),
      inMonth: day.m === m && day.y === y,
      label: `${WEEKDAYS_LONG_MON[weekdayMon(day)]} ${day.d} ${MONTHS_LONG[day.m - 1]} ${day.y}`,
    };
  });
}

/* ------------------------------------------------------------------ value strings */

export const hmKey = ({ h, mi }: Hm) => `${pad2(h)}:${pad2(mi)}`;

const HM_KEY = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
export function parseHmKey(s: string): Hm | null {
  const match = HM_KEY.exec(s);
  if (!match) return null;
  const [h, mi] = [Number(match[1]), Number(match[2])];
  return h <= 23 && mi <= 59 ? { h, mi } : null;
}

export function splitValue(mode: PickerMode, value: string): { date: Ymd | null; time: Hm | null } {
  if (mode === 'date') return { date: parseYmdKey(value), time: null };
  if (mode === 'time') return { date: null, time: parseHmKey(value) };
  const match = /^(\d{4}-\d{2}-\d{2})[T ](.+)$/.exec(value);
  if (!match) return { date: null, time: null };
  const date = parseYmdKey(match[1]);
  const time = parseHmKey(match[2]);
  return date && time ? { date, time } : { date: null, time: null };
}

export function joinValue(mode: PickerMode, date: Ymd | null, time: Hm | null): string {
  if (mode === 'date') return date ? ymdKey(date) : '';
  if (mode === 'time') return time ? hmKey(time) : '';
  return date && time ? `${ymdKey(date)}T${hmKey(time)}` : '';
}

/** The canonical string for a value, or '' when it isn't a valid one (e.g. seconds are dropped). */
export function normalizeValue(mode: PickerMode, value: string): string {
  const { date, time } = splitValue(mode, value);
  return joinValue(mode, date, time);
}

/** min / max in the field's own format; a bound given in another format is reduced to it, an invalid one dropped. */
export function normalizeBound(mode: PickerMode, bound: string | undefined): string {
  if (!bound) return '';
  if (mode === 'date') return joinValue('date', parseYmdKey(bound.slice(0, 10)), null);
  if (mode === 'time') return normalizeValue('time', bound.includes('T') ? bound.slice(bound.indexOf('T') + 1) : bound);
  return normalizeValue('datetime', bound);
}

/** Dates are compared as strings: the fixed-width formats sort chronologically. */
export function clampValue(value: string, min: string, max: string): string {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

export function inRange(value: string, min: string, max: string): boolean {
  return clampValue(value, min, max) === value;
}

/* ------------------------------------------------------------------ display + lenient text parsing */

/** "Sat 24 Oct 2026" */
export function formatDate(day: Ymd): string {
  return `${WEEKDAYS_SHORT_SUN[new Date(day.y, day.m - 1, day.d).getDay()]} ${day.d} ${MONTHS_SHORT[day.m - 1]} ${day.y}`;
}

/** "Sat 24 Oct 2026 · 13:00", "Sat 24 Oct 2026" or "13:00" — '' for an empty/invalid value. */
export function formatDisplay(mode: PickerMode, value: string): string {
  const { date, time } = splitValue(mode, value);
  if (mode === 'date') return date ? formatDate(date) : '';
  if (mode === 'time') return time ? hmKey(time) : '';
  return date && time ? `${formatDate(date)} · ${hmKey(time)}` : '';
}

const MONTH_BY_NAME = new Map(MONTHS_LONG.map((name, i) => [name.slice(0, 3).toLowerCase(), i + 1]));
const WEEKDAY_NAMES = new Set(WEEKDAYS_LONG_SUN.map((name) => name.slice(0, 3).toLowerCase()));

function makeYmd(y: number, m: number, d: number): Ymd | null {
  return isValidYmd(y, m, d) ? { y, m, d } : null;
}

const fullYear = (text: string) => (text.length === 2 ? 2000 + Number(text) : Number(text));

/** "24.10.2026", "24/10/2026", "24-10-26", "2026-10-24", "24 Oct 2026", "Sat 24 October 2026", "Oct 24 2026". */
export function parseDateText(raw: string): Ymd | null {
  let s = raw.trim().replace(/\s+/g, ' ');
  // Drop a leading weekday name ("Sat 24 Oct 2026", "Saturday, 24.10.2026").
  s = s.replace(/^([A-Za-z]{3,9})\.?,?\s+(?=\d)/, (all, word: string) =>
    WEEKDAY_NAMES.has(word.slice(0, 3).toLowerCase()) ? '' : all,
  );

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (match) return makeYmd(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4}|\d{2})$/.exec(s);
  if (match) return makeYmd(fullYear(match[3]), Number(match[2]), Number(match[1]));

  match = /^(\d{1,2})(?:st|nd|rd|th)?[-/. ]+([A-Za-z]{3,9})\.?,?[-/. ]+(\d{4}|\d{2})$/.exec(s);
  if (match) {
    const month = MONTH_BY_NAME.get(match[2].slice(0, 3).toLowerCase());
    return month ? makeYmd(fullYear(match[3]), month, Number(match[1])) : null;
  }

  match = /^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(s);
  if (match) {
    const month = MONTH_BY_NAME.get(match[1].slice(0, 3).toLowerCase());
    return month ? makeYmd(Number(match[3]), month, Number(match[2])) : null;
  }
  return null;
}

/** "13:00", "13.00", "1300", "930", "9:30", "13" (-> 13:00). 24-hour only. */
export function parseTimeText(raw: string): Hm | null {
  const s = raw.trim();
  let h: number;
  let mi: number;
  let match = /^(\d{1,2})[:.h](\d{2})$/i.exec(s);
  if (match) {
    h = Number(match[1]);
    mi = Number(match[2]);
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(s))) {
    h = Number(match[1]);
    mi = Number(match[2]);
  } else if ((match = /^(\d{1,2})$/.exec(s))) {
    h = Number(match[1]);
    mi = 0;
  } else {
    return null;
  }
  return h <= 23 && mi <= 59 ? { h, mi } : null;
}

/** Parses what a user typed into the field for `mode`; returns the canonical value string, or null when
 * it can't be understood. `current` supplies the time to keep when a datetime field is given only a date. */
export function parseText(mode: PickerMode, raw: string, current: string): string | null {
  if (mode === 'date') {
    const date = parseDateText(raw);
    return date ? ymdKey(date) : null;
  }
  if (mode === 'time') {
    const time = parseTimeText(raw);
    return time ? hmKey(time) : null;
  }

  const s = raw
    .trim()
    .replace(/\s*[·@]\s*/g, ' ')
    .replace(/^(\d{4}-\d{1,2}-\d{1,2})T/, '$1 ')
    .replace(/\s+/g, ' ');
  const fallback = splitValue('datetime', current).time ?? DEFAULT_TIME;

  const dateOnly = parseDateText(s);
  if (dateOnly) return joinValue('datetime', dateOnly, fallback);

  const cut = s.lastIndexOf(' ');
  if (cut <= 0) return null;
  const date = parseDateText(s.slice(0, cut));
  const time = parseTimeText(s.slice(cut + 1));
  return date && time ? joinValue('datetime', date, time) : null;
}
