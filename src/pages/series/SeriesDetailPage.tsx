import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DriverShareChart from '../../components/DriverShareChart';
import GenerateEventsFromSeriesPanel from '../../components/GenerateEventsFromSeriesPanel';
import HourlyForecastBars from '../../components/HourlyForecastBars';
import { useAuth } from '../../context/AuthContext';
import { iracingSeriesApi } from '../../lib/api/iracingSeries';
import { ApiError } from '../../lib/api';
import { exportChartsAsPng } from '../../lib/exportChartPng';
import { currentRaceWeekNum, parseSeriesWeeks } from '../../lib/iracingSeriesWeeks';
import { summarizeRaceWeek } from '../../lib/iracingWeather';
import { formatShortDate } from '../../lib/formatShortDate';
import { seriesAbbreviation } from '../../lib/seriesAbbreviation';
import type { IracingCarUsageStat, IracingSeriesSeasonDetail } from '../../types/iracingSeries';
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

/** iRacing's license_group (1-5) → the class label it requires (same mapping as the series list). */
const LICENSE_GROUP_LETTER: Record<number, string> = { 1: 'Rookie', 2: 'D', 3: 'C', 4: 'B', 5: 'A' };

export default function SeriesDetailPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  // Keyed by season so navigating /series/A -> /series/B (back/forward reuses this route element)
  // starts from clean state: the per-week forecast / car-usage caches below are keyed by week
  // number only and must never leak from one season into the next.
  return seasonId ? <SeriesDetail key={seasonId} seasonId={seasonId} /> : null;
}

function SeriesDetail({ seasonId }: { seasonId: string }) {
  const { user } = useAuth();
  const [season, setSeason] = useState<IracingSeriesSeasonDetail | null>(null);
  const numericSeasonId = Number(seasonId);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const loadError = Number.isInteger(numericSeasonId) ? fetchError : 'Series season not found.';
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [forecasts, setForecasts] = useState<Record<number, WeatherForecastPoint[]>>({});
  const [loadingWeeks, setLoadingWeeks] = useState<Record<number, boolean>>({});
  const [forecastErrors, setForecastErrors] = useState<Record<number, string>>({});
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [justCreated, setJustCreated] = useState<number | null>(null);
  const [carUsage, setCarUsage] = useState<Record<number, IracingCarUsageStat[]>>({});
  const [carUsageFailed, setCarUsageFailed] = useState<Record<number, boolean>>({});
  const [entriesScanned, setEntriesScanned] = useState<Record<number, number>>({});
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [importSince, setImportSince] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  // Which car-class tab is active per race week — only relevant (and only shown) for a week whose
  // tally actually spans more than one class; a single-class week just renders its flat list.
  const [carUsageClassTab, setCarUsageClassTab] = useState<Record<number, string>>({});

  // Requests already running per race week — the caches above are only written when a response
  // lands, so without these a quick collapse / re-expand would fire the same calls again.
  const forecastInFlight = useRef(new Set<number>());
  const usageInFlight = useRef(new Set<number>());
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!Number.isInteger(numericSeasonId)) return;
    let cancelled = false;
    iracingSeriesApi
      .getById(numericSeasonId)
      .then((loaded) => {
        if (!cancelled) setSeason(loaded);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError(
          err instanceof ApiError && err.status === 404
            ? 'Series season not found.'
            : err instanceof Error
              ? err.message
              : 'Failed to load series season.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [numericSeasonId]);

  // The race week running right now, from the season's own start/end dates (null off-season).
  const currentWeekNum = useMemo(
    () => (season ? currentRaceWeekNum(parseSeriesWeeks(season.schedule)) : null),
    [season],
  );
  const weeks = useMemo(() => (season?.schedule ?? []).map(summarizeRaceWeek), [season]);

  function toggleWeek(raceWeekNum: number | null) {
    if (raceWeekNum === null || !season) return;
    if (expandedWeek === raceWeekNum) {
      setExpandedWeek(null);
      return;
    }
    setExpandedWeek(raceWeekNum);
    if (!forecasts[raceWeekNum] && !forecastErrors[raceWeekNum] && !forecastInFlight.current.has(raceWeekNum)) {
      forecastInFlight.current.add(raceWeekNum);
      setLoadingWeeks((prev) => ({ ...prev, [raceWeekNum]: true }));
      iracingSeriesApi
        .getWeatherForecast(season.seasonId, raceWeekNum)
        .then((points) => {
          if (aliveRef.current) setForecasts((prev) => ({ ...prev, [raceWeekNum]: points }));
        })
        .catch((err: unknown) => {
          if (!aliveRef.current) return;
          const message = err instanceof ApiError ? err.message : 'Failed to load weather forecast';
          setForecastErrors((prev) => ({ ...prev, [raceWeekNum]: message }));
        })
        .finally(() => {
          forecastInFlight.current.delete(raceWeekNum);
          if (aliveRef.current) setLoadingWeeks((prev) => ({ ...prev, [raceWeekNum]: false }));
        });
    }
    // Fetched regardless of whether tracking is currently on — a season can have car-usage data
    // from before it was toggled off, or from a manual "Import Car Usage Since" run, and that's
    // worth showing either way.
    if (!carUsage[raceWeekNum] && !usageInFlight.current.has(raceWeekNum)) {
      usageInFlight.current.add(raceWeekNum);
      setCarUsageFailed((prev) => ({ ...prev, [raceWeekNum]: false }));
      void iracingSeriesApi
        .getCarUsage(season.seasonId, raceWeekNum)
        .then((stats) => {
          if (aliveRef.current) setCarUsage((prev) => ({ ...prev, [raceWeekNum]: stats }));
        })
        .catch(() => {
          if (aliveRef.current) setCarUsageFailed((prev) => ({ ...prev, [raceWeekNum]: true }));
        })
        .finally(() => usageInFlight.current.delete(raceWeekNum));
      void iracingSeriesApi
        .getCarUsageSummary(season.seasonId, raceWeekNum)
        .then((summary) => {
          if (aliveRef.current) setEntriesScanned((prev) => ({ ...prev, [raceWeekNum]: summary.entriesScanned }));
        })
        .catch(() => undefined); // the line below the chart is optional
    }
  }

  async function handleToggleTracking() {
    if (!season) return;
    setTrackingBusy(true);
    try {
      const updated = await iracingSeriesApi.setTrackCarUsage(season.seasonId, !season.trackCarUsage);
      // Merge only the flag: the PATCH response is the raw entity (no resolved logoUrl).
      setSeason((prev) => (prev ? { ...prev, trackCarUsage: updated.trackCarUsage } : prev));
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
      setEntriesScanned({});
      if (expandedWeek !== null) {
        const [stats, summary] = await Promise.all([
          iracingSeriesApi.getCarUsage(season.seasonId, expandedWeek),
          iracingSeriesApi.getCarUsageSummary(season.seasonId, expandedWeek).catch(() => null),
        ]);
        setCarUsage({ [expandedWeek]: stats });
        if (summary) setEntriesScanned({ [expandedWeek]: summary.entriesScanned });
      }
      setImportDone(true);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Failed to import car usage');
    } finally {
      setImportBusy(false);
    }
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {loadError}
        </p>
        <Link to="/series" className="text-sm font-semibold text-w2w-red-ink hover:underline">
          Back to series
        </Link>
      </div>
    );
  }
  if (season === null) {
    return <p className="text-ds-muted text-sm">Loading...</p>;
  }

  const trackingOn = season.trackCarUsage;
  const classLetter = season.licenseGroup !== null ? LICENSE_GROUP_LETTER[season.licenseGroup] : undefined;
  const classLabel = classLetter ? (classLetter === 'Rookie' ? 'Rookie' : `Class ${classLetter}`) : null;

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ds-muted">
        <Link to="/series" className="font-semibold text-ds-muted hover:text-ds-ink">
          Series
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="min-w-0 truncate font-semibold text-ds-ink">{season.seriesName}</span>
      </nav>

      <header className="cut-lg relative flex flex-col gap-[22px] bg-ds-panel py-[26px] pl-7 pr-[72px] min-[640px]:pr-[200px]">
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 top-0 w-[56px] min-[640px]:w-[160px]"
          style={{
            background:
              'linear-gradient(110deg, transparent 0 28%, var(--color-w2w-red) 28% 40%, transparent 40% 50%, var(--color-w2w-red) 50% 100%)',
          }}
        />
        <div className="flex min-w-0 items-center gap-[18px]">
          <span className="cut-xs flex h-16 w-16 flex-none items-center justify-center overflow-hidden bg-ds-field">
            {season.logoUrl ? (
              <img
                src={season.logoUrl}
                alt=""
                width={64}
                height={64}
                decoding="async"
                className="h-full w-full object-contain"
              />
            ) : (
              <span aria-hidden="true" className="num text-lg text-ds-muted">
                {seriesAbbreviation(season.seriesName)}
              </span>
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-[36px] font-extrabold leading-[1.05]">{season.seriesName}</h1>
              {!season.active && <span className="chip chip-sm chip-muted">Archived</span>}
            </div>
            <span className="text-ds-muted">
              {[season.seasonName, season.category, classLabel].filter(Boolean).join(' · ')}
            </span>
            {!season.active && (
              <p className="m-0 mt-1 max-w-md text-xs text-ds-muted">
                This season has ended — a newer season of this series has taken over car-usage tracking.
              </p>
            )}
          </div>
        </div>
        {user?.role === 'ADMIN' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {season.schedule.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCreatePanel((v) => !v)}
                  aria-expanded={showCreatePanel}
                  className="btn-primary"
                >
                  Create events for every week
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
                    <path d="M5 12h13M13 6l6 6-6 6" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={trackingOn}
                disabled={trackingBusy}
                onClick={() => void handleToggleTracking()}
                title="Scanned hourly"
                className="btn-secondary !gap-2.5 !pl-3.5 !pr-[18px]"
              >
                <span
                  className={`relative inline-block h-5 w-[38px] flex-none ${trackingOn ? 'bg-w2w-red' : 'bg-[#3a3a40] [:root[data-theme=light]_&]:bg-ds-control-hover'}`}
                >
                  <span
                    className="absolute top-[3px] h-3.5 w-[15px] bg-on-accent"
                    style={{
                      left: trackingOn ? 20 : 3,
                      clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)',
                    }}
                  />
                </span>
                Track most-used cars
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="date"
                aria-label="Import car usage since"
                value={importSince}
                onChange={(e) => {
                  setImportSince(e.target.value);
                  setImportDone(false);
                }}
                max={new Date().toISOString().slice(0, 10)}
                className="input !w-auto"
              />
              <button
                type="button"
                onClick={() => void handleImportCarUsage()}
                disabled={importBusy || !importSince}
                className="btn-secondary btn-sm !min-h-[42px]"
              >
                {importBusy ? 'Importing...' : 'Import car usage since'}
              </button>
              {importError && <p className="m-0 max-w-xs text-xs text-ds-danger">{importError}</p>}
              {importDone && !importError && <p className="m-0 text-xs text-ds-muted">Imported.</p>}
            </div>
          </div>
        )}
      </header>

      {justCreated !== null && (
        <p className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-ds-ink shadow-[inset_3px_0_0_var(--color-w2w-red)]">
          Created {justCreated} draft event{justCreated === 1 ? '' : 's'} — review and publish them from the{' '}
          <Link to="/events" className="text-w2w-red-ink underline">
            Events
          </Link>{' '}
          page.
        </p>
      )}

      {showCreatePanel && (
        <GenerateEventsFromSeriesPanel
          season={season}
          onClose={() => setShowCreatePanel(false)}
          onCreated={(count) => setJustCreated(count)}
        />
      )}

      <section aria-labelledby="wk-title" className="cut bg-ds-panel pb-1.5 pt-5">
        <div className="flex flex-col gap-1 px-5 pb-3">
          <h2 id="wk-title" className="h2">
            Race weeks &amp; weather
          </h2>
          <span className="text-[13px] text-ds-muted">
            Open a week for the hour-by-hour forecast and the cars people are running.
          </span>
        </div>

        {season.schedule.length === 0 ? (
          <p className="m-0 px-5 pb-4 text-sm text-ds-muted">No schedule data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase text-ds-dim">
                  <th className="w-[56px] py-1.5 pl-5 pr-3 font-bold">Week</th>
                  <th className="w-[110px] px-3 py-1.5 font-bold">Date</th>
                  <th className="px-3 py-1.5 font-bold">Track</th>
                  <th className="px-3 py-1.5 font-bold">Weather</th>
                  <th className="w-10 py-1.5 pl-3 pr-5 font-bold">
                    <span className="sr-only">Expand</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, index) => {
                  const isExpanded = week.raceWeekNum !== null && expandedWeek === week.raceWeekNum;
                  const isCurrent = week.raceWeekNum !== null && week.raceWeekNum === currentWeekNum;
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
                        className={`row-hover cursor-pointer border-t border-ds-line focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-w2w-red ${
                          isExpanded ? 'bg-ds-raised' : ''
                        }`}
                      >
                        <td
                          className={`py-3 pl-5 pr-3 align-middle ${isExpanded ? 'shadow-[inset_3px_0_0_var(--color-w2w-red)]' : ''}`}
                        >
                          <span className={`num text-lg ${isCurrent ? 'text-w2w-red-ink' : ''}`}>
                            {week.raceWeekNum !== null ? `W${week.raceWeekNum + 1}` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle text-[13px] text-ds-muted">
                          {week.startDate ? formatShortDate(week.startDate) || '—' : '—'}
                        </td>
                        <td className="px-3 py-3 align-middle font-bold">
                          <div className="max-w-[300px] truncate" title={week.trackName}>
                            {week.trackName}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex items-center gap-2 text-[13px] text-ds-ink-soft">
                            {isCurrent && <span className="chip chip-sm chip-accent bg-ds-line">This week</span>}
                            <p className="m-0">{week.weatherSummary}</p>
                          </div>
                          {week.weatherDetails.length > 0 && (
                            <p className="m-0 mt-0.5 text-xs text-ds-muted">{week.weatherDetails.join(' · ')}</p>
                          )}
                        </td>
                        <td className="py-3 pl-3 pr-5 align-middle">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="square"
                            aria-hidden="true"
                            className="text-ds-dim"
                            style={{ transform: `rotate(${isExpanded ? 180 : 0}deg)` }}
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </td>
                      </tr>
                      {isExpanded && week.raceWeekNum !== null && (
                        <tr className="border-t border-ds-line">
                          <td colSpan={5} className="bg-ds-raised p-0 shadow-[inset_3px_0_0_var(--color-w2w-red)]">
                            <div className="flex flex-wrap gap-3 px-5 pb-5 pt-1.5">
                              <div className="cut-sm flex min-w-0 flex-[3_1_420px] flex-col gap-2 bg-ds-field p-4">
                                {loadingWeeks[week.raceWeekNum] ? (
                                  <p className="m-0 text-xs text-ds-muted">Loading forecast...</p>
                                ) : forecastErrors[week.raceWeekNum] ? (
                                  <p className="m-0 text-xs text-ds-danger">{forecastErrors[week.raceWeekNum]}</p>
                                ) : forecasts[week.raceWeekNum] ? (
                                  <HourlyForecastBars points={forecasts[week.raceWeekNum]} />
                                ) : null}
                              </div>
                              {(season.trackCarUsage || (carUsage[week.raceWeekNum]?.length ?? 0) > 0) && (
                                <div className="cut-sm flex min-w-0 flex-[2_1_280px] flex-col gap-2.5 bg-ds-field p-4">
                                  {(carUsage[week.raceWeekNum]?.length ?? 0) === 0 && (
                                    <span className="text-[13px] font-bold text-ds-ink">Most-used cars</span>
                                  )}
                                  {!carUsage[week.raceWeekNum] ? (
                                    carUsageFailed[week.raceWeekNum] ? (
                                      <p className="m-0 text-xs text-ds-danger">Could not load car usage.</p>
                                    ) : (
                                      <p className="m-0 text-xs text-ds-muted">Loading...</p>
                                    )
                                  ) : carUsage[week.raceWeekNum].length === 0 ? (
                                    <p className="m-0 text-xs text-ds-muted">
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
                                      const shownTotal = shownStats.reduce((sum, s) => sum + s.entryCount, 0);
                                      const shownMax = shownStats.reduce((max, s) => Math.max(max, s.entryCount), 0);
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
                                          <div className="flex items-center justify-between gap-2 text-[13px]">
                                            <span className="min-w-0 font-bold text-ds-ink">
                                              {activeClass ? `Most-used ${activeClass} cars` : 'Most-used cars'}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={handleExportPng}
                                              className="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-xs font-semibold text-w2w-red-ink hover:underline"
                                            >
                                              Export PNG
                                            </button>
                                          </div>
                                          {classes.length > 1 && (
                                            <div role="group" aria-label="Car class" className="seg seg-field self-start">
                                              {classes.map((cls) => (
                                                <button
                                                  key={cls}
                                                  type="button"
                                                  aria-pressed={activeClass === cls}
                                                  onClick={() =>
                                                    setCarUsageClassTab((prev) => ({ ...prev, [week.raceWeekNum!]: cls }))
                                                  }
                                                >
                                                  {cls}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                                            {shownStats.map((s) => {
                                              const pct = shownTotal === 0 ? 0 : Math.round((s.entryCount / shownTotal) * 100);
                                              return (
                                                <li
                                                  key={s.id}
                                                  className="flex flex-col gap-1"
                                                  title={`${s.carName}: ${s.entryCount} ${s.entryCount === 1 ? 'entry' : 'entries'}`}
                                                >
                                                  <div className="flex justify-between gap-2 text-xs text-ds-ink-soft">
                                                    <span className="min-w-0">{s.carName}</span>
                                                    <span className="num shrink-0 text-[13px] text-ds-ink">{pct}%</span>
                                                  </div>
                                                  <div className="h-1.5 bg-ds-control">
                                                    <div
                                                      className="h-full bg-w2w-red"
                                                      style={{ width: `${shownMax === 0 ? 0 : (s.entryCount / shownMax) * 100}%` }}
                                                    />
                                                  </div>
                                                </li>
                                              );
                                            })}
                                          </ul>
                                          {classes.length > 1 && (
                                            <DriverShareChart
                                              title="Car class popularity"
                                              data={classes.map((cls) => ({
                                                name: cls,
                                                value: weekStats.filter((s) => s.carClass === cls).reduce((sum, s) => sum + s.entryCount, 0),
                                                color: classColors.get(cls)!,
                                              }))}
                                              emptyMessage="No entries yet."
                                              formatValue={(v) => `${v} ${v === 1 ? 'entry' : 'entries'}`}
                                            />
                                          )}
                                          {entriesScanned[week.raceWeekNum!] !== undefined && (
                                            <span className="text-xs text-ds-dim">
                                              {entriesScanned[week.raceWeekNum!].toLocaleString()}{' '}
                                              {entriesScanned[week.raceWeekNum!] === 1 ? 'entry' : 'entries'} scanned{' '}
                                              {isCurrent ? 'this week' : 'in this race week'}
                                            </span>
                                          )}
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
      </section>
    </div>
  );
}
