import type { RecapAward, RecapStats } from '../types/recap';
import {
  formatCount,
  formatDecimal,
  formatHours,
  formatRecapDate,
  monthLong,
  ordinal,
  pluralize,
  sharePct,
  wholeHours,
} from './recapFormat';

export type RecapCardKey = 'numbers' | 'podiums' | 'tracks' | 'cars' | 'longest' | 'crew' | 'awards' | 'closing';

export interface RecapBar {
  label: string;
  /** Right-aligned figure, e.g. "12 races" or "41h 5m". */
  display: string;
  /** Smaller line under the label. */
  sub: string | null;
  /** Bar length relative to the largest value in the group. */
  value: number;
}

export interface RecapBarGroup {
  heading: string;
  bars: RecapBar[];
}

export interface RecapDateTile {
  label: string;
  value: string;
  sub: string | null;
}

/** Everything one story card shows. Both the on-page card and the exported share image render from
 * this, so the two can never disagree. */
export interface RecapCardModel {
  key: RecapCardKey;
  title: string;
  /** The big accent figure and what it counts. */
  big: string;
  bigLabel: string;
  line: string;
  stats: { label: string; value: string }[];
  groups: RecapBarGroup[];
  months: RecapStats['byMonth'] | null;
  awards: RecapAward[];
  dates: RecapDateTile[];
}

export function teamLabel(stats: RecapStats): string {
  return stats.teamName ?? 'All W2W teams';
}

function empty(key: RecapCardKey, title: string): RecapCardModel {
  return { key, title, big: '', bigLabel: '', line: '', stats: [], groups: [], months: null, awards: [], dates: [] };
}

/** Bar length in percent against the group's largest value (a floor keeps a tiny bar visible). */
export function barPercent(value: number, bars: RecapBar[]): number {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return Math.max(2, Math.round((value / max) * 100));
}

function raceWord(count: number): string {
  return count === 1 ? 'race' : 'races';
}

/** The ordered story cards for a recap. Cards with nothing to say (no cars, no awards...) are left
 * out rather than shown empty. Returns [] when the year has no races. */
export function buildRecapCards(stats: RecapStats): RecapCardModel[] {
  const { totals } = stats;
  if (totals.races === 0) return [];
  const who = teamLabel(stats);
  const cards: RecapCardModel[] = [];

  {
    const card = empty('numbers', 'The year in numbers');
    card.big = formatCount(totals.races);
    card.bigLabel = raceWord(totals.races);
    card.line = `${who} hit the track ${pluralize(totals.races, 'time')} in ${stats.year}.`;
    if (wholeHours(totals.driveMs) > 0) {
      card.line += ` That is ${formatCount(wholeHours(totals.driveMs))} hours at the wheel.`;
    }
    card.stats = [
      { label: 'Hours driven', value: formatHours(totals.driveMs) },
      { label: 'Laps', value: formatCount(totals.laps) },
      { label: 'Incidents', value: formatCount(totals.incidents) },
      { label: 'Incidents per race', value: formatDecimal(totals.avgIncidentsPerRace) },
    ];
    cards.push(card);
  }

  {
    const card = empty('podiums', 'Podium finishes');
    card.big = formatCount(totals.podiums);
    card.bigLabel = totals.podiums === 1 ? 'podium finish' : 'podium finishes';
    card.line = stats.bestResult
      ? `Best result: ${ordinal(stats.bestResult.position)} at ${stats.bestResult.trackName}${
          stats.bestResult.seriesName ? ` (${stats.bestResult.seriesName})` : ''
        }.`
      : 'No classified finishes this year.';
    card.stats = [
      { label: 'Wins', value: formatCount(totals.wins) },
      { label: 'Top 10s', value: formatCount(totals.topTens) },
      { label: 'Best finish', value: totals.bestFinish !== null ? `P${totals.bestFinish}` : '—' },
      { label: 'Average finish', value: totals.avgFinish !== null ? `P${formatDecimal(totals.avgFinish)}` : '—' },
    ];
    cards.push(card);
  }

  if (stats.topTracks.length > 0) {
    const card = empty('tracks', 'Where we raced');
    const top = stats.topTracks[0];
    card.big = formatCount(top.races);
    card.bigLabel = `${raceWord(top.races)} at ${top.name}`;
    const busiest = stats.byMonth.reduce((best, m) => (m.races > best.races ? m : best), stats.byMonth[0]);
    card.line =
      busiest && busiest.races > 0
        ? `Busiest month: ${monthLong(busiest.month)}, with ${pluralize(busiest.races, 'race')}.`
        : '';
    card.groups = [
      {
        heading: 'Most-raced tracks',
        bars: stats.topTracks.map((t) => ({
          label: t.name,
          display: pluralize(t.races, 'race'),
          sub: t.bestFinish !== null ? `Best finish P${t.bestFinish}` : null,
          value: t.races,
        })),
      },
    ];
    card.months = stats.byMonth;
    cards.push(card);
  }

  if (stats.topCars.length > 0 || stats.topSeries.length > 0) {
    const card = empty('cars', 'What we drove');
    const topCar = stats.topCars[0];
    const topSeries = stats.topSeries[0];
    card.big = formatCount(topCar ? topCar.races : topSeries.races);
    card.bigLabel = topCar
      ? `${raceWord(topCar.races)} in the ${topCar.name}`
      : `${raceWord(topSeries.races)} in ${topSeries.name}`;
    card.line = topSeries && topCar ? `Mostly in ${topSeries.name}.` : '';
    if (stats.topCars.length > 0) {
      card.groups.push({
        heading: 'Cars',
        bars: stats.topCars.map((c) => ({
          label: c.name,
          display: pluralize(c.races, 'race'),
          sub: c.bestFinish !== null ? `Best finish P${c.bestFinish}` : null,
          value: c.races,
        })),
      });
    }
    if (stats.topSeries.length > 0) {
      card.groups.push({
        heading: 'Series',
        bars: stats.topSeries.map((s) => ({
          label: s.name,
          display: pluralize(s.races, 'race'),
          sub: null,
          value: s.races,
        })),
      });
    }
    cards.push(card);
  }

  if (stats.longestRace) {
    const race = stats.longestRace;
    const card = empty('longest', 'The longest race');
    const length = race.durationMs ?? race.driveMs;
    if (length !== null && length > 0) {
      card.big = formatHours(length);
      card.bigLabel = race.trackName;
    } else {
      card.big = formatCount(race.lapsComplete);
      card.bigLabel = `laps at ${race.trackName}`;
    }
    card.line = [race.seriesName, formatRecapDate(race.date)].filter(Boolean).join(' · ');
    card.stats = [
      { label: 'Team laps', value: formatCount(race.lapsComplete) },
      { label: 'Time at the wheel', value: race.driveMs !== null ? formatHours(race.driveMs) : '—' },
    ];
    cards.push(card);
  }

  if (stats.drivers.length > 0) {
    const card = empty('crew', 'The crew');
    const driveTotal = stats.drivers.reduce((sum, d) => sum + d.driveMs, 0);
    card.big = formatCount(stats.drivers.length);
    card.bigLabel = stats.drivers.length === 1 ? 'driver' : 'drivers shared the driving';
    const top = stats.drivers[0];
    card.line =
      stats.drivers.length > 1 && driveTotal > 0
        ? `${top.name} led the way with ${sharePct(top.driveMs, driveTotal)}% of the driving.`
        : `${top.name} drove it all.`;
    card.groups = [
      {
        heading: 'Share of driving time',
        bars: stats.drivers.map((d) => ({
          label: d.name,
          display: formatHours(d.driveMs),
          sub: `${sharePct(d.driveMs, driveTotal)}% · ${pluralize(d.laps, 'lap')} · ${pluralize(d.incidents, 'incident')}`,
          value: d.driveMs,
        })),
      },
    ];
    cards.push(card);
  }

  if (stats.awards.length > 0) {
    const card = empty('awards', 'Awards');
    card.big = formatCount(stats.awards.length);
    card.bigLabel = stats.awards.length === 1 ? 'award' : 'awards';
    card.line = 'Decided by the numbers, not by a vote.';
    card.awards = stats.awards;
    cards.push(card);
  }

  {
    const card = empty('closing', 'That is a wrap');
    card.big = String(stats.year);
    card.bigLabel = 'See you next season';
    card.line = `Thanks for a great ${stats.year}.`;
    const { firstRace, lastRace } = stats.firsts;
    if (firstRace) {
      card.dates.push({ label: 'First race', value: formatRecapDate(firstRace.date), sub: firstRace.trackName });
    }
    if (lastRace) {
      card.dates.push({ label: 'Latest race', value: formatRecapDate(lastRace.date), sub: lastRace.trackName });
    }
    cards.push(card);
  }

  return cards;
}
