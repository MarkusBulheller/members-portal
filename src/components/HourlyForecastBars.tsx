import { buildForecastTiles } from '../lib/weatherForecastTiles';
import type { WeatherForecastPoint } from '../types/iracingWeatherForecast';

/** Longest stretch shown — a 24h race is 24 hourly samples. */
const MAX_HOURS = 24;
/** Tallest rain bar, in px (a 100% chance). */
const BAR_MAX_PX = 60;
const RAIN_COLOR = '#38bdf8';

/** Hourly forecast for one race week as the design's bar strip: the air temperature above each
 * hour, a bar whose height is the chance of rain (stronger once it's 50% or more), and the sim
 * hour underneath. Reads the same iRacing forecast points as WeatherForecastChart (temperature
 * and rain chance are fixed-point x100 — see types/iracingWeatherForecast.ts). */
export default function HourlyForecastBars({ points }: { points: WeatherForecastPoint[] }) {
  const hours = buildForecastTiles(points, MAX_HOURS);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap justify-between gap-1.5 text-[13px]">
        <span className="font-bold text-ds-ink">Hourly forecast</span>
        <span className="text-ds-muted">Temp and rain chance, sim time</span>
      </div>
      {hours.length === 0 ? (
        <p className="m-0 text-sm text-ds-muted">No forecast data.</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: hours.length * 30 }}>
            <div
              role="img"
              aria-label={`Hourly forecast: ${hours
                .map((h) => `${h.simTime ?? h.hourLabel} ${h.temperatureC} degrees, ${h.rainPercent}% rain`)
                .join('; ')}`}
              className="grid h-[90px] items-end gap-1 shadow-[inset_0_-1px_0_var(--color-ds-line)]"
              style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
            >
              {hours.map((h) => (
                <div key={`${h.simTime ?? h.hourLabel}`} className="flex h-full flex-col items-center justify-end gap-1">
                  <span className="text-[11px] font-semibold tabular-nums text-ds-ink-soft">
                    {h.temperatureC}°
                  </span>
                  <span
                    title={`${h.simTime ?? h.hourLabel} · ${h.temperatureC}° · ${h.rainPercent}% rain`}
                    className="block w-full"
                    style={{
                      height: Math.max(4, Math.round((h.rainPercent / 100) * BAR_MAX_PX)),
                      background: RAIN_COLOR,
                      opacity: h.rainPercent >= 50 ? 0.9 : 0.45,
                    }}
                  />
                </div>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="mt-1 grid gap-1 text-center text-[11px] font-semibold tabular-nums text-ds-dim"
              style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
            >
              {hours.map((h) => (
                <span key={`${h.simTime ?? h.hourLabel}`}>{h.simTime ? h.simTime.slice(0, 2) : h.hourLabel}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
