import { useEffect, useState } from 'react';
import WeatherForecastChart from './WeatherForecastChart';
import { ApiError } from '../lib/api';
import { iracingSeriesApi } from '../lib/api/iracingSeries';
import { summarizeRaceWeek, type RaceWeekSummary } from '../lib/iracingWeather';
import { buildForecastTiles } from '../lib/weatherForecastTiles';
import type { WeatherForecastPoint } from '../types/iracingWeatherForecast';

/** Weather section for an event linked to an iRacing series-season week (Event.iracingSeasonId /
 * iracingRaceWeekNum) — same data sources as SeriesDetailPage's per-week forecast, just fetched
 * eagerly for one specific week instead of lazily per expanded row. */
export default function EventWeatherForecast({
  seasonId,
  raceWeekNum,
}: {
  seasonId: number;
  raceWeekNum: number;
}) {
  const [seriesLabel, setSeriesLabel] = useState<string | null>(null);
  const [weekSummary, setWeekSummary] = useState<RaceWeekSummary | null>(null);
  const [points, setPoints] = useState<WeatherForecastPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSeriesLabel(null);
    setWeekSummary(null);
    setPoints(null);

    // Just this one season (name + the week's summary) — not the whole series catalog. A failure
    // there only drops the label/summary; the forecast itself is what the section is for.
    void Promise.all([
      iracingSeriesApi.getById(seasonId).catch(() => null),
      iracingSeriesApi.getWeatherForecast(seasonId, raceWeekNum),
    ])
      .then(([season, forecast]) => {
        if (cancelled) return;
        setSeriesLabel(season ? [season.seriesName, season.seasonName].filter(Boolean).join(' — ') : null);
        const entry = season?.schedule.find((e) => (e as Record<string, unknown>)?.race_week_num === raceWeekNum);
        if (entry) setWeekSummary(summarizeRaceWeek(entry));
        setPoints(forecast);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load weather forecast');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seasonId, raceWeekNum]);

  if (loading) return <p className="m-0 text-xs text-ds-muted">Loading weather forecast...</p>;
  if (error) return <p className="m-0 text-xs text-ds-danger">{error}</p>;

  const tiles = points ? buildForecastTiles(points) : [];
  const firstSimTime = tiles[0]?.simTime ?? null;

  return (
    <div className="flex flex-col gap-3">
      {tiles.length > 0 && (
        <>
          <ul className="m-0 grid list-none grid-cols-3 gap-1 p-0 text-center min-[420px]:grid-cols-6">
            {tiles.map((tile, i) => (
              <li
                key={i}
                aria-label={`${tile.hourLabel}: ${tile.temperatureC} degrees, ${tile.rainPercent} percent chance of rain`}
                className="cut-xs flex flex-col items-center gap-0.5 bg-ds-field pb-2 pt-2.5"
              >
                <span aria-hidden="true" className="text-[11px] font-semibold text-ds-dim">
                  {tile.hourLabel}
                </span>
                <span aria-hidden="true" className="num text-lg leading-[1.2]">
                  {tile.temperatureC}°
                </span>
                <span
                  aria-hidden="true"
                  className={`text-[11px] font-bold tabular-nums ${
                    tile.rainPercent >= 30
                      ? 'text-[#7dd3fc] [:root[data-theme=light]_&]:text-[#0369a1]'
                      : 'text-ds-muted'
                  }`}
                >
                  {tile.rainPercent}%
                </span>
              </li>
            ))}
          </ul>
          <span className="text-xs text-ds-muted">
            {firstSimTime ? `Sim time from ${firstSimTime} · ` : ''}rain chance under each hour
          </span>
        </>
      )}
      {seriesLabel && <p className="m-0 text-xs text-ds-muted">{seriesLabel}</p>}
      {weekSummary && (
        <div>
          <p className="m-0 text-sm text-ds-ink">{weekSummary.weatherSummary}</p>
          {weekSummary.weatherDetails.length > 0 && (
            <p className="m-0 mt-0.5 text-xs text-ds-muted">{weekSummary.weatherDetails.join(' · ')}</p>
          )}
        </div>
      )}
      {points && points.length > 0 && <WeatherForecastChart points={points} />}
    </div>
  );
}
