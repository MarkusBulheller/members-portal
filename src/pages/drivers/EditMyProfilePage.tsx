import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AvatarUpload from '../../components/AvatarUpload';
import CountryFlag from '../../components/CountryFlag';
import TimezoneAutocomplete from '../../components/TimezoneAutocomplete';
import { driversApi } from '../../lib/api/drivers';
import { beginIracingLink } from '../../lib/iracing';
import { licenseClassStyle } from '../../lib/iracingClass';
import type { DriverProfile } from '../../types/driver';

const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function EditMyProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justLinked = searchParams.get('iracing') === 'linked';
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void driversApi.getOwn().then(setProfile);
  }, []);

  function handleLinkClick() {
    setError(null);
    beginIracingLink().catch((err: unknown) => {
      setError(err instanceof Error ? `Could not start iRacing sign-in: ${err.message}` : 'Could not start iRacing sign-in.');
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await driversApi.updateOwn({
        displayName: profile.displayName,
        country: profile.country ?? undefined,
        timezone: profile.timezone,
        preferredClasses: profile.preferredClasses ?? undefined,
        bio: profile.bio ?? undefined,
        maxSuccessiveStints: profile.maxSuccessiveStints,
        startingDriver: profile.startingDriver,
        wetDriver: profile.wetDriver,
        nightDriver: profile.nightDriver,
      });
      setProfile(updated);
      navigate(`/drivers/${updated.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  return (
    <div className="max-w-xl">
      <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Your Profile</p>
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-8">Edit Profile</h1>

      {justLinked && (
        <p className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">
          Your iRacing account is now linked.
        </p>
      )}

      {error && (
        <p className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">{error}</p>
      )}

      <div className="mb-8 bg-w2w-charcoal border border-white/10 p-5">
        <AvatarUpload
          avatarUrl={profile.avatarUrl}
          displayName={profile.displayName}
          onUpload={(file) => driversApi.uploadOwnAvatar(file).then(setProfile)}
          onRemove={() => driversApi.removeOwnAvatar().then(setProfile)}
        />
      </div>

      <div className="mb-8 bg-w2w-charcoal border border-white/10 p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">iRacing Account</p>
          <button
            onClick={handleLinkClick}
            className={
              profile.iracingCustomerId
                ? 'text-xs text-white/65 hover:text-white'
                : 'px-4 py-2 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold text-xs uppercase tracking-wide transition-colors clip-corner'
            }
          >
            {profile.iracingCustomerId ? 'Re-link' : 'Link iRacing Account'}
          </button>
        </div>

        {profile.iracingCustomerId ? (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="font-heading text-[10px] tracking-[0.2em] uppercase text-white/65">Name</p>
              <p className="text-white text-sm">{profile.iracingName ?? '—'}</p>
            </div>
            <div>
              <p className="font-heading text-[10px] tracking-[0.2em] uppercase text-white/65">Location</p>
              <p className="text-white text-sm flex items-center gap-1.5">
                <CountryFlag countryCode={profile.iracingCountryCode} className="text-sm rounded-sm" />
                {profile.iracingLocation ?? '—'}
              </p>
            </div>
            <div>
              <p className="font-heading text-[10px] tracking-[0.2em] uppercase text-white/65">Sports Car iRating</p>
              <p className="text-white text-sm">{profile.sportsCarIrating ?? '—'}</p>
            </div>
            <div>
              <p className="font-heading text-[10px] tracking-[0.2em] uppercase text-white/65">Safety Rating</p>
              {profile.sportsCarSafetyRating ? (
                <span
                  className="inline-block px-1.5 py-0.5 text-sm font-semibold"
                  style={licenseClassStyle(profile.sportsCarSafetyRating)}
                >
                  {profile.sportsCarSafetyRating}
                </span>
              ) : (
                <p className="text-white text-sm">—</p>
              )}
            </div>
            <div className="col-span-2">
              <p className="font-heading text-[10px] tracking-[0.2em] uppercase text-white/65">Customer ID</p>
              <p className="text-white/65 text-sm">#{profile.iracingCustomerId}</p>
            </div>
            {profile.iracingStatsSyncedAt && (
              <div className="col-span-2">
                <p className="text-white/65 text-xs">
                  Last updated {new Date(profile.iracingStatsSyncedAt).toLocaleDateString()} · auto-updates weekly
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-1 text-white/65 text-sm">Not linked yet</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {(
          [
            ['displayName', 'Display Name', 'text'],
            ['country', 'Country', 'text'],
            ['preferredClasses', 'Preferred Classes (e.g. GT3, GTP)', 'text'],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">{label}</span>
            <input
              type="text"
              value={profile[field] ?? ''}
              onChange={(e) => setProfile({ ...profile, [field]: e.target.value })}
              className="bg-w2w-black border border-white/15 px-4 py-3 text-white text-sm focus:border-w2w-red focus:outline-none"
            />
          </label>
        ))}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Timezone</span>
            {profile.timezone !== BROWSER_TIMEZONE && (
              <button
                type="button"
                onClick={() => setProfile({ ...profile, timezone: BROWSER_TIMEZONE })}
                className="text-xs text-w2w-red hover:text-w2w-red-bright"
              >
                Use {BROWSER_TIMEZONE}
              </button>
            )}
          </div>
          <TimezoneAutocomplete
            value={profile.timezone}
            onChange={(timezone) => setProfile({ ...profile, timezone })}
          />
          <p className="text-white/70 text-xs">
            Used to show your stints in your own local time on the race-planning page.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Bio</span>
          <textarea
            rows={4}
            value={profile.bio ?? ''}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            className="bg-w2w-black border border-white/15 px-4 py-3 text-white text-sm focus:border-w2w-red focus:outline-none resize-none"
          />
        </label>

        <div className="flex flex-col gap-3 pt-2 border-t border-white/10">
          <p className="font-heading text-xs tracking-[0.2em] uppercase text-white/65 pt-3">Race Preferences</p>
          <label className="flex flex-col gap-2 max-w-[240px]">
            <span className="text-white/65 text-xs">Max. Successive Stints</span>
            <input
              type="number"
              min={1}
              step={1}
              value={profile.maxSuccessiveStints ?? ''}
              onChange={(e) =>
                setProfile({ ...profile, maxSuccessiveStints: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="bg-w2w-black border border-white/15 px-4 py-3 text-white text-sm focus:border-w2w-red focus:outline-none"
            />
          </label>
          {(
            [
              ['startingDriver', 'Starting Driver'],
              ['wetDriver', 'Wet Driver'],
              ['nightDriver', 'Night Driver'],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="flex items-center gap-2.5 text-white/80 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={profile[field]}
                onChange={(e) => setProfile({ ...profile, [field]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>

        {error && <p className="text-w2w-red text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-sm transition-colors clip-corner"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
