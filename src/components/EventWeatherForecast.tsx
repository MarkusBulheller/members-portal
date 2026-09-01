import { useEffect, useState } from 'react';
import WeatherForecastChart from './WeatherForecastChart';
import { ApiError } from '../lib/api';
import { iracingSeriesApi } from '../lib/api/iracingSeries';
import { summarizeRaceWeek, type RaceWeekSummary } from '../lib/iracingWeather';
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

    void Promise.all([iracingSeriesApi.list(), iracingSeriesApi.getWeatherForecast(seasonId, raceWeekNum)])
      .then(([seasons, forecast]) => {
        if (cancelled) return;
        const season = seasons.find((s) => s.seasonId === seasonId);
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

  if (loading) return <p className="text-white/65 text-xs">Loading weather forecast...</p>;
  if (error) return <p className="text-w2w-red text-xs">{error}</p>;

  return (
    <div>
      {seriesLabel && (
        <p className="text-white/65 text-xs mb-2">
          {seriesLabel} · Week {raceWeekNum + 1}
        </p>
      )}
      {weekSummary && (
        <div className="mb-3">
          <p className="text-white text-sm">{weekSummary.weatherSummary}</p>
          {weekSummary.weatherDetails.length > 0 && (
            <p className="text-white/65 text-xs mt-0.5">{weekSummary.weatherDetails.join(' · ')}</p>
          )}
        </div>
      )}
      {points && points.length > 0 && <WeatherForecastChart points={points} />}
    </div>
  );
}
