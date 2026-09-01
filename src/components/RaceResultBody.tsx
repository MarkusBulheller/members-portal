import { useState } from 'react';
import { Link } from 'react-router-dom';
import DriverShareChart from './DriverShareChart';
import LapTimeBoxPlot from './LapTimeBoxPlot';
import { formatDuration, formatLapTime, guessRaceLength } from '../lib/lapTime';
import { podiumColor } from '../lib/podium';
import { averageLapMs, buildDriverColorMap, computeStints, consistencyScore, stintDurationMs } from '../lib/stints';
import type { RaceResult } from '../types/raceResult';

function positionLabel(position: number | null): string {
  return position === null ? '—' : `P${position}`;
}

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
      <Link to={`/drivers/${driverProfileId}`} className="hover:text-w2w-red">
        {name}
      </Link>
    );
  }
  return <>{name}</>;
}

/** The full read-only body of a race result — stats grid, per-driver table, lap/incident share
 * charts, and the stint-by-stint timeline. Shared between RaceResultDetailPage (logged-in,
 * driver names link to their profile) and SharedRaceResultPage (public share link, no login
 * required — driver names render as plain text since the profile pages behind them are
 * login-gated). Page-level chrome (header, Export/Remove/Share buttons, the off-screen
 * PNG-export card) stays with each page since that's where they differ. */
export default function RaceResultBody({ result, linkDrivers }: { result: RaceResult; linkDrivers: boolean }) {
  const [expandedStint, setExpandedStint] = useState<string | null>(null);

  // Built once from the full driver list so every chart below (share charts, timeline, box
  // plot) agrees on one color per driver — see buildDriverColorMap().
  const driverColors = buildDriverColorMap(result.driverStints.map((s) => s.iracingCustId));
  const colorForDriver = (custId: number) => driverColors.get(custId) ?? '#7a8b99';

  const durationMs =
    result.startTime && result.endTime
      ? new Date(result.endTime).getTime() - new Date(result.startTime).getTime()
      : null;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 max-w-3xl">
        <div className="bg-w2w-charcoal border border-white/10 p-4">
          <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">Start</p>
          <p className="mt-1 font-display font-bold text-lg text-w2w-white whitespace-nowrap">
            {positionLabel(result.startingPositionInClass ?? result.startingPosition)}
          </p>
        </div>
        <div className="bg-w2w-charcoal border border-white/10 p-4">
          <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">Finish</p>
          <p
            className="mt-1 font-display font-bold text-lg whitespace-nowrap"
            style={{
              color: podiumColor(result.finishingPositionInClass ?? result.finishingPosition, 'var(--color-w2w-red)'),
            }}
          >
            {positionLabel(result.finishingPositionInClass ?? result.finishingPosition)}
          </p>
        </div>
        <div className="bg-w2w-charcoal border border-white/10 p-4">
          <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">Duration</p>
          <p className="mt-1 font-display font-bold text-lg text-w2w-white whitespace-nowrap">
            {guessRaceLength(durationMs)}
          </p>
        </div>
        <div className="bg-w2w-charcoal border border-white/10 p-4">
          <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">Laps</p>
          <p className="mt-1 font-display font-bold text-base text-w2w-white whitespace-nowrap">
            {result.teamLapsComplete ?? '—'}
            {result.totalLaps ? ` / ${result.totalLaps}` : ''}
          </p>
        </div>
        <div className="bg-w2w-charcoal border border-white/10 p-4">
          <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">Incidents</p>
          <p className="mt-1 font-display font-bold text-lg text-w2w-white whitespace-nowrap">
            {result.teamIncidents ?? '—'}
          </p>
        </div>
      </div>

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">Drivers</h2>

      {result.driverStints.length === 0 ? (
        <p className="text-white/65 text-sm">No per-driver data for this result.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-white/10">
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Driver
                </th>
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Laps
                </th>
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Avg Lap
                </th>
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Best Lap
                </th>
                <th className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">
                  Incidents
                </th>
                <th
                  className="py-2 pr-4 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase"
                  title="How evenly-paced this driver's clean laps were — 100 is metronomic, lower means more lap-to-lap variation. Pit laps and incidents are excluded."
                >
                  Consistency
                </th>
              </tr>
            </thead>
            <tbody>
              {result.driverStints.map((stint) => {
                const score = consistencyScore(result.laps.filter((l) => l.iracingCustId === stint.iracingCustId));
                return (
                  <tr key={stint.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-white">
                      <DriverName
                        name={stint.displayName}
                        driverProfileId={stint.driverProfileId}
                        linkDrivers={linkDrivers}
                      />
                    </td>
                    <td className="py-3 pr-4 text-white/70">{stint.lapsComplete ?? '—'}</td>
                    <td className="py-3 pr-4 text-white/70">{formatLapTime(stint.averageLapTimeMs)}</td>
                    <td className="py-3 pr-4 text-white/70">{formatLapTime(stint.bestLapTimeMs)}</td>
                    <td className="py-3 pr-4 text-white/70">{stint.incidents ?? '—'}</td>
                    <td className="py-3 pr-4 text-white/70">{score ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result.driverStints.length > 0 && (
        <div className="mt-8 grid sm:grid-cols-2 gap-8 max-w-2xl">
          <DriverShareChart
            title="Lap Share"
            data={result.driverStints
              .filter((stint) => (stint.lapsComplete ?? 0) > 0)
              .map((stint) => ({
                name: stint.displayName,
                value: stint.lapsComplete ?? 0,
                color: colorForDriver(stint.iracingCustId),
              }))}
            emptyMessage="No lap data available."
            formatValue={(v) => `${v} lap${v === 1 ? '' : 's'}`}
          />
          <DriverShareChart
            title="Incident Share"
            data={result.driverStints
              .filter((stint) => (stint.incidents ?? 0) > 0)
              .map((stint) => ({
                name: stint.displayName,
                value: stint.incidents ?? 0,
                color: colorForDriver(stint.iracingCustId),
              }))}
            emptyMessage="No incidents this race."
            formatValue={(v) => `${v} incident${v === 1 ? '' : 's'}`}
          />
        </div>
      )}

      {result.laps.length > 0 && (
        <>
          <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">
            Lap Times
          </h2>
          <div className="max-w-3xl">
            <LapTimeBoxPlot laps={result.laps} driverColors={driverColors} />
          </div>
        </>
      )}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">
        Stints (Lap-by-Lap)
      </h2>

      {result.laps.length === 0 ? (
        <p className="text-white/65 text-sm">No lap-by-lap data for this result.</p>
      ) : (
        (() => {
          const stints = computeStints(result.laps);
          const durations = stints.map((stint) => stintDurationMs(stint) ?? 0);
          const totalDuration = durations.reduce((sum, d) => sum + d, 0) || 1;

          return (
            <div>
              <div className="flex h-10 w-full overflow-hidden border border-white/10">
                {stints.map((stint, i) => (
                  <div
                    key={stint.stintNumber}
                    style={{
                      width: `${(durations[i] / totalDuration) * 100}%`,
                      backgroundColor: colorForDriver(stint.iracingCustId),
                    }}
                    title={`Stint ${stint.stintNumber} — ${stint.displayName} — ${stint.laps.length} laps, ${formatDuration(durations[i])}`}
                    className="flex items-center justify-center text-[10px] text-on-accent font-heading truncate border-r border-black/30 last:border-r-0"
                  >
                    {(durations[i] / totalDuration) * 100 > 5 ? `S${stint.stintNumber}` : ''}
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {stints.map((stint, i) => {
                  const key = `stint-${stint.stintNumber}`;
                  const isExpanded = expandedStint === key;
                  const first = stint.laps[0];
                  const last = stint.laps[stint.laps.length - 1];
                  return (
                    <div
                      key={key}
                      className="bg-w2w-charcoal border border-white/10 p-3"
                      style={{ borderLeftWidth: 3, borderLeftColor: colorForDriver(stint.iracingCustId) }}
                    >
                      <div className="w-full flex items-center justify-between gap-3">
                        <span className="text-white text-sm truncate min-w-0">
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
                          className="flex items-center gap-3 text-left shrink-0 hover:text-w2w-red transition-colors"
                        >
                          <span className="text-white/65 text-xs">
                            (L{first.lapNumber}–{last.lapNumber})
                          </span>
                          <span className="text-white/65 text-xs">
                            {stint.laps.length} lap{stint.laps.length === 1 ? '' : 's'} ·{' '}
                            {formatDuration(durations[i])} · avg {formatLapTime(averageLapMs(stint.laps))}
                          </span>
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
                          {stint.laps.map((lap) => (
                            <div
                              key={lap.id}
                              className="flex items-center justify-between text-xs text-white/60 px-1 py-0.5"
                            >
                              <span>Lap {lap.lapNumber}</span>
                              <span className="flex items-center gap-1.5">
                                {lap.incident && <span className="text-w2w-red">!</span>}
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
            </div>
          );
        })()
      )}
    </div>
  );
}
