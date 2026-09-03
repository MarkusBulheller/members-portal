import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CountryFlag from '../../components/CountryFlag';
import { useAuth } from '../../context/AuthContext';
import { resolveAssetUrl } from '../../lib/api';
import { driversApi } from '../../lib/api/drivers';
import { licenseClassStyle } from '../../lib/iracingClass';
import { formatTimezoneLabel } from '../../lib/timezone';
import type { DriverProfile } from '../../types/driver';

export default function DriversListPage() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState<DriverProfile[] | null>(null);

  useEffect(() => {
    void driversApi.list().then(setDrivers);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Roster</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">Drivers</h1>
        </div>
        {user?.role === 'ADMIN' && (
          <Link
            to="/drivers/new"
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
          >
            New Driver
          </Link>
        )}
      </div>

      {drivers === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : drivers.length === 0 ? (
        <p className="text-white/65 text-sm">No drivers yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map((driver) => (
            <Link
              key={driver.id}
              to={`/drivers/${driver.id}`}
              className="bg-w2w-charcoal border border-white/10 hover:border-w2w-red/50 p-5 transition-colors flex items-start gap-3"
            >
              {driver.avatarUrl ? (
                <img
                  src={resolveAssetUrl(driver.avatarUrl)}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover bg-black/30 shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-w2w-charcoal-light flex items-center justify-center font-heading text-xs text-white/60 shrink-0">
                  {driver.displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-heading font-semibold text-white text-sm truncate flex items-center gap-1.5">
                    <CountryFlag countryCode={driver.iracingCountryCode} className="text-sm rounded-sm shrink-0" />
                    {driver.iracingName ?? driver.displayName}
                  </p>
                  <span
                    className={`shrink-0 text-[9px] font-heading uppercase tracking-wide px-1.5 py-0.5 ${
                      driver.userId
                        ? 'bg-w2w-red/15 text-w2w-red'
                        : 'bg-white/10 text-white/65'
                    }`}
                  >
                    {driver.userId ? 'Member' : 'Guest'}
                  </span>
                </div>
                <p className="text-white/65 text-xs truncate mt-1">
                  {[driver.iracingLocation ?? driver.preferredClasses ?? 'No classes set', formatTimezoneLabel(driver.timezone)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-white/65 text-xs">
                    {driver.awards.length} achievement{driver.awards.length === 1 ? '' : 's'}
                  </p>
                  <div className="flex items-center gap-2">
                    {driver.sportsCarSafetyRating && (
                      <span
                        className="px-1.5 py-0.5 text-[11px] font-heading font-semibold"
                        style={licenseClassStyle(driver.sportsCarSafetyRating)}
                      >
                        {driver.sportsCarSafetyRating}
                      </span>
                    )}
                    {driver.sportsCarIrating && (
                      <span className="text-[11px] font-heading text-w2w-red">{driver.sportsCarIrating} iR</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
