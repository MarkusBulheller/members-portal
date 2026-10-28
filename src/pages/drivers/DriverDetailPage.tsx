import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AchievementIconView from '../../components/AchievementIcon';
import CountryFlag from '../../components/CountryFlag';
import DriverStatsSection from '../../components/DriverStats';
import { positionLabel } from '../../components/RaceResultRow';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { achievementsApi } from '../../lib/api/achievements';
import { ApiError, resolveAssetUrl } from '../../lib/api';
import { driversApi } from '../../lib/api/drivers';
import { raceResultsApi } from '../../lib/api/raceResults';
import { computeDriverStats } from '../../lib/driverStats';
import { formatDuration } from '../../lib/lapTime';
import { licenseClassStyle } from '../../lib/iracingClass';
import { initials } from '../../lib/initials';
import { formatTimezoneLabel } from '../../lib/timezone';
import { usePagination } from '../../lib/usePagination';
import type { AchievementAward, AchievementDefinition, AchievementMetric } from '../../types/achievement';
import type { DriverProfile } from '../../types/driver';
import type { RaceResult } from '../../types/raceResult';

const METRIC_UNIT: Record<AchievementMetric, string> = {
  LAPS: 'laps',
  WINS: 'wins',
  PODIUMS: 'podiums',
  DISTINCT_CARS_RACED: 'cars',
  DISTINCT_CARS_WON: 'cars',
  TRACK_WIN: 'wins',
  MANUAL: '',
};

/** Medal colours are the same in both themes (the boards hardcode them); text on them is #111113. */
const MEDAL = { gold: '#e8c34a', silver: '#c7cbd1', bronze: '#cd8a4e' } as const;
const MEDAL_INK = '#111113';
const LOCKED_ICON = '#5a5a60';

/** Only the highest tier a driver has earned per definition is worth showing on the profile —
 * e.g. Century Club Gold implies Bronze/Silver were earned along the way too. Tiers are always
 * created/edited in ascending order (see AchievementsAdminPage), so the highest sortOrder is the
 * highest tier regardless of metric, MANUAL definitions included. */
function highestAwardsByDefinition(awards: AchievementAward[]): AchievementAward[] {
  const best = new Map<string, AchievementAward>();
  for (const award of awards) {
    const current = best.get(award.tier.definitionId);
    if (!current || award.tier.sortOrder > current.tier.sortOrder) {
      best.set(award.tier.definitionId, award);
    }
  }
  return [...best.values()];
}

/** Mirrors AchievementsService.computeDriverTotals() but runs client-side against the driver's
 * own already-loaded race results, so the "all achievements" progress view doesn't need a
 * dedicated endpoint. */
function computeProgress(definition: AchievementDefinition, driverId: string, races: RaceResult[]): number {
  if (definition.metric === 'DISTINCT_CARS_RACED' || definition.metric === 'DISTINCT_CARS_WON') {
    const cars = new Set<string>();
    for (const race of races) {
      const stint = race.driverStints.find((s) => s.driverProfileId === driverId);
      if (!stint) continue;
      if (definition.metric === 'DISTINCT_CARS_WON' && stint.finishingPosition !== 1) continue;
      const carKey = race.carId ?? race.carName;
      if (carKey) cars.add(carKey);
    }
    return cars.size;
  }

  let total = 0;
  for (const race of races) {
    const stint = race.driverStints.find((s) => s.driverProfileId === driverId);
    if (!stint) continue;
    if (definition.metric === 'LAPS') total += stint.lapsComplete ?? 0;
    else if (definition.metric === 'WINS' && stint.finishingPosition === 1) total += 1;
    else if (definition.metric === 'PODIUMS' && stint.finishingPosition !== null && stint.finishingPosition <= 3) total += 1;
    else if (definition.metric === 'TRACK_WIN' && stint.finishingPosition === 1 && race.trackId === definition.trackId)
      total += 1;
  }
  return total;
}

/** Tier labels are free text, so colour by the familiar names and otherwise by rank within the
 * definition (lowest = bronze, highest = gold). */
function tierColor(label: string, index: number, count: number): string {
  const l = label.toLowerCase();
  if (l.includes('bronze')) return MEDAL.bronze;
  if (l.includes('silver')) return MEDAL.silver;
  if (l.includes('gold') || l.includes('winner')) return MEDAL.gold;
  if (count <= 1 || index === count - 1) return MEDAL.gold;
  return index === 0 ? MEDAL.bronze : MEDAL.silver;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSyncDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface AchievementCard {
  definition: AchievementDefinition;
  /** Highest earned award for this definition, null while still locked. */
  award: AchievementAward | null;
  tierLabel: string;
  color: string;
  pct: number;
  nextText: string;
}

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [races, setRaces] = useState<RaceResult[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [racesError, setRacesError] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [showAchievements, setShowAchievements] = useState<'all' | 'earned'>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  // Bumping `reloadTick` re-runs the load effect (after revoking an award); a response only lands
  // if the effect hasn't been cleaned up since (driver id changed / newer reload / unmount).
  const [reloadTick, setReloadTick] = useState(0);
  const loadDriver = () => setReloadTick((tick) => tick + 1);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    driversApi
      .getById(id)
      .then((loaded) => {
        if (cancelled) return;
        setDriver(loaded);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load the driver.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadTick]);

  useEffect(() => {
    let cancelled = false;
    achievementsApi
      .listDefinitions()
      .then((loaded) => {
        if (!cancelled) setDefinitions(loaded);
      })
      .catch(() => undefined); // locked-achievement progress just stays hidden
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleResync() {
    if (!driver || syncing) return;
    setSyncing(true);
    setSyncError(null);
    setSyncNote(null);
    try {
      const updated = await driversApi.resyncIracing(driver.id);
      // The server skips the iRacing call when the stats were synced a few minutes ago.
      if (updated.iracingStatsSyncedAt === driver.iracingStatsSyncedAt) {
        setSyncNote('Already up to date — synced a moment ago.');
      }
      setDriver(updated);
    } catch (err) {
      setSyncError(err instanceof ApiError ? err.message : 'Could not re-sync the iRacing stats.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleRevokeAward(award: AchievementAward) {
    const ok = await confirm(`Revoke "${award.tier.definition.name} — ${award.tier.label}"?`, { confirmLabel: 'Revoke' });
    if (!ok) return;
    await achievementsApi.revokeAward(award.id);
    loadDriver();
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    raceResultsApi
      .listByDriver(id)
      .then((loaded) => {
        if (cancelled) return;
        setRaces(loaded);
        setRacesError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRacesError(err instanceof Error ? err.message : 'Failed to load races.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const { page, setPage, totalPages, pageItems: pagedRaces } = usePagination(races);

  // The results list can be long; recompute only when the loaded races or the driver change.
  const driverStats = useMemo(() => (races && id ? computeDriverStats(races, id) : null), [races, id]);

  if (!driver) {
    return loadError ? (
      <p role="alert" className="m-0 text-sm text-ds-danger">
        {loadError}
      </p>
    ) : (
      <p className="m-0 text-sm text-ds-muted">Loading...</p>
    );
  }

  const bestAwards = highestAwardsByDefinition(driver.awards ?? []);
  const bestByDefinition = new Map(bestAwards.map((a) => [a.tier.definitionId, a]));

  // Every definition (so locked ones show their progress), plus any earned definition the list
  // hasn't loaded yet — the award carries its own definition + tiers.
  const allDefinitions = [...definitions];
  for (const award of bestAwards) {
    if (!allDefinitions.some((d) => d.id === award.tier.definitionId)) allDefinitions.push(award.tier.definition);
  }

  const cards: AchievementCard[] = allDefinitions.map((definition) => {
    const tiers = [...definition.tiers].sort((a, b) => a.sortOrder - b.sortOrder);
    const award = bestByDefinition.get(definition.id) ?? null;
    const unit = METRIC_UNIT[definition.metric];
    const current = computeProgress(definition, driver.id, races ?? []);
    const next = award ? tiers.find((t) => t.sortOrder > award.tier.sortOrder) : tiers[0];
    const earnedIndex = award ? tiers.findIndex((t) => t.id === award.tierId) : -1;
    const shown = award ? award.tier : null;

    let pct: number;
    let nextText: string;
    if (!next) {
      pct = 100;
      nextText =
        definition.metric === 'MANUAL'
          ? 'Top tier reached'
          : `Top tier reached · ${current.toLocaleString('en-US')} ${unit}`;
    } else if (next.threshold !== null && definition.metric !== 'MANUAL') {
      pct = Math.round(Math.min(current / next.threshold, 1) * 100);
      nextText = `${Math.min(current, next.threshold).toLocaleString('en-US')} / ${next.threshold.toLocaleString('en-US')} ${unit} to ${next.label}`;
    } else {
      pct = tiers.length > 0 ? Math.round(((earnedIndex + 1) / tiers.length) * 100) : 0;
      nextText = 'Handed out by admins for special efforts';
    }

    return {
      definition,
      award,
      tierLabel: shown ? shown.label : 'Locked',
      color: shown ? tierColor(shown.label, earnedIndex, tiers.length) : LOCKED_ICON,
      pct,
      nextText,
    };
  });

  const visibleCards = cards
    .filter((c) => showAchievements === 'all' || c.award !== null)
    .sort((a, b) => {
      if (a.award && b.award) return new Date(b.award.achievedAt).getTime() - new Date(a.award.achievedAt).getTime();
      if (a.award) return -1;
      if (b.award) return 1;
      return a.definition.name.localeCompare(b.definition.name);
    });

  const displayName = driver.iracingName ?? driver.displayName;
  const isOwn = driver.userId !== null && driver.userId === user?.id;
  const canResync = driver.userId !== null && (isOwn || user?.role === 'ADMIN');
  const details =
    [driver.iracingLocation ?? driver.country, driver.preferredClasses, formatTimezoneLabel(driver.timezone)]
      .filter(Boolean)
      .join(' · ') || 'No details set';
  const planningTags = [
    driver.startingDriver && 'Starting driver',
    driver.wetDriver && 'Wet driver',
    driver.nightDriver && 'Night driver',
    driver.maxSuccessiveStints !== null &&
      `Max ${driver.maxSuccessiveStints} stint${driver.maxSuccessiveStints === 1 ? '' : 's'} in a row`,
  ].filter((t): t is string => Boolean(t));

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] font-semibold text-ds-muted">
        <Link to="/drivers" className="text-ds-muted hover:text-ds-ink">
          Drivers
        </Link>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="text-ds-ink">{displayName}</span>
      </nav>

      <header className="cut-lg relative flex flex-wrap items-center justify-between gap-[22px] bg-ds-panel py-7 pl-5 pr-[64px] sm:pl-[30px] sm:pr-[200px]">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-10 sm:w-40"
          style={{
            background:
              'linear-gradient(110deg, transparent 0 28%, var(--color-w2w-red) 28% 40%, transparent 40% 50%, var(--color-w2w-red) 50% 100%)',
          }}
        />
        <div className="relative flex min-w-0 flex-wrap items-center gap-[22px]">
          {driver.avatarUrl ? (
            <img
              src={resolveAssetUrl(driver.avatarUrl)}
              alt=""
              width={88}
              height={88}
              decoding="async"
              className="cut-xs h-[88px] w-[88px] shrink-0 bg-ds-field object-cover"
            />
          ) : (
            <span className="cut-xs flex h-[88px] w-[88px] shrink-0 items-center justify-center bg-w2w-red text-[34px] font-black italic text-on-accent">
              {initials(driver.displayName)}
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <CountryFlag countryCode={driver.iracingCountryCode} className="shrink-0 text-[18px]" />
              <h1 className="m-0 min-w-0 break-words text-[32px] font-extrabold leading-none sm:text-[40px]">
                {displayName}
              </h1>
              <span className={`chip py-[3px] ${driver.userId ? 'chip-accent' : ''}`}>
                {driver.userId ? 'Portal member' : 'Manually added'}
              </span>
            </div>
            {driver.iracingName && driver.iracingName !== driver.displayName && (
              <span className="text-xs text-ds-muted">"{driver.displayName}"</span>
            )}
            <span className="text-ds-muted">{details}</span>
            {planningTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {planningTags.map((tag) => (
                  <span key={tag} className="chip chip-sm">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {(isOwn || user?.role === 'ADMIN') && (
          <Link
            to={
              isOwn
                ? '/drivers/me/edit'
                : driver.userId
                  ? `/drivers/${driver.id}/edit-settings`
                  : `/drivers/${driver.id}/edit`
            }
            className="btn-secondary relative"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="square"
              strokeLinejoin="miter"
              aria-hidden="true"
            >
              <path d="M4 20h4L19 9l-4-4L4 16z" />
            </svg>
            Edit profile
          </Link>
        )}
      </header>

      {driver.bio && <p className="m-0 max-w-2xl text-sm leading-relaxed text-ds-ink-soft">{driver.bio}</p>}

      {driver.iracingCustomerId && (
        <section aria-label="iRacing stats" className="flex flex-wrap gap-3">
          <div className="cut flex flex-[1_1_200px] flex-col gap-0.5 bg-ds-panel px-[18px] py-4">
            <span className="text-[13px] font-semibold text-ds-muted">Sports car iRating</span>
            <span className="num text-4xl leading-[1.1]">
              {driver.sportsCarIrating !== null ? driver.sportsCarIrating.toLocaleString('en-US') : '—'}
            </span>
          </div>
          <div className="cut flex flex-[1_1_200px] flex-col gap-1.5 bg-ds-panel px-[18px] py-4">
            <span className="text-[13px] font-semibold text-ds-muted">Safety rating</span>
            {driver.sportsCarSafetyRating ? (
              <span
                className="slant num self-start whitespace-nowrap px-4 py-0.5 text-[26px] leading-[1.2]"
                style={licenseClassStyle(driver.sportsCarSafetyRating)}
              >
                {driver.sportsCarSafetyRating}
              </span>
            ) : (
              <span className="num text-[26px] leading-[1.2]">—</span>
            )}
          </div>
          <div className="cut flex flex-[2_1_320px] flex-wrap items-center justify-between gap-3.5 bg-ds-panel px-[18px] py-4">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-ds-muted">iRacing account</span>
              <span className="flex items-center gap-2 font-bold">
                <span aria-hidden="true" className="h-2 w-2 -skew-x-[20deg] bg-[#22c55e]" />
                Linked
              </span>
              <span className="text-xs text-ds-dim">Customer ID #{driver.iracingCustomerId}</span>
              {driver.iracingStatsSyncedAt && (
                <span className="text-xs text-ds-dim">
                  Synced {formatSyncDay(driver.iracingStatsSyncedAt)}
                  {driver.userId
                    ? ' · updates weekly'
                    : " · manually added drivers don't auto-update — re-pick them via Edit to refresh"}
                </span>
              )}
              {syncNote && (
                <span role="status" className="text-xs text-ds-muted">
                  {syncNote}
                </span>
              )}
              {syncError && (
                <span role="alert" className="text-xs text-ds-danger">
                  {syncError}
                </span>
              )}
            </div>
            {canResync && (
              <button
                type="button"
                onClick={() => void handleResync()}
                disabled={syncing}
                aria-busy={syncing}
                className="btn-secondary min-h-10 px-[18px] text-[13px]"
              >
                {syncing ? 'Syncing...' : 'Re-sync now'}
              </button>
            )}
          </div>
        </section>
      )}

      {driverStats && <DriverStatsSection stats={driverStats} />}

      <section aria-labelledby="ach-title" className="flex flex-col gap-3.5 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-col gap-0.5">
            <h2 id="ach-title" className="h2" style={{ fontSize: 24 }}>
              Achievements
            </h2>
            <span className="text-[13px] text-ds-muted">Highest tier per achievement, with progress to the next one</span>
          </div>
          <div role="group" aria-label="Show" className="seg [&>button]:min-h-8 [&>button]:px-3.5">
            <button type="button" aria-pressed={showAchievements === 'all'} onClick={() => setShowAchievements('all')}>
              All
            </button>
            <button
              type="button"
              aria-pressed={showAchievements === 'earned'}
              onClick={() => setShowAchievements('earned')}
            >
              Earned
            </button>
          </div>
        </div>
        {visibleCards.length === 0 ? (
          <p className="m-0 text-sm text-ds-muted">
            {showAchievements === 'earned' ? 'No achievements earned yet.' : 'No achievements defined yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3">
            {visibleCards.map((card) => {
              const { definition, award } = card;
              const locked = award === null;
              return (
                <article
                  key={definition.id}
                  className={`cut flex flex-col gap-3.5 bg-ds-panel px-[18px] py-4 ${locked ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="cut-xs flex h-11 w-11 shrink-0 items-center justify-center bg-ds-field"
                      style={{ color: card.color }}
                    >
                      <AchievementIconView icon={definition.icon} className="h-6 w-6" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{definition.name}</span>
                      {definition.description && <span className="text-xs text-ds-muted">{definition.description}</span>}
                    </span>
                    <span
                      className={`chip chip-sm ${locked ? 'text-ds-dim' : ''}`}
                      style={locked ? undefined : { background: card.color, color: MEDAL_INK }}
                    >
                      {card.tierLabel}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div
                      role="progressbar"
                      aria-label={`${definition.name} progress`}
                      aria-valuenow={card.pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1.5 overflow-hidden bg-ds-control"
                    >
                      <div
                        className={`h-full ${locked ? 'bg-[#3a3a40] [:root[data-theme=light]_&]:bg-ds-dim' : 'bg-w2w-red'}`}
                        style={{ width: `${card.pct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs text-ds-muted">
                      <span>{card.nextText}</span>
                      {award && (
                        <span className="flex shrink-0 items-center gap-2 text-ds-dim">
                          {formatDay(award.achievedAt)}
                          {user?.role === 'ADMIN' && (
                            <button
                              type="button"
                              onClick={() => void handleRevokeAward(award)}
                              aria-label={`Revoke ${award.tier.definition.name} — ${award.tier.label}`}
                              className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-bold uppercase text-ds-dim hover:text-ds-danger"
                            >
                              Revoke
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="races-title" className="cut bg-ds-panel pb-1.5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3">
          <h2 id="races-title" className="h2">
            Races
          </h2>
          {races !== null && races.length > 0 && (
            <span className="text-[13px] text-ds-muted">
              {races.length} race{races.length === 1 ? '' : 's'} · page {page} of {totalPages}
            </span>
          )}
        </div>
        {racesError && races === null ? (
          <p role="alert" className="m-0 px-5 py-3 text-sm text-ds-danger">
            {racesError}
          </p>
        ) : races === null ? (
          <p className="m-0 px-5 py-3 text-sm text-ds-muted">Loading...</p>
        ) : races.length === 0 ? (
          <p className="m-0 border-t border-ds-line px-5 py-4 text-sm text-ds-muted">No race results recorded yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              {/* Phones get Race (car on its second line), result and drive time; the rest from sm up. */}
              <div role="table" aria-labelledby="races-title" className="sm:min-w-[760px]">
                <div role="rowgroup">
                  <div
                    role="row"
                    className="grid grid-cols-[minmax(0,1fr)_64px_92px] items-center text-[11px] font-bold uppercase text-ds-dim sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.7fr)_80px_90px_110px_70px]"
                  >
                    <span role="columnheader" className="py-2.5 pl-5 pr-2">Race</span>
                    <span role="columnheader" className="px-2 py-2.5 max-sm:hidden">Car</span>
                    <span role="columnheader" className="px-2 py-2.5 text-right">Class</span>
                    <span role="columnheader" className="px-2 py-2.5 text-right max-sm:hidden">My laps</span>
                    <span role="columnheader" className="py-2.5 pl-2 pr-5 text-right sm:px-2">Drive time</span>
                    <span role="columnheader" className="py-2.5 pl-2 pr-5 text-right max-sm:hidden">Inc</span>
                  </div>
                </div>
                <div role="rowgroup">
                  {pagedRaces?.map((race) => {
                    const stint = race.driverStints.find((s) => s.driverProfileId === driver.id);
                    const driveTimeMs =
                      stint?.averageLapTimeMs != null && stint.lapsComplete != null
                        ? stint.averageLapTimeMs * stint.lapsComplete
                        : null;
                    const position = race.finishingPositionInClass ?? race.finishingPosition;
                    const medal =
                      position === 1 ? MEDAL.gold : position === 2 ? MEDAL.silver : position === 3 ? MEDAL.bronze : null;
                    return (
                      <Link
                        key={race.id}
                        to={`/results/${race.id}`}
                        role="row"
                        className="row-hover grid min-h-16 grid-cols-[minmax(0,1fr)_64px_92px] items-center border-t border-ds-line text-ds-ink sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.7fr)_80px_90px_110px_70px]"
                      >
                        <span role="cell" className="min-w-0 py-2.5 pl-5 pr-2">
                          <span className="block font-bold">
                            {race.trackName}
                            {race.trackConfig ? ` — ${race.trackConfig}` : ''}
                          </span>
                          <span className="block text-xs text-ds-muted">
                            {[race.seriesName, race.startTime ? formatDay(race.startTime) : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          {race.carName && (
                            <span className="block truncate text-xs text-ds-muted sm:hidden">{race.carName}</span>
                          )}
                        </span>
                        <span role="cell" className="min-w-0 px-2 py-2.5 text-ds-ink-soft max-sm:hidden">
                          {race.carName ?? '—'}
                        </span>
                        <span role="cell" className="px-2 py-2.5 text-right">
                          <span
                            className="slant num inline-block min-w-12 px-2 py-[3px] text-center text-[15px]"
                            style={
                              medal
                                ? { background: medal, color: MEDAL_INK }
                                : { background: 'var(--color-ds-control)', color: 'var(--color-ds-ink-soft)' }
                            }
                          >
                            {positionLabel(position)}
                          </span>
                        </span>
                        <span role="cell" className="num px-2 py-2.5 text-right text-base max-sm:hidden">
                          {stint?.lapsComplete ?? '—'}
                        </span>
                        <span role="cell" className="num py-2.5 pl-2 pr-5 text-right text-base sm:px-2">
                          {stint ? formatDuration(driveTimeMs) : '—'}
                        </span>
                        <span role="cell" className="py-2.5 pl-2 pr-5 text-right tabular-nums text-ds-ink-soft max-sm:hidden">
                          {stint ? `${stint.incidents ?? 0}x` : '—'}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex justify-end gap-1.5 border-t border-ds-line px-5 py-2.5">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="cut-xs flex h-[38px] w-[38px] cursor-pointer items-center justify-center border-0 bg-ds-control text-ds-ink hover:bg-ds-control-hover disabled:cursor-default disabled:bg-ds-raised disabled:text-ds-dim"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="square"
                    aria-hidden="true"
                  >
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="cut-xs flex h-[38px] w-[38px] cursor-pointer items-center justify-center border-0 bg-ds-control text-ds-ink hover:bg-ds-control-hover disabled:cursor-default disabled:bg-ds-raised disabled:text-ds-dim"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="square"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
