import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { resolveAssetUrl } from '../../lib/api';
import { driversApi } from '../../lib/api/drivers';
import { licenseClassStyle } from '../../lib/iracingClass';
import { initials } from '../../lib/initials';
import { formatTimezoneLabel } from '../../lib/timezone';
import type { DriverProfile } from '../../types/driver';

type Kind = 'all' | 'member' | 'guest';
type Sort = 'ir' | 'name';

const driverName = (d: DriverProfile) => d.iracingName ?? d.displayName;

/** One roster card. Memoised so typing in the search box (or any other page state change) only
 * re-renders the cards whose driver / "is me" actually changed, and the timezone label is computed
 * once per driver rather than on every render. */
const DriverCard = memo(function DriverCard({ driver, isMe }: { driver: DriverProfile; isMe: boolean }) {
  const tags = [
    driver.startingDriver && { label: 'Start', title: 'Starting driver' },
    driver.wetDriver && { label: 'Wet', title: 'Wet driver' },
    driver.nightDriver && { label: 'Night', title: 'Night driver' },
  ].filter((t): t is { label: string; title: string } => Boolean(t));
  const meta = [driver.iracingLocation ?? driver.country, driver.preferredClasses].filter(Boolean).join(' · ');
  const achievements = driver.awardCount ?? driver.awards?.length ?? 0;
  const timezoneLabel = useMemo(() => formatTimezoneLabel(driver.timezone), [driver.timezone]);
  return (
    <Link
      to={`/drivers/${driver.id}`}
      className="cut row-hover flex flex-col gap-3.5 bg-ds-panel px-[18px] pb-3.5 pt-4 text-ds-ink"
    >
      <div className="flex items-center gap-3">
        {driver.avatarUrl ? (
          <img
            src={resolveAssetUrl(driver.avatarUrl)}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            decoding="async"
            className="cut-xs h-11 w-11 shrink-0 bg-ds-field object-cover"
          />
        ) : (
          <span
            className={`cut-xs flex h-11 w-11 shrink-0 items-center justify-center text-base font-black italic ${
              isMe ? 'bg-w2w-red text-on-accent' : 'bg-ds-control text-ds-ink'
            }`}
          >
            {initials(driver.displayName)}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 font-bold">
            {driver.iracingCountryCode && (
              <span className="text-[11px] font-bold text-ds-dim">{driver.iracingCountryCode}</span>
            )}
            <span className="truncate">{driverName(driver)}</span>
          </span>
          <span className="truncate text-xs text-ds-muted">{meta || 'No details set'}</span>
        </span>
        <span className={`chip chip-sm ${driver.userId ? 'chip-accent' : ''}`}>
          {driver.userId ? 'Member' : 'Guest'}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          {driver.sportsCarSafetyRating && (
            <span
              className="slant num px-3 py-0.5 text-sm"
              style={licenseClassStyle(driver.sportsCarSafetyRating)}
            >
              {driver.sportsCarSafetyRating}
            </span>
          )}
          {driver.sportsCarIrating !== null && (
            <span className="flex items-baseline gap-1">
              <span className="num text-xl leading-none">{driver.sportsCarIrating.toLocaleString('en-US')}</span>
              <span className="text-xs font-bold text-ds-muted">iR</span>
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {tags.map((t) => (
            <span key={t.label} title={t.title} className="chip chip-sm">
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-ds-line pt-2.5 text-xs text-ds-muted">
        <span>
          {achievements === 0
            ? 'No achievements yet'
            : `${achievements} achievement${achievements === 1 ? '' : 's'}`}
        </span>
        <span className="truncate text-ds-dim">{timezoneLabel}</span>
      </div>
    </Link>
  );
});

export default function DriversListPage() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState<DriverProfile[] | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('ir');
  const [loadError, setLoadError] = useState<string | null>(null);
  // The input stays instant; the (cheap but O(N)) filter + card list follows at lower priority.
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;
    driversApi
      .list()
      .then((loaded) => {
        if (!cancelled) setDrivers(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load drivers.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!drivers) return [];
    const needle = deferredQuery.trim().toLowerCase();
    return drivers
      .filter((d) => kind === 'all' || (kind === 'member' ? d.userId !== null : d.userId === null))
      .filter(
        (d) =>
          !needle ||
          [driverName(d), d.displayName, d.iracingLocation, d.country, d.iracingCountryCode, d.preferredClasses]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) =>
        sort === 'ir'
          ? (b.sportsCarIrating ?? -1) - (a.sportsCarIrating ?? -1) || driverName(a).localeCompare(driverName(b))
          : driverName(a).localeCompare(driverName(b)),
      );
  }, [drivers, deferredQuery, kind, sort]);

  const kinds: { key: Kind; label: string }[] = [
    { key: 'all', label: `All ${drivers?.length ?? 0}` },
    { key: 'member', label: 'Members' },
    { key: 'guest', label: 'Guests' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Drivers</h1>
          <span className="text-ds-muted">Team roster, members and guest drivers</span>
        </div>
        {user?.role === 'ADMIN' && (
          <Link to="/drivers/new" className="btn-primary">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="square"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New driver
          </Link>
        )}
      </header>

      {drivers !== null && drivers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="cut-sm flex h-[42px] max-w-[380px] flex-[1_1_260px] items-center gap-2 bg-ds-panel px-3 text-ds-muted focus-within:shadow-[inset_0_-2px_0_var(--color-w2w-red)]">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="square"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
            <label htmlFor="driver-search" className="sr-only">
              Search drivers
            </label>
            <input
              id="driver-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, class or country"
              className="min-w-0 flex-1 border-0 bg-transparent text-ds-ink outline-none placeholder:text-ds-dim"
            />
          </div>
          <div role="group" aria-label="Driver type" className="seg">
            {kinds.map((k) => (
              <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
                {k.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Sort" className="seg ml-auto">
            <button type="button" aria-pressed={sort === 'ir'} onClick={() => setSort('ir')}>
              iRating
            </button>
            <button type="button" aria-pressed={sort === 'name'} onClick={() => setSort('name')}>
              Name
            </button>
          </div>
        </div>
      )}

      {drivers === null && loadError ? (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {loadError}
        </p>
      ) : drivers === null ? (
        <p className="m-0 text-sm text-ds-muted">Loading...</p>
      ) : drivers.length === 0 ? (
        <p className="cut m-0 bg-ds-panel px-4 py-10 text-center text-ds-muted">No drivers yet.</p>
      ) : visible.length === 0 ? (
        <p className="cut m-0 bg-ds-panel px-4 py-10 text-center text-ds-muted">
          No drivers match that. Try another name, class or country.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-3">
          {visible.map((driver) => (
            <DriverCard key={driver.id} driver={driver} isMe={driver.userId !== null && driver.userId === user?.id} />
          ))}
        </div>
      )}
    </div>
  );
}

