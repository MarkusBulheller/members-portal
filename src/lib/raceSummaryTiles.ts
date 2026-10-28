import { formatDriveTime, formatDecimal } from './driverStats';
import { formatDuration, formatLapSpread, formatLapTime } from './lapTime';
import {
  formatPaceDelta,
  formatPercent,
  formatRank,
  paceVerdictLabel,
  type RaceSummary,
} from './raceSummary';

export type SummaryTileKey =
  | 'stints'
  | 'laps'
  | 'drive'
  | 'pace'
  | 'best'
  | 'consistency'
  | 'incidents'
  | 'share';

export interface SummaryTile {
  key: SummaryTileKey;
  label: string;
  value: string;
  /** Small explanatory line under the value; '' when there is nothing true to say. */
  sub: string;
}

/** The tiles of the "Your race" panel and the share card, in display order. Every value is
 * formatted from `RaceSummary`; unknown data renders as an em dash with an empty sub line. */
export function buildSummaryTiles(summary: RaceSummary): SummaryTile[] {
  const s = summary;
  const longest =
    s.longestStint !== null
      ? `longest ${s.longestStint.laps} lap${s.longestStint.laps === 1 ? '' : 's'}${
          s.longestStint.ms !== null ? ` · ${formatDuration(s.longestStint.ms)}` : ''
        }`
      : '';
  const pace = s.paceDeltaMs !== null ? formatPaceDelta(s.paceDeltaMs) : formatLapTime(s.avgLapMs);
  const paceSub =
    s.paceDeltaMs !== null
      ? `${paceVerdictLabel(s.paceVerdict)} · avg ${formatLapTime(s.avgLapMs)}`
      : s.avgLapMs !== null
        ? 'average lap'
        : '';
  const rate: string[] = [];
  if (s.incidentsPer100Laps !== null) rate.push(`${formatDecimal(Math.round(s.incidentsPer100Laps * 10) / 10)} per 100 laps`);
  if (s.incidentsPerHour !== null) rate.push(`${formatDecimal(Math.round(s.incidentsPerHour * 10) / 10)} per hour`);
  const consistencyRank = formatRank(s.spreadRank, 'best');

  return [
    { key: 'stints', label: 'Stints', value: s.hasLapData ? String(s.stintCount) : '—', sub: longest },
    {
      key: 'laps',
      label: 'Laps',
      value: String(s.laps),
      sub: s.timedLaps > 0 ? `${s.cleanLaps} clean of ${s.timedLaps} timed` : '',
    },
    {
      key: 'drive',
      label: 'Drive time',
      value: formatDriveTime(s.driveMs),
      sub: s.timeShare !== null ? `${formatPercent(s.timeShare)} of the team’s driving` : '',
    },
    {
      key: 'pace',
      label: s.paceDeltaMs !== null ? 'Pace vs team' : 'Average lap',
      value: pace,
      sub: paceSub,
    },
    {
      key: 'best',
      label: 'Best lap',
      value: formatLapTime(s.bestLapMs),
      sub: formatRank(s.bestLapRank),
    },
    {
      key: 'consistency',
      label: 'Consistency',
      value: formatLapSpread(s.spreadMs),
      sub: s.spreadMs === null ? '' : consistencyRank ? `${consistencyRank} · lower is better` : 'lower is better',
    },
    {
      key: 'incidents',
      label: 'Incidents',
      value: s.incidents !== null ? `${s.incidents}x` : '—',
      sub: rate.join(' · '),
    },
    {
      key: 'share',
      label: 'Share of race',
      value: formatPercent(s.lapShare),
      sub: s.lapShare !== null ? 'of the team’s laps' : '',
    },
  ];
}
