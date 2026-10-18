import type { WeatherForecastPoint } from '../types/iracingWeatherForecast';

export interface ForecastTile {
  /** Short hour label for the tile header, e.g. "10h" (sim wall-clock hour) or "+2h" as a fallback. */
  hourLabel: string;
  /** Rounded air temperature in °C. */
  temperatureC: number;
  /** Rounded chance of rain, 0-100. */
  rainPercent: number;
  /** Sim wall-clock time "HH:mm" of this sample, or null when the timestamp can't be read. */
  simTime: string | null;
}

/** iRacing's `timestamp` is the sim's own wall-clock time; read HH:mm straight off the string
 * (rather than via Date) so the viewer's timezone can't shift it. */
function simClock(timestamp: string): string | null {
  const match = /[T ](\d{2}):(\d{2})/.exec(timestamp);
  return match ? `${match[1]}:${match[2]}` : null;
}

/** The first `count` hourly samples from the session's green flag (time_offset 0) onward, one per
 * hour, for the event page's forecast tiles. air_temp and precip_chance are fixed-point x100 — see
 * types/iracingWeatherForecast.ts. Samples before the start are ignored; when every sample is
 * before the start (shouldn't happen) the earliest ones are used instead of showing nothing. */
export function buildForecastTiles(points: WeatherForecastPoint[], count = 6): ForecastTile[] {
  const sorted = [...points].sort((a, b) => a.time_offset - b.time_offset);
  const fromStart = sorted.filter((p) => p.time_offset >= 0);
  const pool = fromStart.length > 0 ? fromStart : sorted;

  const picked: WeatherForecastPoint[] = [];
  for (const point of pool) {
    const last = picked[picked.length - 1];
    if (!last || point.time_offset - last.time_offset >= 60) picked.push(point);
    if (picked.length === count) break;
  }

  return picked.map((p) => {
    const simTime = simClock(p.timestamp);
    return {
      hourLabel: simTime ? `${simTime.slice(0, 2)}h` : `${p.time_offset >= 0 ? '+' : ''}${Math.round(p.time_offset / 60)}h`,
      temperatureC: Math.round(p.air_temp / 100),
      rainPercent: Math.round(p.precip_chance / 100),
      simTime,
    };
  });
}
