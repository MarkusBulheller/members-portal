/** Parsing of iRacing's raw schedule/weather JSON — field names confirmed against a live
 * /series/season_schedule sample (not guessed): each week's `weather` object carries a nested
 * `weather_summary` with the actual precip chance / temp range / wind range for that race week,
 * which is the real "forecast at a glance" — the top-level weather.skies/temp_value fields are
 * just a single point-in-time reading and are only used as a fallback. */

const SKIES_LABELS = ['Clear', 'Partly Cloudy', 'Mostly Cloudy', 'Overcast'];

interface RaceWeekLike {
  race_week_num?: number;
  raceWeekNum?: number;
  start_date?: string;
  startDate?: string;
  track?: { track_name?: string; config_name?: string | null };
  weather?: unknown;
  [key: string]: unknown;
}

interface WeatherSummaryLike {
  precip_chance?: number;
  max_precip_rate_desc?: string;
  skies_high?: number;
  skies_low?: number;
  temp_high?: number;
  temp_low?: number;
  temp_units?: number;
  wind_high?: number;
  wind_low?: number;
  wind_units?: number;
}

interface WeatherLike {
  weather_summary?: WeatherSummaryLike;
  skies?: number;
  temp_value?: number;
  temp_units?: number;
  wind_value?: number;
  wind_units?: number;
  allow_fog?: boolean;
  [key: string]: unknown;
}

export interface RaceWeekSummary {
  raceWeekNum: number | null;
  startDate: string | null;
  trackName: string;
  weatherSummary: string;
  weatherDetails: string[];
}

export function summarizeRaceWeek(entry: unknown): RaceWeekSummary {
  const week = (entry ?? {}) as RaceWeekLike;
  const track = week.track;
  const trackName = [track?.track_name, track?.config_name].filter(Boolean).join(' — ') || 'Unknown track';

  const { summary, details } = describeWeather(week.weather);

  return {
    raceWeekNum: typeof week.race_week_num === 'number' ? week.race_week_num : (week.raceWeekNum ?? null),
    startDate: typeof week.start_date === 'string' ? week.start_date : (week.startDate ?? null),
    trackName,
    weatherSummary: summary,
    weatherDetails: details,
  };
}

function skiesLabel(low: number | null, high: number | null): string | null {
  if (low === null) return null;
  const lowLabel = SKIES_LABELS[low] ?? `Skies ${low}`;
  if (high === null || high === low) return lowLabel;
  return `${lowLabel} – ${SKIES_LABELS[high] ?? high}`;
}

function describeWeather(weather: unknown): { summary: string; details: string[] } {
  if (!weather || typeof weather !== 'object') {
    return { summary: 'Weather unavailable', details: [] };
  }
  const w = weather as WeatherLike;
  const s = w.weather_summary ?? {};
  const details: string[] = [];

  const skiesLow = typeof s.skies_low === 'number' ? s.skies_low : (typeof w.skies === 'number' ? w.skies : null);
  const skiesHigh = typeof s.skies_high === 'number' ? s.skies_high : skiesLow;
  const skies = skiesLabel(skiesLow, skiesHigh);

  const tempUnit = s.temp_units === 1 || w.temp_units === 1 ? '°C' : '°F';
  let temp: string | null = null;
  if (typeof s.temp_low === 'number' && typeof s.temp_high === 'number') {
    temp =
      s.temp_low === s.temp_high
        ? `${Math.round(s.temp_low)}${tempUnit}`
        : `${Math.round(s.temp_low)}–${Math.round(s.temp_high)}${tempUnit}`;
  } else if (typeof w.temp_value === 'number') {
    temp = `${w.temp_value}${tempUnit}`;
  }

  // Always surface rain chance, even at 0% — it's the field most likely to change race strategy.
  const rain = typeof s.precip_chance === 'number' ? `${s.precip_chance}% rain` : null;

  const summary = [skies, temp, rain].filter(Boolean).join(', ') || 'Weather unavailable';

  if (s.max_precip_rate_desc && s.max_precip_rate_desc !== 'None') {
    details.push(`Rain intensity: ${s.max_precip_rate_desc}`);
  }

  const windUnit = s.wind_units === 1 || w.wind_units === 1 ? 'km/h' : 'mph';
  if (typeof s.wind_low === 'number' && typeof s.wind_high === 'number') {
    details.push(
      s.wind_low === s.wind_high
        ? `Wind: ${Math.round(s.wind_low)} ${windUnit}`
        : `Wind: ${Math.round(s.wind_low)}–${Math.round(s.wind_high)} ${windUnit}`,
    );
  } else if (typeof w.wind_value === 'number') {
    details.push(`Wind: ${w.wind_value} ${windUnit}`);
  }

  if (w.allow_fog) {
    details.push('Fog possible');
  }

  return { summary, details };
}
