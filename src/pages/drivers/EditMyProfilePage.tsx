import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AvatarUpload from '../../components/AvatarUpload';
import PreferredClassChips, { normalizePreferredClasses } from '../../components/PreferredClassChips';
import { SwitchRow, StintsRow } from '../../components/RacePreferenceFields';
import TimezoneAutocomplete from '../../components/TimezoneAutocomplete';
import { useAuth } from '../../context/AuthContext';
import { driversApi } from '../../lib/api/drivers';
import { beginIracingLink } from '../../lib/iracing';
import { licenseClassStyle } from '../../lib/iracingClass';
import { initials } from '../../lib/initials';
import type { DriverProfile } from '../../types/driver';

const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The fields this form edits, in a comparable shape — used to tell whether the form differs from
 * what was last loaded/saved ("You have unsaved changes"). The avatar isn't part of it: photo
 * changes are applied immediately by their own buttons. */
function editableSnapshot(p: DriverProfile): string {
  return JSON.stringify([
    p.displayName,
    p.country ?? '',
    p.timezone ?? null,
    normalizePreferredClasses(p.preferredClasses),
    p.bio ?? '',
    p.maxSuccessiveStints,
    p.startingDriver,
    p.wetDriver,
    p.nightDriver,
  ]);
}

export default function EditMyProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const justLinked = searchParams.get('iracing') === 'linked';
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    driversApi
      .getOwn()
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded);
        setSavedSnapshot(editableSnapshot(loaded));
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load your profile.');
      });
    return () => {
      cancelled = true;
    };
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
      setSavedSnapshot(editableSnapshot(updated));
      navigate(`/drivers/${updated.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
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

  const dirty = editableSnapshot(profile) !== savedSnapshot;
  /** Photo actions replace only the avatar, so unsaved edits to the other fields survive. */
  const applyAvatar = (updated: DriverProfile) =>
    setProfile((current) => (current ? { ...current, avatarUrl: updated.avatarUrl } : current));
  const discordName = user ? (user.discordGlobalName ?? user.discordUsername) : null;
  const rowClass = 'm-0 border-t border-ds-line py-2';

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Edit profile</h1>
          <span className="text-ds-muted">Your driver profile and race preferences</span>
        </div>
        <Link to={`/drivers/${profile.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
          View public profile
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="square"
            aria-hidden="true"
          >
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      {justLinked && (
        <p className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-w2w-red-ink">Your iRacing account is now linked.</p>
      )}

      {error && (
        <p role="alert" className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-ds-danger">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
            <section aria-labelledby="basics" className="cut flex flex-col gap-[18px] bg-ds-panel px-6 py-[22px]">
              <h2 id="basics" className="h2">
                Basics
              </h2>
              <AvatarUpload
                avatarUrl={profile.avatarUrl}
                displayName={profile.displayName}
                onUpload={(file) => driversApi.uploadOwnAvatar(file).then(applyAvatar)}
                onRemove={() => driversApi.removeOwnAvatar().then(applyAvatar)}
                onUseDiscord={user?.discordAvatarUrl ? () => driversApi.useDiscordAvatar().then(applyAvatar) : undefined}
              />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-x-4 gap-y-3.5">
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
                <div className="flex flex-col gap-1.5 [grid-column:1/-1]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="lbl">Timezone</span>
                    {profile.timezone !== BROWSER_TIMEZONE && (
                      <button
                        type="button"
                        onClick={() => setProfile({ ...profile, timezone: BROWSER_TIMEZONE })}
                        className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-w2w-red-ink hover:text-w2w-red-bright"
                      >
                        Use {BROWSER_TIMEZONE}
                      </button>
                    )}
                  </div>
                  <TimezoneAutocomplete
                    value={profile.timezone}
                    onChange={(timezone) => setProfile({ ...profile, timezone })}
                  />
                  <span className="text-xs text-ds-dim">
                    Shows your stints in your own local time on the race-planning page.
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="lbl">Preferred classes</span>
                <PreferredClassChips
                  value={profile.preferredClasses}
                  onChange={(preferredClasses) => setProfile({ ...profile, preferredClasses })}
                />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Bio</span>
                <textarea
                  rows={3}
                  value={profile.bio ?? ''}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="A line or two about you as a driver"
                  className="input resize-y px-3.5 py-3"
                />
              </label>
            </section>

            <section aria-labelledby="prefs" className="cut flex flex-col bg-ds-panel px-6 pb-[18px] pt-[22px]">
              <div className="mb-3 flex flex-col gap-1">
                <h2 id="prefs" className="h2">
                  Race preferences
                </h2>
                <span className="text-[13px] text-ds-muted">Used when building teams and generating stint plans.</span>
              </div>
              <SwitchRow
                label="Starting driver"
                description="Happy to take the green flag and the opening stint."
                on={profile.startingDriver}
                onChange={(on) => setProfile({ ...profile, startingDriver: on })}
              />
              <SwitchRow
                label="Wet driver"
                description="Comfortable taking stints in the rain."
                on={profile.wetDriver}
                onChange={(on) => setProfile({ ...profile, wetDriver: on })}
              />
              <SwitchRow
                label="Night driver"
                description="Comfortable driving in the dark."
                on={profile.nightDriver}
                onChange={(on) => setProfile({ ...profile, nightDriver: on })}
              />
              <StintsRow
                description="The planner won’t give you more back-to-back stints than this."
                value={profile.maxSuccessiveStints}
                onChange={(maxSuccessiveStints) => setProfile({ ...profile, maxSuccessiveStints })}
              />
            </section>
          </div>

          <aside className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
            <section aria-labelledby="ir" className="cut flex flex-col gap-3.5 bg-ds-panel px-[22px] py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="ir" className="h2">
                  iRacing account
                </h2>
                {profile.iracingCustomerId && (
                  <span className="chip chip-sm text-[#4ade80] [:root[data-theme=light]_&]:text-[#15803d]">Linked</span>
                )}
              </div>

              {profile.iracingCustomerId ? (
                <>
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 text-[13px]">
                    <dt className={`${rowClass} text-ds-muted`}>Name</dt>
                    <dd className={`${rowClass} font-bold`}>{profile.iracingName ?? '—'}</dd>
                    <dt className={`${rowClass} text-ds-muted`}>Location</dt>
                    <dd className={`${rowClass} font-bold`}>{profile.iracingLocation ?? '—'}</dd>
                    <dt className={`${rowClass} text-ds-muted`}>iRating</dt>
                    <dd className={`${rowClass} num text-base`}>
                      {profile.sportsCarIrating !== null ? profile.sportsCarIrating.toLocaleString('en-US') : '—'}
                    </dd>
                    <dt className={`${rowClass} text-ds-muted`}>Safety</dt>
                    <dd className={rowClass}>
                      {profile.sportsCarSafetyRating ? (
                        <span
                          className="slant num inline-block px-3 py-px text-sm"
                          style={licenseClassStyle(profile.sportsCarSafetyRating)}
                        >
                          {profile.sportsCarSafetyRating}
                        </span>
                      ) : (
                        '—'
                      )}
                    </dd>
                    <dt className={`${rowClass} text-ds-muted`}>Customer ID</dt>
                    <dd className={`${rowClass} font-bold`}>#{profile.iracingCustomerId}</dd>
                  </dl>
                  {profile.iracingStatsSyncedAt && (
                    <span className="text-xs text-ds-dim">
                      Synced{' '}
                      {new Date(profile.iracingStatsSyncedAt).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      · refreshes weekly
                    </span>
                  )}
                  <button type="button" onClick={handleLinkClick} className="btn-secondary">
                    Re-link iRacing
                  </button>
                </>
              ) : (
                <>
                  <p className="m-0 text-sm text-ds-muted">Not linked yet</p>
                  <button type="button" onClick={handleLinkClick} className="btn-primary">
                    Link iRacing Account
                  </button>
                </>
              )}
            </section>

            {discordName && user && (
              <section aria-labelledby="dc" className="cut flex flex-col gap-3 bg-ds-panel px-[22px] py-5">
                <h2 id="dc" className="h2">
                  Discord
                </h2>
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="cut-xs flex h-9 w-9 shrink-0 items-center justify-center bg-[#5865F2] font-black italic text-on-accent"
                  >
                    {initials(discordName)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{discordName}</span>
                    <span className="truncate text-xs text-ds-muted">@{user.discordUsername} · used to sign in</span>
                  </span>
                </span>
              </section>
            )}
          </aside>
        </div>

        <div className="cut flex flex-wrap items-center justify-end gap-2.5 bg-ds-panel px-[18px] py-3.5">
          <span role="status" className="mr-auto text-[13px] text-ds-muted">
            {dirty ? 'You have unsaved changes' : 'All changes saved'}
          </span>
          <Link to={`/drivers/${profile.id}`} className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save profile'}
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
        </div>
      </form>
    </div>
  );
}
