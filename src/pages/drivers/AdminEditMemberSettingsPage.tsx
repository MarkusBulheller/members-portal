import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AvatarUpload from '../../components/AvatarUpload';
import CountryFlag from '../../components/CountryFlag';
import TimezoneAutocomplete from '../../components/TimezoneAutocomplete';
import { driversApi } from '../../lib/api/drivers';
import { licenseClassStyle } from '../../lib/iracingClass';
import type { DriverProfile } from '../../types/driver';

/** Admin override of a linked member's own settings (timezone, race preferences, etc.) — same
 * fields as EditMyProfilePage, minus the iRacing-link button, since only the member's own
 * browser can start that OAuth round-trip. Manual (unlinked) drivers are edited via the separate
 * DriverFormPage instead — see DriverDetailPage's Edit link. */
export default function AdminEditMemberSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) void driversApi.getById(id).then(setProfile);
  }, [id]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await driversApi.updateSettingsAsAdmin(profile.id, {
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
      navigate(`/drivers/${updated.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  return (
    <div className="max-w-xl">
      <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Admin</p>
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-8">
        Edit {profile.iracingName ?? profile.displayName}'s Settings
      </h1>

      {error && (
        <p role="alert" className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">
          {error}
        </p>
      )}

      <div className="mb-8 bg-w2w-charcoal border border-white/10 p-5">
        <AvatarUpload
          avatarUrl={profile.avatarUrl}
          displayName={profile.displayName}
          onUpload={(file) => driversApi.uploadAvatarAsAdmin(profile.id, file).then(setProfile)}
          onRemove={() => driversApi.removeAvatarAsAdmin(profile.id).then(setProfile)}
        />
      </div>

      {profile.iracingCustomerId && (
        <div className="mb-8 bg-w2w-charcoal border border-white/10 p-5">
          <p className="font-heading text-xs tracking-[0.2em] uppercase text-white/65 mb-3">
            iRacing Account (read-only — only {profile.displayName} can re-link it)
          </p>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
        </div>
      )}

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
          <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Timezone</span>
          <TimezoneAutocomplete
            value={profile.timezone}
            onChange={(timezone) => setProfile({ ...profile, timezone })}
          />
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

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-sm transition-colors clip-corner"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
