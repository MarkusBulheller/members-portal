import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AchievementIconView from '../../components/AchievementIcon';
import CountryFlag from '../../components/CountryFlag';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import RaceResultRow from '../../components/RaceResultRow';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { achievementsApi } from '../../lib/api/achievements';
import { driversApi } from '../../lib/api/drivers';
import { raceResultsApi } from '../../lib/api/raceResults';
import { formatDuration } from '../../lib/lapTime';
import { licenseClassStyle } from '../../lib/iracingClass';
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

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [races, setRaces] = useState<RaceResult[] | null>(null);
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [showAllAchievements, setShowAllAchievements] = useState(false);

  const loadDriver = () => {
    if (id) void driversApi.getById(id).then(setDriver);
  };

  useEffect(loadDriver, [id]);
  useEffect(() => void achievementsApi.listDefinitions().then(setDefinitions), []);

  async function handleRevokeAward(award: AchievementAward) {
    const ok = await confirm(`Revoke "${award.tier.definition.name} — ${award.tier.label}"?`, { confirmLabel: 'Revoke' });
    if (!ok) return;
    await achievementsApi.revokeAward(award.id);
    loadDriver();
  }

  useEffect(() => {
    if (id) void raceResultsApi.listByDriver(id).then(setRaces);
  }, [id]);

  const { page, setPage, totalPages, pageItems: pagedRaces } = usePagination(races);

  if (!driver) {
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  const bestAwards = highestAwardsByDefinition(driver.awards);

  return (
    <div>
      <Link to="/drivers" className="text-xs text-white/65 hover:text-white">
        ← Back to roster
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="font-display font-black text-2xl uppercase text-w2w-white flex items-center gap-2">
            <CountryFlag countryCode={driver.iracingCountryCode} className="text-base rounded-sm" />
            {driver.iracingName ?? driver.displayName}
            <span
              className={`text-[10px] font-heading uppercase tracking-wide px-1.5 py-0.5 ${
                driver.userId ? 'bg-w2w-red/15 text-w2w-red' : 'bg-white/10 text-white/65'
              }`}
            >
              {driver.userId ? 'Portal Member' : 'Manually Added'}
            </span>
          </h1>
          {driver.iracingName && driver.iracingName !== driver.displayName && (
            <p className="text-white/65 text-xs">"{driver.displayName}"</p>
          )}
          <p className="text-white/65 text-sm">
            {[driver.iracingLocation ?? driver.country, driver.preferredClasses, formatTimezoneLabel(driver.timezone)]
              .filter(Boolean)
              .join(' · ') || 'No details set'}
          </p>
          {(driver.startingDriver || driver.wetDriver || driver.nightDriver || driver.maxSuccessiveStints !== null) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {driver.startingDriver && (
                <span className="text-[10px] font-heading uppercase tracking-wide px-1.5 py-0.5 bg-white/10 text-white/65">
                  Starting Driver
                </span>
              )}
              {driver.wetDriver && (
                <span className="text-[10px] font-heading uppercase tracking-wide px-1.5 py-0.5 bg-white/10 text-white/65">
                  Wet Driver
                </span>
              )}
              {driver.nightDriver && (
                <span className="text-[10px] font-heading uppercase tracking-wide px-1.5 py-0.5 bg-white/10 text-white/65">
                  Night Driver
                </span>
              )}
              {driver.maxSuccessiveStints !== null && (
                <span className="text-[10px] font-heading uppercase tracking-wide px-1.5 py-0.5 bg-white/10 text-white/65">
                  Max {driver.maxSuccessiveStints} Successive Stint{driver.maxSuccessiveStints === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}
        </div>
        {user?.role === 'ADMIN' && (
          <Link
            to={driver.userId ? `/drivers/${driver.id}/edit-settings` : `/drivers/${driver.id}/edit`}
            className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors shrink-0"
          >
            Edit
          </Link>
        )}
      </div>

      {driver.bio && <p className="mt-6 text-white/60 text-sm leading-relaxed max-w-2xl">{driver.bio}</p>}

      {driver.iracingCustomerId && (
        <div className="mt-6 grid grid-cols-3 gap-4 max-w-md">
          <div className="bg-w2w-charcoal border border-white/10 p-4">
            <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">iRating</p>
            <p className="mt-1 font-display font-bold text-lg text-w2w-white whitespace-nowrap">
              {driver.sportsCarIrating ?? '—'}
            </p>
          </div>
          <div className="bg-w2w-charcoal border border-white/10 p-4">
            <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">Safety</p>
            {driver.sportsCarSafetyRating ? (
              <span
                className="mt-1 inline-block px-2 py-0.5 font-display font-bold text-lg whitespace-nowrap"
                style={licenseClassStyle(driver.sportsCarSafetyRating)}
              >
                {driver.sportsCarSafetyRating}
              </span>
            ) : (
              <p className="mt-1 font-display font-bold text-lg text-w2w-white">—</p>
            )}
          </div>
          <div className="bg-w2w-charcoal border border-white/10 p-4">
            <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">iRacing ID</p>
            <p className="mt-1 font-display font-bold text-base text-w2w-white whitespace-nowrap">
              #{driver.iracingCustomerId}
            </p>
          </div>
        </div>
      )}

      {driver.iracingStatsSyncedAt && (
        <p className="mt-2 text-white/65 text-[11px]">
          iRacing stats last updated {new Date(driver.iracingStatsSyncedAt).toLocaleDateString()}
          {driver.userId
            ? ' · auto-updates weekly'
            : ' · manually added drivers don\'t auto-update — re-pick them via Edit to refresh'}
        </p>
      )}

      <div className="mt-10 flex items-center justify-between mb-4">
        <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase">Achievements</h2>
        <button
          onClick={() => setShowAllAchievements(true)}
          aria-haspopup="dialog"
          className="text-xs text-w2w-red hover:text-w2w-red-bright font-heading uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-w2w-red rounded-sm"
        >
          View All<span className="sr-only"> Achievements</span>
        </button>
      </div>
      {bestAwards.length === 0 ? (
        <p className="text-white/65 text-sm">No achievements earned yet.</p>
      ) : (
        <div className="space-y-2">
          {bestAwards
            .slice()
            .sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
            .map((award) => (
              <div
                key={award.id}
                className="flex items-center justify-between bg-w2w-charcoal border border-white/10 px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="h-9 w-9 shrink-0 flex items-center justify-center bg-w2w-red/15 text-w2w-red"
                  >
                    <AchievementIconView icon={award.tier.definition.icon} className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-heading font-semibold text-white text-sm">{award.tier.definition.name}</p>
                    {award.tier.definition.description && (
                      <p className="text-white/65 text-xs mt-0.5">{award.tier.definition.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <span className="inline-block px-2.5 py-1 bg-w2w-red/15 text-w2w-red text-[11px] font-heading uppercase tracking-wide">
                    {award.tier.label}
                    {award.tier.threshold !== null
                      ? ` · ${award.tier.threshold} ${METRIC_UNIT[award.tier.definition.metric]}`
                      : ''}
                  </span>
                  <p className="text-white/65 text-[11px] mt-1">{new Date(award.achievedAt).toLocaleDateString()}</p>
                  {user?.role === 'ADMIN' && (
                    <button
                      onClick={() => void handleRevokeAward(award)}
                      aria-label={`Revoke ${award.tier.definition.name} — ${award.tier.label}`}
                      className="block ml-auto mt-1 -mr-1 px-1 py-1 text-white/65 hover:text-w2w-red text-[10px] font-heading uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-w2w-red rounded-sm"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {showAllAchievements && (
        <Modal title="All Achievements" onClose={() => setShowAllAchievements(false)}>
          <div className="space-y-5">
            {definitions
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((definition) => {
                const tiers = [...definition.tiers].sort((a, b) => a.sortOrder - b.sortOrder);
                const earnedTierIds = new Set(
                  driver.awards.filter((a) => a.tier.definitionId === definition.id).map((a) => a.tierId),
                );
                const current = computeProgress(definition, driver.id, races ?? []);
                return (
                  <div key={definition.id}>
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="shrink-0">
                        <AchievementIconView icon={definition.icon} className="h-5 w-5 text-w2w-red" />
                      </span>
                      <p className="font-heading font-semibold text-white text-sm">{definition.name}</p>
                      {definition.metric !== 'MANUAL' && (
                        <span className="text-white/65 text-xs">
                          — {current} {METRIC_UNIT[definition.metric]}
                        </span>
                      )}
                    </div>
                    {definition.description && (
                      <p className="text-white/65 text-xs mt-0.5">{definition.description}</p>
                    )}

                    <div className="mt-2 space-y-1.5">
                      {tiers.map((tier) => {
                        const earned = earnedTierIds.has(tier.id);
                        const progress = tier.threshold !== null ? Math.min(current / tier.threshold, 1) : earned ? 1 : 0;
                        const statusText =
                          tier.threshold !== null
                            ? `${Math.min(current, tier.threshold)} / ${tier.threshold}`
                            : earned
                              ? 'Earned'
                              : 'Not yet earned';
                        return (
                          <div key={tier.id}>
                            <div className="flex items-center justify-between text-[11px] mb-0.5">
                              <span className={earned ? 'text-w2w-red' : 'text-white/60'}>
                                {earned ? '✓ ' : ''}
                                {tier.label}
                              </span>
                              <span className="text-white/65">{statusText}</span>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={`${definition.name} — ${tier.label}`}
                              aria-valuenow={tier.threshold !== null ? Math.min(current, tier.threshold) : earned ? 1 : 0}
                              aria-valuemin={0}
                              aria-valuemax={tier.threshold ?? 1}
                              aria-valuetext={statusText}
                              className="h-1.5 bg-white/5 overflow-hidden"
                            >
                              <div
                                className={`h-full ${earned ? 'bg-w2w-red' : 'bg-white/20'}`}
                                style={{ width: `${progress * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </Modal>
      )}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">Races</h2>
      {races === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : races.length === 0 ? (
        <p className="text-white/65 text-sm">No race results recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {pagedRaces?.map((race) => {
            const stint = race.driverStints.find((s) => s.driverProfileId === driver.id);
            const driveTimeMs =
              stint?.averageLapTimeMs != null && stint.lapsComplete != null
                ? stint.averageLapTimeMs * stint.lapsComplete
                : null;
            return (
              <RaceResultRow
                key={race.id}
                to={`/results/${race.id}`}
                title={`${race.trackName}${race.trackConfig ? ` — ${race.trackConfig}` : ''}`}
                subtitle={[race.carName, race.startTime ? new Date(race.startTime).toLocaleDateString() : null]
                  .filter(Boolean)
                  .join(' · ')}
                position={race.finishingPositionInClass ?? race.finishingPosition}
                statsLine={
                  stint
                    ? [
                        `${stint.lapsComplete ?? '—'} laps`,
                        formatDuration(driveTimeMs),
                        `${stint.incidents ?? 0}x incidents`,
                      ].join(' · ')
                    : null
                }
              />
            );
          })}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
