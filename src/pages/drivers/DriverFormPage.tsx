import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CountryFlag from '../../components/CountryFlag';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);
  const [linkedElsewhere, setLinkedElsewhere] = useState(false);

  const [candidate, setCandidate] = useState<IracingDriverCandidate | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<IracingDriverCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void driversApi.getById(id).then((driver) => {
      setLinkedElsewhere(driver.userId !== null);
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
    });
  }, [id]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const timeout = setTimeout(() => {
      driversApi
        .searchIracing(search.trim())
        .then(setResults)
        .catch((err: unknown) => {
          setSearchError(err instanceof ApiError ? err.message : 'Search failed');
        })
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timeout);
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
    return <p role="status" className="text-white/65 text-sm">Loading...</p>;
  }

  if (linkedElsewhere) {
    return (
      <div className="max-w-xl">
        <p className="text-white/60 text-sm">
          This driver is linked to a portal member and manages their own profile — it can't be edited here.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-8">
        {isEdit ? 'Edit Driver' : 'New Driver'}
      </h1>

      <div className="grid md:grid-cols-[1fr_360px] gap-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Display Name</span>
            <input
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Country</span>
            <input
              value={form.country ?? ''}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">
              Preferred Classes (e.g. GT3, GTP)
            </span>
            <input
              value={form.preferredClasses ?? ''}
              onChange={(e) => setForm({ ...form, preferredClasses: e.target.value })}
              className="input"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Timezone</span>
            <TimezoneAutocomplete
              value={form.timezone ?? null}
              onChange={(timezone) => setForm({ ...form, timezone: timezone ?? undefined })}
            />
          </div>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Bio</span>
            <textarea
              rows={4}
              value={form.bio ?? ''}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="input resize-none"
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
                value={form.maxSuccessiveStints ?? ''}
                onChange={(e) =>
                  setForm({ ...form, maxSuccessiveStints: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                className="input"
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
                  checked={form[field] ?? false}
                  onChange={(e) => setForm({ ...form, [field]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>

          {error && <p role="alert" className="text-w2w-red text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-sm transition-colors clip-corner"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Driver'}
          </button>
        </form>

        <div className="bg-w2w-charcoal border border-white/10 p-4 h-fit">
          <p className="font-heading text-xs tracking-[0.2em] uppercase text-white/65 mb-3">Link iRacing Account</p>

          {candidate && (
            <div className="mb-3 flex items-center gap-3 bg-black/30 p-3">
              <CountryFlag countryCode={candidate.countryCode} className="text-base rounded-sm shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm truncate">{candidate.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  {candidate.sportsCarIrating && (
                    <span className="text-[11px] font-heading text-w2w-red">{candidate.sportsCarIrating} iR</span>
                  )}
                  {candidate.sportsCarSafetyRating && (
                    <span
                      className="px-1.5 py-0.5 text-[10px] font-heading font-semibold"
                      style={licenseClassStyle(candidate.sportsCarSafetyRating)}
                    >
                      {candidate.sportsCarSafetyRating}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCandidate(null)}
                className="text-white/65 text-xs hover:text-white shrink-0"
              >
                Clear
              </button>
            </div>
          )}

          <input
            type="text"
            aria-label="Search iRacing members"
            placeholder="Search iRacing members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input mb-3"
          />

          {searching && <p className="text-white/65 text-xs">Searching...</p>}
          {searchError && <p className="text-w2w-red text-xs">{searchError}</p>}

          {results && results.length === 0 && !searching && (
            <p className="text-white/65 text-xs">No matches.</p>
          )}

          {results && results.length > 0 && (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.custId}
                  type="button"
                  onClick={() => pickCandidate(r)}
                  className="w-full flex items-center gap-3 text-left px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <CountryFlag countryCode={r.countryCode} className="text-sm rounded-sm shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{r.name}</p>
                    <p className="text-[11px] text-white/65 truncate">
                      {[r.location, r.sportsCarIrating ? `${r.sportsCarIrating} iR` : null, r.sportsCarSafetyRating]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
