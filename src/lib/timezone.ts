/** IANA timezone name -> a readable "City (UTC-4)" label — the raw name (e.g.
 * "America/Los_Angeles") is technically correct but not what you want to scan at a glance on the
 * roster. Falls back to the raw name if the browser can't resolve it (shouldn't happen for a
 * timezone the driver picked from Intl.supportedValuesOf('timeZone') in the first place). */
export function formatTimezoneLabel(timezone: string | null): string | null {
  if (!timezone) return null;
  const city = timezone.split('/').pop()?.replace(/_/g, ' ') ?? timezone;
  try {
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;
    return offset ? `${city} (${offset.replace('GMT', 'UTC')})` : city;
  } catch {
    return city;
  }
}
