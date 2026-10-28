import { memo } from 'react';
import { Link } from 'react-router-dom';
import { formatLapTime } from '../lib/lapTime';
import {
  formatAvgPosition,
  formatDecimal,
  formatDriveTime,
  pluralRaces,
  type DriverBestGroup,
  type DriverStatGroup,
  type DriverStats,
} from '../lib/driverStats';

interface Tile {
  label: string;
  value: string;
  sub?: string | null;
  /** Long values (car / track names) use a smaller numeral so they wrap instead of overflowing. */
  text?: boolean;
}

function bestSub(best: DriverBestGroup | null): string | null {
  if (!best) return null;
  const { group, basis } = best;
  return basis === 'average'
    ? `${pluralRaces(group.races)} · avg ${formatAvgPosition(group.avgFinish)}`
    : `${pluralRaces(group.races)} · best ${formatAvgPosition(group.bestFinish)}`;
}

function drivenSub(group: DriverStatGroup | null, rankBy: DriverStats['rankBy']): string | null {
  if (!group) return null;
  return rankBy === 'time' && group.driveMs > 0
    ? `${formatDriveTime(group.driveMs)} · ${pluralRaces(group.races)}`
    : pluralRaces(group.races);
}

function buildTiles(stats: DriverStats): Tile[] {
  const none = '—';
  return [
    { label: 'Events driven', value: String(stats.events) },
    { label: 'Laps driven', value: stats.laps > 0 ? stats.laps.toLocaleString('en-US') : none },
    {
      label: 'Driving time',
      value: formatDriveTime(stats.drivenMs),
      sub:
        stats.drivenMs !== null && stats.timedEvents < stats.events
          ? `${stats.timedEvents} of ${stats.events} events have timing`
          : null,
    },
    {
      label: 'Average driving time',
      value: formatDriveTime(stats.avgStintMs),
      sub: stats.avgStintMs !== null ? 'per race' : null,
    },
    {
      label: 'Longest driving time',
      value: formatDriveTime(stats.longestRace?.ms ?? null),
      sub: stats.longestRace?.where,
    },
    {
      label: 'Best finish',
      value: stats.bestFinish ? `P${stats.bestFinish.position}` : none,
      sub: stats.bestFinish?.where,
    },
    {
      label: 'Podiums',
      value: stats.rankedRaces > 0 ? String(stats.podiums) : none,
      sub: stats.rankedRaces > 0 ? `${stats.wins} win${stats.wins === 1 ? '' : 's'}` : null,
    },
    {
      label: 'Average finish',
      value: formatAvgPosition(stats.avgFinish),
      sub: stats.rankedRaces > 0 ? `over ${pluralRaces(stats.rankedRaces)}` : null,
    },
    {
      label: 'Incidents per race',
      value: formatDecimal(stats.incidentsPerRace),
      sub: stats.incidentsPerRace !== null ? `${stats.totalIncidents.toLocaleString('en-US')}x in total` : null,
    },
    {
      label: 'Fastest lap',
      value: stats.fastestLap ? formatLapTime(stats.fastestLap.ms) : none,
      sub: stats.fastestLap?.where,
    },
    {
      label: 'Most driven car',
      value: stats.mostDrivenCar?.name ?? none,
      sub: drivenSub(stats.mostDrivenCar, stats.rankBy),
      text: true,
    },
    { label: 'Best car', value: stats.bestCar?.group.name ?? none, sub: bestSub(stats.bestCar), text: true },
    {
      label: 'Most driven track',
      value: stats.mostDrivenTrack?.name ?? none,
      sub: drivenSub(stats.mostDrivenTrack, stats.rankBy),
      text: true,
    },
    { label: 'Best track', value: stats.bestTrack?.group.name ?? none, sub: bestSub(stats.bestTrack), text: true },
  ];
}

function RankedList({
  title,
  groups,
  rankBy,
  hrefBase,
}: {
  title: string;
  groups: DriverStatGroup[];
  rankBy: DriverStats['rankBy'];
  hrefBase: '/cars' | '/tracks';
}) {
  const metric = (g: DriverStatGroup) => (rankBy === 'time' ? g.driveMs : g.races);
  const max = groups.reduce((m, g) => Math.max(m, metric(g)), 0);

  return (
    <div className="cut flex flex-col bg-ds-panel pb-1.5 pt-4">
      <h3 className="m-0 px-4 pb-2.5 text-sm font-bold text-ds-ink">{title}</h3>
      {groups.length === 0 ? (
        <p className="m-0 px-4 pb-3 text-[13px] text-ds-muted">No data yet.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {groups.map((group) => {
            const body = (
              <>
                <span className="flex items-baseline gap-2.5">
                  <span className="min-w-0 flex-1 truncate font-bold">{group.name}</span>
                  <span className="num shrink-0 text-[15px]">
                    {rankBy === 'time' ? formatDriveTime(group.driveMs) : pluralRaces(group.races)}
                  </span>
                </span>
                <span className="text-xs text-ds-muted">
                  {rankBy === 'time' ? `${pluralRaces(group.races)}` : null}
                  {rankBy === 'time' && group.avgFinish !== null ? ' · ' : null}
                  {group.avgFinish !== null ? `avg ${formatAvgPosition(group.avgFinish)}` : null}
                </span>
                <span className="h-1 bg-ds-control" aria-hidden="true">
                  <span
                    className="block h-full bg-w2w-red"
                    style={{ width: `${max > 0 ? (metric(group) / max) * 100 : 0}%` }}
                  />
                </span>
              </>
            );
            const rowClass = 'flex flex-col gap-1 border-t border-ds-line px-4 py-2.5 text-[13px] text-ds-ink';
            return (
              <li key={group.key}>
                {group.id ? (
                  <Link to={`${hrefBase}/${group.id}`} className={`${rowClass} row-hover`}>
                    {body}
                  </Link>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** "Driving stats" for the driver profile: a grid of stat tiles plus the top cars/tracks by
 * driving time. Pure presentation of `computeDriverStats()`'s result. */
function DriverStatsSection({ stats }: { stats: DriverStats }) {
  const hasRaces = stats.events > 0;
  return (
    <section aria-labelledby="driving-stats-title" className="flex flex-col gap-3.5 pt-2">
      <div className="flex flex-col gap-0.5">
        <h2 id="driving-stats-title" className="h2" style={{ fontSize: 24 }}>
          Driving stats
        </h2>
        <span className="text-[13px] text-ds-muted">
          Across all recorded races · positions use the class result where available
        </span>
      </div>
      {!hasRaces ? (
        <p className="m-0 text-sm text-ds-muted">Stats appear once this driver has a race result.</p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-3">
            {buildTiles(stats).map((tile) => (
              <div key={tile.label} className="cut flex min-w-0 flex-col gap-0.5 bg-ds-panel px-[18px] py-4">
                <dt className="text-[13px] font-semibold text-ds-muted">{tile.label}</dt>
                <dd
                  className={`num m-0 break-words ${
                    tile.text ? 'text-xl leading-[1.2]' : 'text-4xl leading-[1.1]'
                  }`}
                  title={tile.text && tile.value !== '—' ? tile.value : undefined}
                >
                  {tile.value}
                </dd>
                {tile.sub && <dd className="m-0 break-words text-xs text-ds-muted">{tile.sub}</dd>}
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-3">
            <RankedList title="Cars" groups={stats.topCars} rankBy={stats.rankBy} hrefBase="/cars" />
            <RankedList title="Tracks" groups={stats.topTracks} rankBy={stats.rankBy} hrefBase="/tracks" />
          </div>
        </>
      )}
    </section>
  );
}

export default memo(DriverStatsSection);
