import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AvatarUpload from '../../components/AvatarUpload';
import { SwitchRow, StintsRow } from '../../components/RacePreferenceFields';
import TimezoneAutocomplete from '../../components/TimezoneAutocomplete';
import { driversApi } from '../../lib/api/drivers';
import { licenseClassStyle } from '../../lib/iracingClass';
import { initials } from '../../lib/initials';
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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    driversApi
      .getById(id)
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load the driver.');
      });
    return () => {
      cancelled = true;
    };
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
    return loadError ? (
      <p role="alert" className="m-0 text-sm text-ds-danger">
        {loadError}
      </p>
    ) : (
      <p className="m-0 text-sm text-ds-muted">Loading...</p>
    );
  }

  const name = profile.iracingName ?? profile.displayName;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
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
        <span className="text-ds-ink">{name} · settings</span>
      </nav>
      <div className="flex max-w-[760px] flex-col gap-1">
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Member settings</h1>
        <span className="text-ds-muted">Adjust planning settings for a member. Everything else is theirs to edit.</span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
          <section aria-labelledby="from-ir" className="cut flex flex-col gap-3.5 bg-ds-panel px-6 py-[22px]">
            <div className="flex items-center gap-3.5">
              <span
                aria-hidden="true"
                className="cut-xs flex h-14 w-14 flex-none items-center justify-center bg-ds-control text-[22px] font-black italic"
              >
                {initials(name)}
              </span>
              <span className="flex flex-col">
                <span id="from-ir" className="text-[22px] font-extrabold leading-[1.2]">
                  {name}
                </span>
                <span className="text-[13px] text-ds-muted">
                  Portal member{profile.discordUsername ? ` · @${profile.discordUsername} on Discord` : ''}
                </span>
              </span>
            </div>
            <AvatarUpload
              avatarUrl={profile.avatarUrl}
              displayName={profile.displayName}
              onUpload={(file) => driversApi.uploadAvatarAsAdmin(profile.id, file).then(setProfile)}
              onRemove={() => driversApi.removeAvatarAsAdmin(profile.id).then(setProfile)}
            />
            {profile.iracingCustomerId && (
              <dl className="cut-sm m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5 bg-ds-field px-4 py-3.5">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs font-semibold text-ds-muted">Location</dt>
                  <dd className="m-0 font-bold">{profile.iracingLocation ?? '—'}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs font-semibold text-ds-muted">iRating</dt>
                  <dd className="num m-0 text-[17px]">
                    {profile.sportsCarIrating !== null ? profile.sportsCarIrating.toLocaleString('en-US') : '—'}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs font-semibold text-ds-muted">Safety rating</dt>
                  <dd className="m-0">
                    {profile.sportsCarSafetyRating ? (
                      <span
                        className="slant num inline-block px-3 py-px"
                        style={licenseClassStyle(profile.sportsCarSafetyRating)}
                      >
                        {profile.sportsCarSafetyRating}
                      </span>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
            )}
            {profile.iracingCustomerId && (
              <span className="text-xs text-ds-dim">
                iRacing stats come from their linked account (read-only — only {profile.displayName} can re-link it).
              </span>
            )}
          </section>

          <section aria-labelledby="det" className="cut flex flex-col gap-4 bg-ds-panel px-6 py-[22px]">
            <h2 id="det" className="h2">
              Details
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-4 gap-y-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Display name</span>
                <input
                  type="text"
                  value={profile.displayName ?? ''}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  className="input min-h-11 px-3.5"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Country</span>
                <input
                  type="text"
                  value={profile.country ?? ''}
                  onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                  className="input min-h-11 px-3.5"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Preferred classes</span>
                <input
                  type="text"
                  value={profile.preferredClasses ?? ''}
                  onChange={(e) => setProfile({ ...profile, preferredClasses: e.target.value })}
                  placeholder="e.g. GT3, GTP"
                  className="input min-h-11 px-3.5"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="lbl">Timezone</span>
                <TimezoneAutocomplete
                  value={profile.timezone}
                  onChange={(timezone) => setProfile({ ...profile, timezone })}
                />
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Bio</span>
              <textarea
                rows={3}
                value={profile.bio ?? ''}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                className="input resize-y px-3.5 py-3"
              />
            </label>
          </section>
        </div>

        <aside className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
          <section aria-labelledby="rp" className="cut flex flex-col bg-ds-panel px-[22px] pb-[18px] pt-5">
            <div className="mb-3">
              <h2 id="rp" className="h2">
                Race preferences
              </h2>
            </div>
            <SwitchRow
              label="Starting driver"
              on={profile.startingDriver}
              onChange={(on) => setProfile({ ...profile, startingDriver: on })}
            />
            <SwitchRow
              label="Wet driver"
              on={profile.wetDriver}
              onChange={(on) => setProfile({ ...profile, wetDriver: on })}
            />
            <SwitchRow
              label="Night driver"
              on={profile.nightDriver}
              onChange={(on) => setProfile({ ...profile, nightDriver: on })}
            />
            <StintsRow
              value={profile.maxSuccessiveStints}
              onChange={(maxSuccessiveStints) => setProfile({ ...profile, maxSuccessiveStints })}
            />
          </section>
          <div className="flex flex-col gap-2">
            {error && (
              <p role="alert" className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-ds-danger">
                {error}
              </p>
            )}
            <button type="submit" disabled={saving} className="btn-primary min-h-[46px]">
              {saving ? 'Saving...' : 'Save settings'}
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
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
            <Link to={`/drivers/${profile.id}`} className="btn-secondary min-h-11 justify-center">
              Cancel
            </Link>
          </div>
        </aside>
      </form>
    </div>
  );
}
