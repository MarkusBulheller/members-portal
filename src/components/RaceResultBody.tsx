import { memo, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import LapScatterChart from './LapScatterChart';
import LapTimeBoxPlot from './LapTimeBoxPlot';
import { formatRaceDate, positionLabel } from './RaceResultRow';
import { formatShortDate } from '../lib/formatShortDate';
import { buildLapScatter, formatLapSeconds, ordinal } from '../lib/lapScatter';
import { formatDuration, formatLapSpread, formatLapTime, guessRaceLength } from '../lib/lapTime';
import {
  averageLapMs,
  buildDriverColorMap,
  computeStints,
  lapTimeSpreadMs,
  stintDurationMs,
  type Stint,
} from '../lib/stints';
import type { RaceResult, RaceResultLap } from '../types/raceResult';

const PODIUM_BG: Record<number, string> = { 1: '#e8c34a', 2: '#c7cbd1', 3: '#cd8a4e' };
const ACCENT_LINE = 'shadow-[inset_0_-3px_0_var(--color-w2w-red)]';

/** Driver name — a link to their profile on the (login-gated) member view, or plain text on the
 * public share view where that profile page isn't reachable without logging in. */
function DriverName({
  name,
  driverProfileId,
  linkDrivers,
}: {
  name: string;
  driverProfileId: string | null;
  linkDrivers: boolean;
}) {
  if (linkDrivers && driverProfileId) {
    return (
      <Link to={`/drivers/${driverProfileId}`} className="hover:text-w2w-red-ink">
        {name}
      </Link>
    );
  }
  return <>{name}</>;
}

function raceDurationMs(result: RaceResult): number | null {
  return result.startTime && result.endTime
    ? new Date(result.endTime).getTime() - new Date(result.startTime).getTime()
    : null;
}

/** Title block of a result: finishing-position medal, series tag, track name and a summary line.
 * Used as the page header on RaceResultDetailPage ("detail", with the page's action buttons on
 * the right) and as the public share card on SharedRaceResultPage ("public", larger, with the
 * stat tiles and driver legend as children). */
export function RaceResultHero({
  result,
  variant,
  actions,
  children,
}: {
  result: RaceResult;
  variant: 'detail' | 'public';
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const isPublic = variant === 'public';
  const position = result.finishingPositionInClass ?? result.finishingPosition;
  const medal = position !== null ? PODIUM_BG[position] : undefined;
  const scope = result.finishingPositionInClass !== null ? 'in class' : 'overall';
  const subline = [
    result.teamName,
    result.carName,
    result.totalSplits && result.totalSplits > 1 ? `Split ${result.splitNumber}/${result.totalSplits}` : null,
    isPublic ? formatRaceDate(result.startTime) : `Session ${result.subsessionId}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const Wrapper = isPublic ? 'section' : 'header';
  const trackName = `${result.trackName}${result.trackConfig ? ` — ${result.trackConfig}` : ''}`;

  return (
    <Wrapper
      aria-labelledby={isPublic ? 'result-title' : undefined}
      className={`cut-lg relative flex bg-ds-panel ${
        isPublic
          ? 'flex-col gap-[30px] py-[clamp(24px,4vw,44px)] pl-[clamp(24px,4vw,44px)] pr-[clamp(24px,15vw,210px)]'
          : 'flex-wrap items-start justify-between gap-[22px] py-[26px] pl-[30px] pr-[clamp(24px,15vw,200px)]'
      }`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-[clamp(0px,12vw,170px)]"
        style={{
          background:
            'linear-gradient(110deg, transparent 0 28%, var(--color-w2w-red) 28% 40%, transparent 40% 50%, var(--color-w2w-red) 50% 100%)',
        }}
      />
      <div className={`relative flex min-w-0 flex-wrap items-center ${isPublic ? 'gap-[26px]' : 'gap-[22px]'}`}>
        <span
          className={`cut-sm flex flex-none flex-col items-center justify-center leading-none ${
            isPublic ? 'size-[120px]' : 'size-24'
          } ${medal ? '' : 'bg-ds-control text-ds-ink-soft'}`}
          style={medal ? { background: medal, color: '#111113' } : undefined}
          role="img"
          aria-label={position !== null ? `Finished P${position} ${scope}` : 'No finishing position'}
        >
          <span className={`num ${isPublic ? 'text-[54px]' : 'text-[44px]'}`}>{positionLabel(position)}</span>
          <span
            className={`font-extrabold uppercase ${isPublic ? 'mt-1.5 text-[11px]' : 'mt-1 text-[10px]'}`}
          >
            {scope === 'in class' ? 'In class' : 'Overall'}
          </span>
        </span>
        <div className={`flex min-w-0 flex-col ${isPublic ? 'gap-2.5' : 'gap-2'}`}>
          {result.seriesName && (
            <span className="chip chip-solid self-start py-[3px]">{result.seriesName}</span>
          )}
          <h1
            id="result-title"
            className={`m-0 font-extrabold ${
              isPublic ? 'text-[clamp(34px,5vw,54px)] leading-none' : 'text-[38px] leading-[1.05]'
            }`}
          >
            {trackName}
          </h1>
          <span className={`text-ds-muted ${isPublic ? 'text-[15px]' : ''}`}>{subline}</span>
        </div>
      </div>
      {actions}
      {children}
    </Wrapper>
  );
}

/** The race's headline numbers. "panel" = the six separate tiles under the detail page header;
 * "hero" = the five inset tiles inside the public share card. */
export function RaceResultStatTiles({ result, variant }: { result: RaceResult; variant: 'panel' | 'hero' }) {
  const startPos = result.startingPositionInClass ?? result.startingPosition;
  const finishPos = result.finishingPositionInClass ?? result.finishingPosition;
  const overallSub = (inClass: number | null, overall: number | null) =>
    inClass !== null && overall !== null ? `class · P${overall} overall` : '';
  const start = result.startTime ? new Date(result.startTime) : null;

  const tiles: { key: string; value: string; sub: string; accent?: boolean }[] = [
    { key: 'Start', value: positionLabel(startPos), sub: overallSub(result.startingPositionInClass, result.startingPosition) },
    {
      key: 'Finish',
      value: positionLabel(finishPos),
      sub: overallSub(result.finishingPositionInClass, result.finishingPosition),
      accent: true,
    },
    { key: 'Duration', value: guessRaceLength(raceDurationMs(result)), sub: '' },
    {
      key: 'Laps',
      value: String(result.teamLapsComplete ?? '—'),
      sub: result.totalLaps ? `of ${result.totalLaps}` : '',
    },
    { key: 'Incidents', value: result.teamIncidents !== null ? `${result.teamIncidents}x` : '—', sub: '' },
  ];
  if (variant === 'panel') {
    tiles.push({
      key: 'Date',
      value: start ? formatShortDate(result.startTime) : '—',
      sub: start
        ? `${start.getFullYear()} · ${start.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZoneName: 'short',
          })}`
        : '',
    });
  }

  const isHero = variant === 'hero';
  return (
    <dl
      className={`relative m-0 grid gap-2.5 ${
        isHero
          ? 'grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))]'
          : 'grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))]'
      }`}
    >
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className={`flex flex-col gap-0.5 ${
            isHero ? 'cut-sm bg-ds-field px-4 py-3.5' : 'cut bg-ds-panel px-[18px] py-3.5'
          } ${tile.accent ? ACCENT_LINE : ''}`}
        >
          <dt className="text-[13px] font-semibold text-ds-muted">{tile.key}</dt>
          <dd className="num m-0 text-[32px] leading-[1.1]">{tile.value}</dd>
          {!isHero && <dd className="m-0 min-h-[18px] text-xs text-ds-muted">{tile.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Driver-colour dots + names, used as a legend. */
export function RaceResultDriverLegend({ result }: { result: RaceResult }) {
  const driverColors = buildDriverColorMap(result.driverStints.map((s) => s.iracingCustId));
  return (
    <>
      {result.driverStints.map((stint) => (
        <span key={stint.id} className="flex items-center gap-2 font-bold">
          <span
            className="size-2.5 flex-none"
            style={{ background: driverColors.get(stint.iracingCustId) ?? '#7a8b99' }}
          />
          {stint.displayName}
        </span>
      ))}
    </>
  );
}

/** "How the crew drove it" — the public share page's driver table: laps, average / best lap and
 * each driver's share of the team's laps as a bar. Plain-text names (no profile links). */
export function RaceResultCrewTable({ result }: { result: RaceResult }) {
  const driverColors = buildDriverColorMap(result.driverStints.map((s) => s.iracingCustId));
  const totalLaps = result.driverStints.reduce((sum, s) => sum + (s.lapsComplete ?? 0), 0);
  const bestLapOverall = result.driverStints.reduce<number | null>(
    (best, s) => (s.bestLapTimeMs !== null && (best === null || s.bestLapTimeMs < best) ? s.bestLapTimeMs : best),
    null,
  );
  const CREW_GRID =
    'grid grid-cols-[minmax(140px,1.6fr)_70px_100px_110px_minmax(150px,1fr)] items-center gap-x-3 px-[22px]';

  return (
    <section aria-labelledby="crew-title" className="cut bg-ds-panel pb-1.5 pt-5">
      <h2 id="crew-title" className="h2 px-[22px] pb-2.5">How the crew drove it</h2>
      {result.driverStints.length === 0 ? (
        <p className="m-0 px-[22px] pb-3 text-sm text-ds-muted">No per-driver data for this result.</p>
      ) : (
        <div className="overflow-x-auto">
          <div role="table" aria-labelledby="crew-title" className="min-w-[600px] text-sm">
            <div role="rowgroup">
              <div role="row" className={`${CREW_GRID} min-h-[38px] text-[11px] font-bold uppercase text-ds-dim`}>
                <span role="columnheader">Driver</span>
                <span role="columnheader" className="text-right">Laps</span>
                <span role="columnheader" className="text-right">Avg lap</span>
                <span role="columnheader" className="text-right">Best lap</span>
                <span role="columnheader" className="text-right">Share</span>
              </div>
            </div>
            <div role="rowgroup">
              {result.driverStints.map((stint) => {
                const color = driverColors.get(stint.iracingCustId) ?? '#7a8b99';
                const pct = totalLaps > 0 ? Math.round(((stint.lapsComplete ?? 0) / totalLaps) * 100) : 0;
                const isFastest = bestLapOverall !== null && stint.bestLapTimeMs === bestLapOverall;
                return (
                  <div key={stint.id} role="row" className={`${CREW_GRID} row-hover min-h-[54px] border-t border-ds-line`}>
                    <span role="cell" className="flex min-w-0 items-center gap-2.5 font-bold">
                      <span className="size-2.5 flex-none" style={{ background: color }} />
                      <span className="min-w-0 truncate">{stint.displayName}</span>
                    </span>
                    <span role="cell" className="num text-right text-base">{stint.lapsComplete ?? '—'}</span>
                    <span role="cell" className="num text-right text-base">{formatLapTime(stint.averageLapTimeMs)}</span>
                    <span
                      role="cell"
                      className="num text-right text-base"
                      style={isFastest ? { color: '#c084fc' } : undefined}
                    >
                      {formatLapTime(stint.bestLapTimeMs)}
                    </span>
                    <span role="cell" className="flex items-center justify-end gap-2.5">
                      <span className="inline-block h-2 w-24 flex-none overflow-hidden bg-ds-control" aria-hidden="true">
                        <span
                          className="block h-full"
                          style={{ width: `${Math.min(100, pct * 2.5)}%`, background: color }}
                        />
                      </span>
                      <span className="min-w-[34px] text-right tabular-nums text-ds-ink-soft">{pct}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const ShareBar = memo(function ShareBar({
  title,
  data,
  emptyMessage,
  formatValue,
}: {
  title: string;
  data: { name: string; value: number; color: string }[];
  emptyMessage: string;
  formatValue: (value: number) => string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-ds-muted">{title}</span>
      {total === 0 ? (
        <p className="m-0 text-sm text-ds-muted">{emptyMessage}</p>
      ) : (
        <>
          <div role="img" aria-label={`${title} by driver`} className="flex h-4 gap-[3px] px-1">
            {data.map((d) => (
              <span
                key={d.name}
                title={`${d.name}: ${formatValue(d.value)}`}
                style={{ flex: `${d.value} 1 0`, background: d.color }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ds-ink-soft">
            {data.map((d) => (
              <span key={d.name} className="flex items-center gap-1.5">
                <span className="size-2.5 flex-none" style={{ background: d.color }} />
                {d.name} {Math.round((d.value / total) * 100)}%
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

const FALLBACK_DRIVER_COLOR = '#7a8b99';
// Module-level so ShareBar's props stay referentially stable across renders.
const formatLaps = (v: number) => `${v} lap${v === 1 ? '' : 's'}`;
const formatIncidents = (v: number) => `${v} incident${v === 1 ? '' : 's'}`;

/** The stint-by-stint list. Owns the expand/collapse state so toggling a stint re-renders only
 * this list, never the charts above it. */
const StintList = memo(function StintList({
  stints,
  durations,
  driverColors,
  linkDrivers,
}: {
  stints: Stint[];
  durations: number[];
  driverColors: Map<number, string>;
  linkDrivers: boolean;
}) {
  const [expandedStint, setExpandedStint] = useState<string | null>(null);

  return (
    <div className="mt-4 flex flex-col gap-2">
      {stints.map((stint, i) => {
        const key = `stint-${stint.stintNumber}`;
        const isExpanded = expandedStint === key;
        const first = stint.laps[0];
        const last = stint.laps[stint.laps.length - 1];
        return (
          <div
            key={key}
            className="cut-sm bg-ds-field py-3 pl-[18px] pr-3.5"
            style={{ boxShadow: `inset 4px 0 0 ${driverColors.get(stint.iracingCustId) ?? FALLBACK_DRIVER_COLOR}` }}
          >
            <div className="flex w-full items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-bold text-ds-ink">
                Stint {stint.stintNumber} —{' '}
                <DriverName
                  name={stint.displayName}
                  driverProfileId={stint.driverProfileId}
                  linkDrivers={linkDrivers}
                />
              </span>
              {/* A real <a> (from DriverName) can't sit inside this toggle button — nesting
                  interactive elements is invalid HTML and breaks keyboard/screen-reader focus
                  order — so the name lives in its own span above and this button only covers
                  the stint's non-link summary text. */}
              <button
                type="button"
                onClick={() => setExpandedStint(isExpanded ? null : key)}
                aria-expanded={isExpanded}
                className="flex shrink-0 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-ds-muted transition-colors hover:text-w2w-red-ink"
              >
                <span className="text-xs">
                  (L{first.lapNumber}–{last.lapNumber})
                </span>
                <span className="text-xs">
                  {stint.laps.length} lap{stint.laps.length === 1 ? '' : 's'} ·{' '}
                  {formatDuration(durations[i])} · avg {formatLapTime(averageLapMs(stint.laps))}
                </span>
              </button>
            </div>
            {isExpanded && (
              <div className="mt-2 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {stint.laps.map((lap) => (
                  <div key={lap.id} className="flex items-center justify-between px-1 py-0.5 text-xs text-ds-muted">
                    <span>Lap {lap.lapNumber}</span>
                    <span className="num flex items-center gap-1.5 text-ds-ink-soft">
                      {lap.incident && <span className="text-w2w-red-ink">!</span>}
                      {formatLapTime(lap.lapTimeMs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

/** The full read-only body of a race result — stats grid, per-driver table, lap/incident share
 * charts, and the stint-by-stint timeline. Used by RaceResultDetailPage (logged-in, driver names
 * link to their profile) and by the public SharedRaceResultPage (plain-text names, tiles and
 * drivers table switched off because the share hero and RaceResultCrewTable already cover them).
 * Page-level chrome (header, Export/Remove/Share buttons, the off-screen PNG-export card) stays
 * with each page. The lap analytics are memoised on result.laps / result.driverStints, so a parent
 * re-render with the same data (copied-link flag, exporting flag) doesn't recompute or re-render
 * the charts. */
export default function RaceResultBody({
  result,
  linkDrivers,
  showTiles = true,
  showDriversTable = true,
}: {
  result: RaceResult;
  linkDrivers: boolean;
  showTiles?: boolean;
  /** Turn off to omit the Drivers table (the public page used to show RaceResultCrewTable instead). */
  showDriversTable?: boolean;
}) {
  const { driverStints, laps } = result;

  // Built once from the full driver list so every chart below (share charts, timeline, box
  // plot) agrees on one color per driver — see buildDriverColorMap(). Memoised so the Map keeps
  // its identity and the memoised charts don't re-render.
  const driverColors = useMemo(
    () => buildDriverColorMap(driverStints.map((s) => s.iracingCustId)),
    [driverStints],
  );
  const colorForDriver = (custId: number) => driverColors.get(custId) ?? FALLBACK_DRIVER_COLOR;

  const bestLapOverall = useMemo(
    () =>
      driverStints.reduce<number | null>(
        (best, s) => (s.bestLapTimeMs !== null && (best === null || s.bestLapTimeMs < best) ? s.bestLapTimeMs : best),
        null,
      ),
    [driverStints],
  );

  // Stints are computed once and shared by the scatter, the timeline bar and the stint list.
  const stints = useMemo(() => computeStints(laps), [laps]);
  const scatter = useMemo(() => buildLapScatter(laps, stints), [laps, stints]);
  const durations = useMemo(() => stints.map((stint) => stintDurationMs(stint) ?? 0), [stints]);
  const totalDuration = useMemo(() => durations.reduce((sum, d) => sum + d, 0) || 1, [durations]);

  // Laps grouped per driver once, for the Consistency column (only needed with the drivers table).
  const spreadByCust = useMemo(() => {
    const map = new Map<number, number | null>();
    if (!showDriversTable) return map;
    const byDriver = new Map<number, RaceResultLap[]>();
    for (const lap of laps) {
      const list = byDriver.get(lap.iracingCustId);
      if (list) list.push(lap);
      else byDriver.set(lap.iracingCustId, [lap]);
    }
    for (const stint of driverStints) {
      map.set(stint.iracingCustId, lapTimeSpreadMs(byDriver.get(stint.iracingCustId) ?? []));
    }
    return map;
  }, [laps, driverStints, showDriversTable]);

  const lapShareData = useMemo(
    () =>
      driverStints
        .filter((stint) => (stint.lapsComplete ?? 0) > 0)
        .map((stint) => ({
          name: stint.displayName,
          value: stint.lapsComplete ?? 0,
          color: driverColors.get(stint.iracingCustId) ?? FALLBACK_DRIVER_COLOR,
        })),
    [driverStints, driverColors],
  );
  const incidentShareData = useMemo(
    () =>
      driverStints
        .filter((stint) => (stint.incidents ?? 0) > 0)
        .map((stint) => ({
          name: stint.displayName,
          value: stint.incidents ?? 0,
          color: driverColors.get(stint.iracingCustId) ?? FALLBACK_DRIVER_COLOR,
        })),
    [driverStints, driverColors],
  );

  const GRID =
    'grid grid-cols-[minmax(150px,1.6fr)_64px_96px_104px_110px_56px] items-center gap-x-3 px-5';

  return (
    <div className="flex flex-col gap-5">
      {showTiles && <RaceResultStatTiles result={result} variant="panel" />}

      <div className="flex flex-wrap items-start gap-5">
        {showDriversTable && (
        <section
          aria-labelledby="dr-title"
          className="cut min-w-0 flex-[3_1_560px] bg-ds-panel pb-1.5 pt-5"
        >
          <h2 id="dr-title" className="h2 px-5 pb-2.5">Drivers</h2>

          {result.driverStints.length === 0 ? (
            <p className="m-0 px-5 pb-3 text-sm text-ds-muted">No per-driver data for this result.</p>
          ) : (
            <div className="overflow-x-auto">
              <div role="table" aria-labelledby="dr-title" className="min-w-[600px] text-sm">
                <div role="rowgroup">
                  <div role="row" className={`${GRID} min-h-[38px] text-[11px] font-bold uppercase text-ds-dim`}>
                    <span role="columnheader">Driver</span>
                    <span role="columnheader" className="text-right">Laps</span>
                    <span role="columnheader" className="text-right">Avg lap</span>
                    <span role="columnheader" className="text-right">Best lap</span>
                    <span
                      role="columnheader"
                      className="text-right"
                      title="How evenly paced the driver's laps were (lower spread is better)"
                    >
                      Consistency
                    </span>
                    <span role="columnheader" className="text-right">Inc</span>
                  </div>
                </div>
                <div role="rowgroup">
                  {result.driverStints.map((stint) => {
                    const spreadMs = spreadByCust.get(stint.iracingCustId) ?? null;
                    const isFastest = bestLapOverall !== null && stint.bestLapTimeMs === bestLapOverall;
                    return (
                      <div
                        key={stint.id}
                        role="row"
                        className={`${GRID} row-hover min-h-[54px] border-t border-ds-line`}
                      >
                        <span role="cell" className="flex min-w-0 items-center gap-2.5 font-bold">
                          <span
                            className="size-2.5 flex-none"
                            style={{ background: colorForDriver(stint.iracingCustId) }}
                          />
                          <span className="min-w-0 truncate">
                            <DriverName
                              name={stint.displayName}
                              driverProfileId={stint.driverProfileId}
                              linkDrivers={linkDrivers}
                            />
                          </span>
                        </span>
                        <span role="cell" className="num text-right text-base">{stint.lapsComplete ?? '—'}</span>
                        <span role="cell" className="num text-right text-base">
                          {formatLapTime(stint.averageLapTimeMs)}
                        </span>
                        <span
                          role="cell"
                          className="num text-right text-base"
                          style={isFastest ? { color: '#c084fc' } : undefined}
                        >
                          {formatLapTime(stint.bestLapTimeMs)}
                        </span>
                        <span role="cell" className="num text-right text-base text-ds-muted">{formatLapSpread(spreadMs)}</span>
                        <span role="cell" className="text-right tabular-nums text-ds-muted">
                          {stint.incidents !== null ? `${stint.incidents}x` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
        )}

        {result.driverStints.length > 0 && (
          <section
            aria-labelledby="share-title"
            className="cut flex min-w-0 flex-[2_1_300px] flex-col gap-[18px] bg-ds-panel px-[22px] pb-[22px] pt-5"
          >
            <h2 id="share-title" className="h2">Share of the race</h2>
            <ShareBar
              title="Lap share"
              data={lapShareData}
              emptyMessage="No lap data available."
              formatValue={formatLaps}
            />
            <ShareBar
              title="Incident share"
              data={incidentShareData}
              emptyMessage="No incidents this race."
              formatValue={formatIncidents}
            />
          </section>
        )}
      </div>

      {result.laps.length > 0 && (
        <section aria-labelledby="bp-title" className="cut flex flex-col gap-3 bg-ds-panel px-[22px] py-5">
          <div className="flex flex-col gap-1">
            <h2 id="bp-title" className="h2">Lap times</h2>
            <span className="text-[13px] text-ds-muted">
              Box is the middle half of each driver’s laps, the white line is the median, whiskers reach the
              furthest normal lap. Pit and incident laps are counted on the right. Fastest median first.
            </span>
          </div>
          <LapTimeBoxPlot laps={result.laps} driverColors={driverColors} />
        </section>
      )}

      <section aria-labelledby="lt-title" className="cut flex flex-col gap-3 bg-ds-panel px-[22px] py-5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex flex-col gap-1">
            <h2 id="lt-title" className="h2">Stints, lap by lap</h2>
            {scatter && (
              <span className="text-[13px] text-ds-muted">
                {scatter.step === 1 ? 'Every lap shown' : `Every ${ordinal(scatter.step)} lap shown`} · pit laps and
                laps over {formatLapSeconds(scatter.thresholdMs)} hidden
              </span>
            )}
          </div>
          {result.driverStints.length > 0 && (
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 pt-1 text-xs text-ds-ink-soft">
              {result.driverStints.map((stint) => (
                <span key={stint.id} className="flex items-center gap-1.5">
                  <span className="size-2.5 flex-none" style={{ background: colorForDriver(stint.iracingCustId) }} />
                  {stint.displayName}
                </span>
              ))}
            </div>
          )}
        </div>

        {result.laps.length === 0 ? (
          <p className="m-0 text-sm text-ds-muted">No lap-by-lap data for this result.</p>
        ) : (
          <div>
            {scatter && (
              <div className="mb-4">
                <LapScatterChart model={scatter} driverColors={driverColors} />
              </div>
            )}
            <div className="cut-xs flex h-10 w-full overflow-hidden">
              {stints.map((stint, i) => (
                <div
                  key={stint.stintNumber}
                  style={{
                    width: `${(durations[i] / totalDuration) * 100}%`,
                    backgroundColor: colorForDriver(stint.iracingCustId),
                  }}
                  title={`Stint ${stint.stintNumber} — ${stint.displayName} — ${stint.laps.length} laps, ${formatDuration(durations[i])}`}
                  className="flex items-center justify-center truncate border-r-2 border-ds-panel text-[10px] font-bold text-on-accent last:border-r-0"
                >
                  {(durations[i] / totalDuration) * 100 > 5 ? `S${stint.stintNumber}` : ''}
                </div>
              ))}
            </div>

            <StintList stints={stints} durations={durations} driverColors={driverColors} linkDrivers={linkDrivers} />
          </div>
        )}
      </section>
    </div>
  );
}
