/** IANA timezone name -> a readable "City (UTC-4)" label — the raw name (e.g.
 * "America/Los_Angeles") is technically correct but not what you want to scan at a glance on the
 * roster. Falls back to the raw name if the browser can't resolve it (shouldn't happen for a
 * timezone the driver picked from Intl.supportedValuesOf('timeZone') in the first place).
 *
 * Constructing an Intl.DateTimeFormat for a zone is slow, and this is called for hundreds of
 * zones per render in the pickers, so formatters are cached per zone and finished labels are
 * cached per zone for the current minute (offsets only change at DST edges). */

const formatters = new Map<string, Intl.DateTimeFormat | null>();
const labels = new Map<string, string>();
let labelsMinute = -1;

function getFormatter(timezone: string): Intl.DateTimeFormat | null {
  let formatter = formatters.get(timezone);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' });
    } catch {
      formatter = null;
    }
    formatters.set(timezone, formatter);
  }
  return formatter;
}

export function formatTimezoneLabel(timezone: string | null): string | null {
  if (!timezone) return null;

  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  if (minute !== labelsMinute) {
    labels.clear();
    labelsMinute = minute;
  }
  const cached = labels.get(timezone);
  if (cached !== undefined) return cached;

  const city = timezone.split('/').pop()?.replace(/_/g, ' ') ?? timezone;
  let label = city;
  const formatter = getFormatter(timezone);
  if (formatter) {
    try {
      const offset = formatter.formatToParts(new Date(now)).find((part) => part.type === 'timeZoneName')?.value;
      if (offset) label = `${city} (${offset.replace('GMT', 'UTC')})`;
    } catch {
      // keep the plain city name
    }
  }
  labels.set(timezone, label);
  return label;
}

/** Fallback for browsers without Intl.supportedValuesOf (Safari < 15.4, older Firefox): the
 * common zones, enough to pick from. */
const FALLBACK_TIMEZONES = [
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago',
  'America/Denver', 'America/Halifax', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
  'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo', 'America/St_Johns', 'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Manila', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Tehran', 'Asia/Tokyo',
  'Atlantic/Azores', 'Atlantic/Reykjavik',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Dublin',
  'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid',
  'Europe/Moscow', 'Europe/Oslo', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/Stockholm',
  'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Honolulu',
  'UTC',
];

let allTimezones: string[] | null = null;

/** Every IANA zone the browser knows, sorted. Computed lazily on first use (not at module load). */
export function getAllTimezones(): string[] {
  if (allTimezones) return allTimezones;
  let zones: string[];
  try {
    const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    zones = typeof supportedValuesOf === 'function' ? [...supportedValuesOf.call(Intl, 'timeZone')] : [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = [...FALLBACK_TIMEZONES];
  allTimezones = zones.sort();
  return allTimezones;
}
