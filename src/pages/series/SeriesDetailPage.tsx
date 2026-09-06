import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DriverShareChart from '../../components/DriverShareChart';
import GenerateEventsFromSeriesModal from '../../components/GenerateEventsFromSeriesModal';
import WeatherForecastChart from '../../components/WeatherForecastChart';
import { useAuth } from '../../context/AuthContext';
import { iracingSeriesApi } from '../../lib/api/iracingSeries';
import { ApiError } from '../../lib/api';
import { exportChartsAsPng } from '../../lib/exportChartPng';
import { summarizeRaceWeek } from '../../lib/iracingWeather';
import type { IracingCarUsageStat, IracingSeriesSeason } from '../../types/iracingSeries';
import type { WeatherForecastPoint } from '../../types/iracingWeatherForecast';

// Same validated categorical palette as lib/stints.ts's DRIVER_COLORS (dataviz-skill-checked for
// this app's dark surface) — duplicated rather than imported since that one's keyed to numeric
// cust_ids for race-result charts, a different concern from this page's class/car name keys.
const CATEGORICAL_PALETTE = ['#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** Assigns each distinct key a stable palette slot, sorted alphabetically so the same class/car
 * always lands on the same color across renders regardless of the stats array's own order. */
function assignColors(keys: string[]): Map<string, string> {
  const unique = Array.from(new Set(keys)).sort();
  return new Map(unique.map((k, i) => [k, CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]]));
}

export default function SeriesDetailPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const { user } = useAuth();
  const [season, setSeason] = useState<IracingSeriesSeason | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [forecasts, setForecasts] = useState<Record<number, WeatherForecastPoint[]>>({});
  const [loadingWeek, setLoadingWeek] = useState<number | null>(null);
  const [forecastErrors, setForecastErrors] = useState<Record<number, string>>({});
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [justCreated, setJustCreated] = useState<number | null>(null);
  const [carUsage, setCarUsage] = useState<Record<number, IracingCarUsageStat[]>>({});
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [importSince, setImportSince] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  // Which car-class tab is active per race week — only relevant (and only shown) for a week whose
  // tally actually spans more than one class; a single-class week just renders its flat list.
  const [carUsageClassTab, setCarUsageClassTab] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!seasonId) return;
    void iracingSeriesApi.list().then((all) => {
      setSeason(all.find((s) => String(s.seasonId) === seasonId) ?? null);
    });
  }, [seasonId]);

  function toggleWeek(raceWeekNum: number | null) {
    if (raceWeekNum === null || !season) return;
    if (expandedWeek === raceWeekNum) {
      setExpandedWeek(null);
      return;
    }
    setExpandedWeek(raceWeekNum);
    if (!forecasts[raceWeekNum] && !forecastErrors[raceWeekNum]) {
      setLoadingWeek(raceWeekNum);
      iracingSeriesApi
        .getWeatherForecast(season.seasonId, raceWeekNum)
        .then((points) => setForecasts((prev) => ({ ...prev, [raceWeekNum]: points })))
        .catch((err: unknown) => {
          const message = err instanceof ApiError ? err.message : 'Failed to load weather forecast';
          setForecastErrors((prev) => ({ ...prev, [raceWeekNum]: message }));
        })
        .finally(() => setLoadingWeek(null));
    }
    // Fetched regardless of whether tracking is currently on — a season can have car-usage data
    // from before it was toggled off, or from a manual "Import Car Usage Since" run, and that's
    // worth showing either way.
    if (!carUsage[raceWeekNum]) {
      void iracingSeriesApi
        .getCarUsage(season.seasonId, raceWeekNum)
        .then((stats) => setCarUsage((prev) => ({ ...prev, [raceWeekNum]: stats })));
    }
  }

  async function handleToggleTracking() {
    if (!season) return;
    setTrackingBusy(true);
    try {
      const updated = await iracingSeriesApi.setTrackCarUsage(season.seasonId, !season.trackCarUsage);
      setSeason(updated);
    } finally {
      setTrackingBusy(false);
    }
  }

  async function handleImportCarUsage() {
    if (!season || !importSince) return;
    setImportBusy(true);
    setImportError(null);
    setImportDone(false);
    try {
      await iracingSeriesApi.syncCarUsageSince(season.seasonId, new Date(importSince).toISOString());
      // Cached tallies for any already-expanded week are now stale — drop them all and, if a
      // week is open right now, refetch just that one so the numbers on screen update.
      setCarUsage({});
      if (expandedWeek !== null) {
        const stats = await iracingSeriesApi.getCarUsage(season.seasonId, expandedWeek);
        setCarUsage({ [expandedWeek]: stats });
      }
      setImportDone(true);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Failed to import car usage');
    } finally {
      setImportBusy(false);
    }
  }

  if (season === null) {
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  return (
    <div>
      <Link to="/series" className="text-xs text-white/65 hover:text-white">
        ← Back to series
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {season.logoUrl && (
            <img src={season.logoUrl} alt="" className="h-16 w-16 object-contain bg-black/30 shrink-0" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-2xl uppercase text-w2w-white">{season.seriesName}</h1>
              {!season.active && (
                <span className="px-1.5 py-0.5 text-[10px] font-heading uppercase tracking-wide bg-white/10 text-white/65">
                  Archived
                </span>
              )}
            </div>
            <p className="text-white/65 text-sm mt-1">
              {[season.category, season.seasonName].filter(Boolean).join(' · ')}
            </p>
            {!season.active && (
              <p className="text-white/65 text-xs mt-1 max-w-md">
                This season has ended — a newer season of this series has taken over car-usage tracking.
              </p>
            )}
          </div>
        </div>
        {user?.role === 'ADMIN' && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            {season.schedule.length > 0 && (
              <button
                onClick={() => setShowGenerateModal(true)}
                className="px-4 py-2.5 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors"
              >
                Create Events for Every Week
              </button>
            )}
            <label className="flex items-center gap-1.5 text-[11px] text-white/65 cursor-pointer">
              <input
                type="checkbox"
                checked={season.trackCarUsage}
                disabled={trackingBusy}
                onChange={() => void handleToggleTracking()}
              />
              Track most-used cars (hourly)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Import car usage since"
                value={importSince}
                onChange={(e) => {
                  setImportSince(e.target.value);
                  setImportDone(false);
                }}
                max={new Date().toISOString().slice(0, 10)}
                className="input w-auto text-xs py-1.5"
              />
              <button
                type="button"
                onClick={() => void handleImportCarUsage()}
                disabled={importBusy || !importSince}
                className="px-3 py-1.5 border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-50 font-heading text-[11px] uppercase tracking-wide transition-colors"
              >
                {importBusy ? 'Importing...' : 'Import Car Usage Since'}
              </button>
            </div>
            {importError && <p className="text-w2w-red text-[11px] max-w-xs text-right">{importError}</p>}
            {importDone && !importError && <p className="text-white/65 text-[11px]">Imported.</p>}
          </div>
        )}
      </div>

      {justCreated !== null && (
        <p className="mt-4 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">
          Created {justCreated} draft event{justCreated === 1 ? '' : 's'} — review and publish them from the{' '}
          <Link to="/events" className="underline">
            Events
          </Link>{' '}
          page.
        </p>
      )}

      {showGenerateModal && (
        <GenerateEventsFromSeriesModal
          season={season}
          onClose={() => setShowGenerateModal(false)}
          onCreated={(count) => {
            setJustCreated(count);
            setShowGenerateModal(false);
          }}
        />
      )}

      <h2 className="mt-8 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">
        Race Weeks &amp; Weather
      </h2>
      <p className="text-white/65 text-xs mb-4">Click a row to see the hour-by-hour forecast.</p>

      {season.schedule.length === 0 ? (
        <p className="text-white/65 text-sm">No schedule data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-white/10">
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Week
                </th>
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Date
                </th>
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Track
                </th>
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Weather
                </th>
              </tr>
            </thead>
            <tbody>
              {season.schedule.map((entry, index) => {
                const week = summarizeRaceWeek(entry);
                const isExpanded = week.raceWeekNum !== null && expandedWeek === week.raceWeekNum;
                return (
                  <Fragment key={index}>
                    <tr
                      onClick={() => toggleWeek(week.raceWeekNum)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleWeek(week.raceWeekNum);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-w2w-red focus-visible:-outline-offset-2"
                    >
                      <td className="py-3 pr-4 text-white/70">
                        {week.raceWeekNum !== null ? week.raceWeekNum + 1 : '—'}
                      </td>
                      <td className="py-3 pr-4 text-white/70">
                        {week.startDate ? new Date(week.startDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 pr-4 text-white">{week.trackName}</td>
                      <td className="py-3 pr-4">
                        <p className="text-white">{week.weatherSummary}</p>
                        {week.weatherDetails.length > 0 && (
                          <p className="text-white/65 text-xs mt-0.5">{week.weatherDetails.join(' · ')}</p>
                        )}
                      </td>
                    </tr>
                    {isExpanded && week.raceWeekNum !== null && (
                      <tr className="border-b border-white/5">
                        <td colSpan={4} className="py-4 pr-4 bg-white/[0.02]">
                          <div className="grid sm:grid-cols-2 gap-6">
                            <div>
                              {loadingWeek === week.raceWeekNum ? (
                                <p className="text-white/65 text-xs">Loading forecast...</p>
                              ) : forecastErrors[week.raceWeekNum] ? (
                                <p className="text-w2w-red text-xs">{forecastErrors[week.raceWeekNum]}</p>
                              ) : forecasts[week.raceWeekNum] ? (
                                <WeatherForecastChart points={forecasts[week.raceWeekNum]} />
                              ) : null}
                            </div>
                            {(season.trackCarUsage || (carUsage[week.raceWeekNum]?.length ?? 0) > 0) && (
                              <div>
                                <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-2">
                                  Most-Used Cars
                                </p>
                                {!carUsage[week.raceWeekNum] ? (
                                  <p className="text-white/65 text-xs">Loading...</p>
                                ) : carUsage[week.raceWeekNum].length === 0 ? (
                                  <p className="text-white/65 text-xs">
                                    No entries scanned yet — the hourly job builds this up as races happen.
                                  </p>
                                ) : (
                                  (() => {
                                    const weekStats = carUsage[week.raceWeekNum];
                                    const classes = Array.from(new Set(weekStats.map((s) => s.carClass))).sort();
                                    const activeClass =
                                      classes.length > 1 ? (carUsageClassTab[week.raceWeekNum] ?? classes[0]) : null;
                                    const shownStats = activeClass ? weekStats.filter((s) => s.carClass === activeClass) : weekStats;
                                    const classColors = assignColors(classes);
                                    const carColors = assignColors(shownStats.map((s) => s.carName));
                                    const carSplitTitle = activeClass ? `${activeClass} Car Split` : 'Car Split';
                                    const seriesName = season.seriesName;
                                    function handleExportPng() {
                                      const formatValue = (v: number) => `${v} ${v === 1 ? 'entry' : 'entries'}`;
                                      const sections = [];

                                      if (classes.length > 1) {
                                        sections.push({
                                          title: 'Car Class Popularity',
                                          data: classes.map((cls) => ({
                                            name: cls,
                                            value: weekStats.filter((s) => s.carClass === cls).reduce((sum, s) => sum + s.entryCount, 0),
                                            color: classColors.get(cls)!,
                                          })),
                                          formatValue,
                                        });
                                      }

                                      // One car-split section per class (not just the tab currently open on screen) so
                                      // the export is a complete record of the week, not a snapshot of one tab.
                                      const classesToExport = classes.length > 1 ? classes : [null];
                                      for (const cls of classesToExport) {
                                        const statsForClass = cls ? weekStats.filter((s) => s.carClass === cls) : weekStats;
                                        const colorsForClass = assignColors(statsForClass.map((s) => s.carName));
                                        sections.push({
                                          title: cls ? `${cls} Car Split` : 'Car Split',
                                          data: statsForClass.map((s) => ({
                                            name: s.carName,
                                            value: s.entryCount,
                                            color: colorsForClass.get(s.carName)!,
                                          })),
                                          formatValue,
                                        });
                                      }

                                      exportChartsAsPng(
                                        `${seriesName} - week ${week.raceWeekNum} car usage.png`,
                                        `${seriesName} · Race Week ${week.raceWeekNum}`,
                                        sections,
                                      );
                                    }
                                    return (
                                      <>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                          {classes.length > 1 ? (
                                            <div className="flex gap-1 flex-wrap">
                                              {classes.map((cls) => (
                                                <button
                                                  key={cls}
                                                  type="button"
                                                  onClick={() =>
                                                    setCarUsageClassTab((prev) => ({ ...prev, [week.raceWeekNum!]: cls }))
                                                  }
                                                  className={`px-2 py-0.5 text-[10px] font-heading uppercase tracking-wide border transition-colors ${
                                                    activeClass === cls
                                                      ? 'border-w2w-red text-white bg-w2w-red/15'
                                                      : 'border-white/15 text-white/50 hover:text-white hover:border-white/30'
                                                  }`}
                                                >
                                                  {cls}
                                                </button>
                                              ))}
                                            </div>
                                          ) : (
                                            <div />
                                          )}
                                          <button
                                            type="button"
                                            onClick={handleExportPng}
                                            className="text-[10px] text-white/65 hover:text-white font-heading uppercase tracking-wide shrink-0"
                                          >
                                            Export PNG
                                          </button>
                                        </div>
                                        <div className="space-y-4">
                                          {classes.length > 1 && (
                                            <DriverShareChart
                                              title="Car Class Popularity"
                                              data={classes.map((cls) => ({
                                                name: cls,
                                                value: weekStats.filter((s) => s.carClass === cls).reduce((sum, s) => sum + s.entryCount, 0),
                                                color: classColors.get(cls)!,
                                              }))}
                                              emptyMessage="No entries yet."
                                              formatValue={(v) => `${v} ${v === 1 ? 'entry' : 'entries'}`}
                                            />
                                          )}
                                          <DriverShareChart
                                            title={carSplitTitle}
                                            data={shownStats.map((s) => ({
                                              name: s.carName,
                                              value: s.entryCount,
                                              color: carColors.get(s.carName)!,
                                            }))}
                                            emptyMessage="No entries yet."
                                            formatValue={(v) => `${v} ${v === 1 ? 'entry' : 'entries'}`}
                                          />
                                        </div>
                                      </>
                                    );
                                  })()
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
