import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AvatarUpload from '../../components/AvatarUpload';
import { SwitchRow, StintsRow } from '../../components/RacePreferenceFields';
import TimezoneAutocomplete from '../../components/TimezoneAutocomplete';
import { ApiError } from '../../lib/api';
import { driversApi } from '../../lib/api/drivers';
import { licenseClassStyle } from '../../lib/iracingClass';
import type { CreateManualDriverInput, IracingDriverCandidate } from '../../types/driver';

const EMPTY: CreateManualDriverInput = { displayName: '' };

export default function DriverFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<CreateManualDriverInput>(EMPTY);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkedElsewhere, setLinkedElsewhere] = useState(false);

  const [candidate, setCandidate] = useState<IracingDriverCandidate | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<IracingDriverCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    driversApi.getById(id).then((driver) => {
      if (cancelled) return;
      setLinkedElsewhere(driver.userId !== null);
      setAvatarUrl(driver.avatarUrl);
      setForm({
        displayName: driver.displayName,
        country: driver.country ?? undefined,
        preferredClasses: driver.preferredClasses ?? undefined,
        timezone: driver.timezone ?? undefined,
        bio: driver.bio ?? undefined,
        maxSuccessiveStints: driver.maxSuccessiveStints ?? undefined,
        startingDriver: driver.startingDriver,
        wetDriver: driver.wetDriver,
        nightDriver: driver.nightDriver,
      });
      if (driver.iracingCustomerId) {
        setCandidate({
          custId: Number(driver.iracingCustomerId),
          name: driver.iracingName ?? '',
          location: driver.iracingLocation,
          countryCode: driver.iracingCountryCode,
          sportsCarIrating: driver.sportsCarIrating,
          sportsCarSafetyRating: driver.sportsCarSafetyRating,
        });
      }
      setLoaded(true);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setLoadError(err instanceof Error ? err.message : 'Failed to load the driver.');
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    let cancelled = false;
    const timeout = setTimeout(() => {
      driversApi
        .searchIracing(search.trim())
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch((err: unknown) => {
          if (!cancelled) setSearchError(err instanceof ApiError ? err.message : 'Search failed');
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search]);

  function pickCandidate(c: IracingDriverCandidate) {
    setCandidate(c);
    if (!form.displayName) {
      setForm({ ...form, displayName: c.name });
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: CreateManualDriverInput = {
        ...form,
        ...(candidate && {
          iracingCustId: candidate.custId,
          iracingName: candidate.name,
          iracingLocation: candidate.location ?? undefined,
          iracingCountryCode: candidate.countryCode ?? undefined,
          sportsCarIrating: candidate.sportsCarIrating ?? undefined,
          sportsCarSafetyRating: candidate.sportsCarSafetyRating ?? undefined,
        }),
      };

      let driverId = id;
      if (isEdit && id) {
        await driversApi.update(id, {
          displayName: form.displayName,
          country: form.country,
          preferredClasses: form.preferredClasses,
          timezone: form.timezone ?? null,
          bio: form.bio,
          maxSuccessiveStints: form.maxSuccessiveStints ?? null,
          startingDriver: form.startingDriver,
          wetDriver: form.wetDriver,
          nightDriver: form.nightDriver,
        });
        if (candidate) {
          await driversApi.applyIracingSnapshot(id, candidate);
        }
      } else {
        const created = await driversApi.create(input);
        driverId = created.id;
      }

      navigate(`/drivers/${driverId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save driver');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return loadError ? (
      <p role="alert" className="m-0 text-sm text-ds-danger">
        {loadError}
      </p>
    ) : (
      <p role="status" className="m-0 text-sm text-ds-muted">
        Loading...
      </p>
    );
  }

  if (linkedElsewhere) {
    return (
      <p className="cut m-0 max-w-xl bg-ds-panel px-6 py-[22px] text-sm text-ds-muted">
        This driver is linked to a portal member and manages their own profile — it can't be edited here.
      </p>
    );
  }

  const title = isEdit ? 'Edit guest driver' : 'New guest driver';

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
        <span className="text-ds-ink">{title}</span>
      </nav>
      <div className="flex max-w-[760px] flex-col gap-1">
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">{title}</h1>
        <span className="text-ds-muted">
          For drivers who race with us but don’t have a portal login. They show up on the roster and can be put on
          crews.
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
          <section aria-labelledby="link-ir" className="cut flex flex-col gap-3.5 bg-ds-panel pb-2 pt-[22px]">
            <div className="flex flex-col gap-1 px-6">
              <h2 id="link-ir" className="h2">
                Link an iRacing account
              </h2>
              <span className="text-[13px] text-ds-muted">
                Pulls in their name, country, iRating and safety rating. Guests don’t auto-refresh, so re-pick them to
                update.
              </span>
            </div>

            {candidate && (
              <div className="px-6">
                <div className="cut-sm flex items-center gap-3 bg-ds-field px-3.5 py-3">
                  {candidate.countryCode && (
                    <span className="text-[11px] font-bold text-ds-dim">{candidate.countryCode}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate font-bold">{candidate.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {candidate.sportsCarSafetyRating && (
                        <span
                          className="slant num px-3 py-px text-[13px]"
                          style={licenseClassStyle(candidate.sportsCarSafetyRating)}
                        >
                          {candidate.sportsCarSafetyRating}
                        </span>
                      )}
                      {candidate.sportsCarIrating && (
                        <span className="flex items-baseline gap-1">
                          <span className="num text-[15px]">{candidate.sportsCarIrating.toLocaleString('en-US')}</span>
                          <span className="text-xs font-bold text-ds-muted">iR</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCandidate(null)}
                    className="shrink-0 cursor-pointer border-0 bg-transparent text-xs font-bold uppercase text-ds-muted hover:text-ds-ink"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div className="px-6">
              <div className="cut-sm flex h-11 items-center gap-2 bg-ds-field px-3.5 text-ds-muted focus-within:shadow-[inset_0_-2px_0_var(--color-w2w-red)]">
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
                  <path d="M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM16 16l4.5 4.5" />
                </svg>
                <input
                  type="text"
                  aria-label="Search iRacing members"
                  placeholder="Search iRacing members"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent text-ds-ink outline-none placeholder:text-ds-dim"
                />
              </div>
            </div>

            {(searching || searchError || (results && results.length === 0)) && (
              <div className="flex flex-col gap-1 px-6">
                {searching && <p className="m-0 text-xs text-ds-muted">Searching...</p>}
                {searchError && <p className="m-0 text-xs text-ds-danger">{searchError}</p>}
                {results && results.length === 0 && !searching && (
                  <p className="m-0 text-xs text-ds-muted">No matches.</p>
                )}
              </div>
            )}

            {results && results.length > 0 && (
              <div className="flex max-h-96 flex-col overflow-y-auto">
                {results.map((r) => {
                  const on = candidate?.custId === r.custId;
                  return (
                    <button
                      key={r.custId}
                      type="button"
                      aria-pressed={on}
                      onClick={() => pickCandidate(r)}
                      className={`row-hover flex min-h-[52px] w-full cursor-pointer items-center gap-3 border-0 border-t border-solid border-ds-line px-6 py-2.5 text-left text-ds-ink ${
                        on ? 'bg-ds-raised shadow-[inset_3px_0_0_var(--color-w2w-red)]' : 'bg-transparent'
                      }`}
                    >
                      <span className="w-[22px] shrink-0 text-[11px] font-bold text-ds-dim">{r.countryCode}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{r.name}</span>
                        {r.location && <span className="block truncate text-xs text-ds-muted">{r.location}</span>}
                      </span>
                      {r.sportsCarSafetyRating && (
                        <span
                          className="slant num px-3 py-px text-[13px]"
                          style={licenseClassStyle(r.sportsCarSafetyRating)}
                        >
                          {r.sportsCarSafetyRating}
                        </span>
                      )}
                      {r.sportsCarIrating !== null && (
                        <span className="flex min-w-[76px] items-baseline justify-end gap-1">
                          <span className="num text-[17px]">{r.sportsCarIrating.toLocaleString('en-US')}</span>
                          <span className="text-xs font-bold text-ds-muted">iR</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <form id="driver-form" onSubmit={handleSubmit}>
            <section aria-labelledby="det" className="cut flex flex-col gap-4 bg-ds-panel px-6 py-[22px]">
              <h2 id="det" className="h2">
                Details
              </h2>
              {isEdit && id && (
                <AvatarUpload
                  avatarUrl={avatarUrl}
                  displayName={form.displayName}
                  onUpload={(file) => driversApi.uploadAvatarAsAdmin(id, file).then((d) => setAvatarUrl(d.avatarUrl))}
                  onRemove={() => driversApi.removeAvatarAsAdmin(id).then((d) => setAvatarUrl(d.avatarUrl))}
                />
              )}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-4 gap-y-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="lbl">Display name</span>
                  <input
                    required
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    className="input min-h-11 px-3.5"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="lbl">Country</span>
                  <input
                    value={form.country ?? ''}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="input min-h-11 px-3.5"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="lbl">Preferred classes</span>
                  <input
                    value={form.preferredClasses ?? ''}
                    onChange={(e) => setForm({ ...form, preferredClasses: e.target.value })}
                    placeholder="e.g. GT3, GTP"
                    className="input min-h-11 px-3.5"
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="lbl">Timezone</span>
                  <TimezoneAutocomplete
                    value={form.timezone ?? null}
                    onChange={(timezone) => setForm({ ...form, timezone: timezone ?? undefined })}
                  />
                </div>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Bio</span>
                <textarea
                  rows={3}
                  value={form.bio ?? ''}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="input resize-y px-3.5 py-3"
                />
              </label>
            </section>
          </form>
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
              on={form.startingDriver ?? false}
              onChange={(on) => setForm({ ...form, startingDriver: on })}
            />
            <SwitchRow
              label="Wet driver"
              on={form.wetDriver ?? false}
              onChange={(on) => setForm({ ...form, wetDriver: on })}
            />
            <SwitchRow
              label="Night driver"
              on={form.nightDriver ?? false}
              onChange={(on) => setForm({ ...form, nightDriver: on })}
            />
            <StintsRow
              value={form.maxSuccessiveStints ?? null}
              onChange={(next) => setForm({ ...form, maxSuccessiveStints: next ?? undefined })}
            />
          </section>
          <div className="flex flex-col gap-2">
            {error && (
              <p role="alert" className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-ds-danger">
                {error}
              </p>
            )}
            <button type="submit" form="driver-form" disabled={saving} className="btn-primary min-h-[46px]">
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add driver'}
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
            <Link to={isEdit && id ? `/drivers/${id}` : '/drivers'} className="btn-secondary min-h-11 justify-center">
              Cancel
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
