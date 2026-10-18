import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import Pagination from '../../components/Pagination';
import { formatRaceDate, positionLabel } from '../../components/RaceResultRow';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError, resolveAssetUrl } from '../../lib/api';
import { carsApi } from '../../lib/api/cars';
import { raceResultsApi } from '../../lib/api/raceResults';
import { tracksApi } from '../../lib/api/tracks';
import { formatDuration } from '../../lib/lapTime';
import { usePagination } from '../../lib/usePagination';
import type { CarDetail, CreateCarTrackSetupInput } from '../../types/car';
import type { RaceResultSummary } from '../../types/raceResult';
import type { Track } from '../../types/track';

const EMPTY_SETUP: CreateCarTrackSetupInput = { trackId: '' };

const CAR_PATH = 'M3 14l2.2-5.5A2 2 0 0 1 7 7h10a2 2 0 0 1 1.8 1.5L21 14v3H3zM7 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM17 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z';

/** Position tag colours: podium medals are hardcoded in the design (same in both themes). */
function positionTagClass(position: number | null): string {
  if (position === 1) return 'bg-[#e8c34a] text-[#111113]';
  if (position === 2) return 'bg-[#c7cbd1] text-[#111113]';
  if (position === 3) return 'bg-[#cd8a4e] text-[#111113]';
  return 'bg-ds-control text-ds-ink-soft';
}

/** Decimal columns come back as strings with trailing zeros ("2.850", "31.00"); show them as plain numbers. */
function formatDecimal(value: string | number | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

const GRID_COLS = 'grid-cols-[minmax(0,1.5fr)_110px_150px_minmax(0,2fr)_150px]';

export default function CarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [car, setCar] = useState<CarDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [races, setRaces] = useState<RaceResultSummary[] | null>(null);
  const [racesError, setRacesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveryName, setLiveryName] = useState('');
  const [liveryFile, setLiveryFile] = useState<File | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [setupForm, setSetupForm] = useState<CreateCarTrackSetupInput>(EMPTY_SETUP);
  const [addingSetup, setAddingSetup] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ fuelPerLapLiters: string; pitLaneTimeSeconds: string; notes: string }>({
    fuelPerLapLiters: '',
    pitLaneTimeSeconds: '',
    notes: '',
  });

  // Bumping `reloadTick` re-runs the load effect (after a mutation); a response only lands if the
  // effect hasn't been cleaned up since (car id changed / newer reload / unmount).
  const [reloadTick, setReloadTick] = useState(0);
  const load = () => setReloadTick((tick) => tick + 1);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    carsApi
      .getById(id)
      .then((loaded) => {
        if (cancelled) return;
        setCar(loaded);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load the car.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadTick]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    raceResultsApi
      .listByCar(id)
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

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let cancelled = false;
    tracksApi
      .list()
      .then((loaded) => {
        if (!cancelled) setTracks(loaded);
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !liveryFile || !liveryName.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await carsApi.uploadLivery(id, liveryFile, liveryName.trim());
      setLiveryName('');
      setLiveryFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowUploadForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload livery');
    } finally {
      setUploading(false);
    }
  }

  /** Retire = the backend's soft delete (DELETE /cars/:id); Restore flips `active` back via PATCH. */
  async function handleToggleActive() {
    if (!car) return;
    setStatusError(null);
    try {
      if (car.active) {
        const ok = await confirm(
          `Retire ${car.name}? It stays in the library and keeps its history, but drops out of the default cars list and event signups.`,
          { title: 'Retire this car?', confirmLabel: 'Retire' },
        );
        if (!ok) return;
        await carsApi.remove(car.id);
      } else {
        await carsApi.update(car.id, { active: true });
      }
      load();
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Failed to update the car');
    }
  }

  async function handleRemoveLivery(liveryId: string) {
    if (!(await confirm('Remove this livery image?', { confirmLabel: 'Remove' }))) return;
    await carsApi.removeLivery(liveryId);
    load();
  }

  async function handleAddSetup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !setupForm.trackId) return;
    setSavingSetup(true);
    setSetupError(null);
    try {
      await carsApi.addTrackSetup(id, setupForm);
      setSetupForm(EMPTY_SETUP);
      setAddingSetup(false);
      load();
    } catch (err) {
      setSetupError(err instanceof ApiError ? err.message : 'Failed to add track setup');
    } finally {
      setSavingSetup(false);
    }
  }

  function startEditSetup(setup: CarDetail['trackSetups'][number]) {
    setEditingSetupId(setup.id);
    setEditForm({
      fuelPerLapLiters: setup.fuelPerLapLiters ?? '',
      pitLaneTimeSeconds: setup.pitLaneTimeSeconds ?? '',
      notes: setup.notes ?? '',
    });
  }

  async function handleSaveSetup(setupId: string) {
    await carsApi.updateTrackSetup(setupId, {
      fuelPerLapLiters: editForm.fuelPerLapLiters ? Number(editForm.fuelPerLapLiters) : undefined,
      pitLaneTimeSeconds: editForm.pitLaneTimeSeconds ? Number(editForm.pitLaneTimeSeconds) : undefined,
      notes: editForm.notes || undefined,
    });
    setEditingSetupId(null);
    load();
  }

  async function handleRemoveSetup(setupId: string) {
    if (!(await confirm('Remove this track setup?', { confirmLabel: 'Remove' }))) return;
    await carsApi.removeTrackSetup(setupId);
    load();
  }

  if (!car) {
    return loadError ? (
      <p role="alert" className="text-sm text-ds-danger">
        {loadError}
      </p>
    ) : (
      <p className="text-ds-muted text-sm">Loading...</p>
    );
  }

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ds-muted">
        <Link to="/cars" className="font-semibold text-ds-muted hover:text-ds-ink">
          Cars
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="min-w-0 truncate font-semibold text-ds-ink">{car.name}</span>
      </nav>

      {statusError && (
        <p role="alert" className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]">
          {statusError}
        </p>
      )}

      <header className="cut-lg relative flex flex-wrap overflow-hidden bg-ds-panel">
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 top-0 w-[56px] min-[640px]:w-[150px]"
          style={{
            background:
              'linear-gradient(110deg, transparent 0 28%, var(--color-w2w-red) 28% 40%, transparent 40% 50%, var(--color-w2w-red) 50% 100%)',
          }}
        />
        <div className="flex min-h-[220px] flex-[1_1_300px] flex-col items-center justify-center gap-1.5 bg-ds-sidebar text-ds-dim/60">
          {car.imageUrl ? (
            <img
              src={resolveAssetUrl(car.imageUrl)}
              alt=""
              decoding="async"
              className="h-full max-h-[260px] w-full object-cover"
            />
          ) : (
            <>
              <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <path d={CAR_PATH} />
              </svg>
              <span className="text-xs text-ds-dim">Car image</span>
            </>
          )}
        </div>
        <div className="box-border flex min-w-0 flex-[2_1_420px] flex-col justify-center gap-[18px] py-[26px] pl-7 pr-[72px] min-[640px]:pr-[180px]">
          <div className="flex flex-wrap items-start justify-between gap-3.5">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex gap-1.5">
                <span className="chip bg-ds-control px-3 py-[3px] text-ds-ink">{car.carClass}</span>
                {car.active ? (
                  <span className="chip px-3 py-[3px] text-[#4ade80] [:root[data-theme=light]_&]:text-[#15803d]">Active</span>
                ) : (
                  <span className="chip chip-muted px-3 py-[3px]">Retired</span>
                )}
              </div>
              <h1 className="m-0 text-[36px] font-extrabold leading-[1.05]">{car.name}</h1>
            </div>
            {isAdmin && (
              <div className="flex items-start gap-2">
                <Link to={`/cars/${car.id}/edit`} className="btn-secondary min-h-10 px-[18px] text-[13px]">
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => void handleToggleActive()}
                  className={`${car.active ? 'btn-danger' : 'btn-secondary'} min-h-10 px-[18px] text-[13px]`}
                >
                  {car.active ? 'Retire' : 'Restore'}
                </button>
              </div>
            )}
          </div>
          <dl className="m-0 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(100px,1fr))]">
            <div className="flex flex-col">
              <dt className="text-[13px] font-semibold text-ds-muted">Tank</dt>
              <dd className="num m-0 text-[30px] leading-[1.1]">
                {Number(car.tankCapacityLiters) || car.tankCapacityLiters}
                <span className="text-lg text-ds-muted"> L</span>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[13px] font-semibold text-ds-muted">Races</dt>
              <dd className="num m-0 text-[30px] leading-[1.1]">{races === null ? (car.raceCount ?? '—') : races.length}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[13px] font-semibold text-ds-muted">Liveries</dt>
              <dd className="num m-0 text-[30px] leading-[1.1]">{car.liveries.length}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-[13px] font-semibold text-ds-muted">Track setups</dt>
              <dd className="num m-0 text-[30px] leading-[1.1]">{car.trackSetups.length}</dd>
            </div>
          </dl>
          {car.notes && <p className="m-0 text-ds-muted">{car.notes}</p>}
        </div>
      </header>

      {/* Liveries */}
      <section aria-labelledby="lv-title" className="flex flex-col gap-3.5 pt-2">
        <div className="flex items-center justify-between gap-2.5">
          <h2 id="lv-title" className="h2 !text-2xl">
            Liveries
          </h2>
          <button
            type="button"
            onClick={() => setShowUploadForm((v) => !v)}
            aria-expanded={showUploadForm}
            aria-controls="livery-upload-form"
            className="btn-secondary min-h-10 !gap-2 px-[18px] text-[13px]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
            </svg>
            Upload livery
          </button>
        </div>

        {showUploadForm && (
        <form id="livery-upload-form" onSubmit={handleUpload} className="cut-sm flex flex-wrap items-end gap-3 bg-ds-raised p-4">
          <label className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5">
            <span className="lbl">Name</span>
            <input
              type="text"
              required
              value={liveryName}
              onChange={(e) => setLiveryName(e.target.value)}
              placeholder="e.g. Season 3 Primary"
              className="input"
            />
          </label>
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
            <span className="lbl">Image</span>
            <input
              ref={fileInputRef}
              type="file"
              required
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setLiveryFile(e.target.files?.[0] ?? null)}
              className="min-h-[42px] min-w-0 text-xs text-ds-muted file:mr-3 file:h-[42px] file:cursor-pointer file:border-0 file:bg-ds-control file:px-4 file:text-xs file:font-bold file:uppercase file:text-ds-ink"
            />
          </label>
          <button type="submit" disabled={uploading || !liveryFile || !liveryName.trim()} className="btn-primary">
            {uploading ? 'Uploading...' : 'Upload livery'}
          </button>
          <button type="button" onClick={() => setShowUploadForm(false)} className="btn-secondary">
            Cancel
          </button>
          {error && <p className="m-0 w-full text-xs text-ds-danger">{error}</p>}
        </form>
        )}

        {car.liveries.length === 0 ? (
          <p className="m-0 text-sm text-ds-muted">No liveries uploaded yet.</p>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            {car.liveries.map((livery) => (
              <article key={livery.id} className="cut overflow-hidden bg-ds-panel">
                <img
                  src={resolveAssetUrl(livery.imageUrl)}
                  alt={livery.name}
                  width={240}
                  height={130}
                  loading="lazy"
                  decoding="async"
                  className="block h-[130px] w-full bg-ds-sidebar object-cover"
                />
                <div className="flex items-center justify-between gap-2 py-3 pl-4 pr-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{livery.name}</span>
                    <span className="text-xs text-ds-muted">
                      {livery.uploadedByName ? `Uploaded by ${livery.uploadedByName} · ` : 'Uploaded '}
                      {new Date(livery.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <a
                      href={resolveAssetUrl(livery.imageUrl)}
                      download={livery.name}
                      aria-label={`Download ${livery.name}`}
                      title="Download"
                      className="cut-xs flex h-9 w-9 items-center justify-center bg-ds-raised text-ds-ink-soft hover:bg-ds-control-hover"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                        <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
                      </svg>
                    </a>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveLivery(livery.id)}
                        aria-label={`Remove ${livery.name}`}
                        title="Remove"
                        className="cut-xs flex h-9 w-9 cursor-pointer items-center justify-center border-0 bg-ds-raised text-ds-ink-soft hover:bg-ds-control-hover"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </svg>
                      </button>
                    )}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Track setups */}
      <section aria-labelledby="ts-title" className="cut flex flex-col gap-2.5 bg-ds-panel pb-1.5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5">
          <div className="flex flex-col gap-1">
            <h2 id="ts-title" className="h2">
              Track setups
            </h2>
            <span className="text-[13px] text-ds-muted">
              Fuel and pit numbers here pre-fill every stint plan for this car at that track.
            </span>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setAddingSetup((v) => !v)}
              aria-expanded={addingSetup}
              className="btn-secondary min-h-10 !gap-2 px-[18px] text-[13px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add track
            </button>
          )}
        </div>

        {isAdmin && addingSetup && (
          <form
            onSubmit={handleAddSetup}
            className="cut-sm mx-5 my-1 flex flex-wrap items-end gap-3 bg-ds-raised p-4"
          >
            <label className="flex min-w-0 flex-[2_1_200px] flex-col gap-1.5">
              <span className="lbl">Track</span>
              <select
                required
                value={setupForm.trackId}
                onChange={(e) => setSetupForm({ ...setupForm, trackId: e.target.value })}
                className="input"
              >
                <option value="">Select a track…</option>
                {(tracks ?? [])
                  .filter((track) => !car.trackSetups.some((setup) => setup.trackId === track.id))
                  .map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-[1_1_120px] flex-col gap-1.5">
              <span className="lbl">Fuel / lap (L)</span>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="2.85"
                value={setupForm.fuelPerLapLiters ?? ''}
                onChange={(e) =>
                  setSetupForm({
                    ...setupForm,
                    fuelPerLapLiters: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="input"
              />
            </label>
            <label className="flex min-w-0 flex-[1_1_140px] flex-col gap-1.5">
              <span className="lbl">Pit drive-through (s)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="31"
                value={setupForm.pitLaneTimeSeconds ?? ''}
                onChange={(e) =>
                  setSetupForm({
                    ...setupForm,
                    pitLaneTimeSeconds: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="input"
              />
            </label>
            <label className="flex min-w-0 flex-[3_1_220px] flex-col gap-1.5">
              <span className="lbl">Notes</span>
              <input
                type="text"
                maxLength={2000}
                placeholder="Optional"
                value={setupForm.notes ?? ''}
                onChange={(e) => setSetupForm({ ...setupForm, notes: e.target.value || undefined })}
                className="input"
              />
            </label>
            <button type="submit" disabled={savingSetup || !setupForm.trackId} className="btn-primary min-h-[42px]">
              {savingSetup ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setAddingSetup(false)} className="btn-secondary min-h-[42px] px-4 text-ds-ink-soft">
              Cancel
            </button>
            {setupError && <p className="m-0 w-full text-xs text-ds-danger">{setupError}</p>}
          </form>
        )}

        {car.trackSetups.length === 0 ? (
          <p className="m-0 px-5 pb-4 text-sm text-ds-muted">No track-specific setups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div role="table" aria-label="Track setups" className="min-w-[760px] text-sm">
              <div
                role="row"
                className={`grid ${GRID_COLS} items-center gap-x-3 px-5 py-1.5 text-[11px] font-bold uppercase text-ds-dim`}
              >
                <span role="columnheader">Track</span>
                <span role="columnheader" className="text-right">
                  Fuel / lap
                </span>
                <span role="columnheader" className="text-right">
                  Pit drive-through
                </span>
                <span role="columnheader" className="pl-3">
                  Notes
                </span>
                <span role="columnheader">
                  <span className="sr-only">Actions</span>
                </span>
              </div>
              {car.trackSetups.map((setup) => {
                const editing = editingSetupId === setup.id;
                return (
                  <div
                    key={setup.id}
                    role="row"
                    className={`grid ${GRID_COLS} items-center gap-x-3 border-t border-ds-line px-5 py-2 ${editing ? 'bg-ds-raised' : 'row-hover min-h-14'}`}
                  >
                    <span role="cell" className="flex min-w-0 flex-col">
                      <Link to={`/tracks/${setup.trackId}`} className="truncate font-bold text-ds-ink hover:text-w2w-red-ink">
                        {setup.track.name}
                      </Link>
                      <span className="text-xs text-ds-dim">{setup.track.category}</span>
                    </span>
                    {editing ? (
                      <>
                        <span role="cell">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            aria-label="Fuel / lap (L)"
                            value={editForm.fuelPerLapLiters}
                            onChange={(e) => setEditForm({ ...editForm, fuelPerLapLiters: e.target.value })}
                            className="input text-right"
                          />
                        </span>
                        <span role="cell">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label="Pit drive-through (s)"
                            value={editForm.pitLaneTimeSeconds}
                            onChange={(e) => setEditForm({ ...editForm, pitLaneTimeSeconds: e.target.value })}
                            className="input text-right"
                          />
                        </span>
                        <span role="cell" className="pl-3">
                          <textarea
                            rows={2}
                            aria-label="Notes"
                            value={editForm.notes}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                            className="input resize-none"
                          />
                        </span>
                        <span role="cell" className="flex justify-end gap-1">
                          <button type="button" onClick={() => void handleSaveSetup(setup.id)} className="btn-primary btn-sm">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingSetupId(null)} className="btn-secondary btn-sm">
                            Cancel
                          </button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span role="cell" className="num text-right text-base">
                          {setup.fuelPerLapLiters ? `${formatDecimal(setup.fuelPerLapLiters)} L` : '—'}
                        </span>
                        <span role="cell" className="num text-right text-base">
                          {setup.pitLaneTimeSeconds ? `${formatDecimal(setup.pitLaneTimeSeconds)} s` : '—'}
                        </span>
                        <span role="cell" className="pl-3 text-ds-muted">
                          {setup.notes || '—'}
                        </span>
                        <span role="cell" className="flex justify-end gap-1">
                          {isAdmin && (
                            <>
                              <button type="button" onClick={() => startEditSetup(setup)} className="btn-secondary cut-xs min-h-8 px-3 text-xs text-ds-ink-soft !bg-ds-raised hover:!bg-ds-control-hover">
                                Edit
                              </button>
                              <button type="button" onClick={() => void handleRemoveSetup(setup.id)} className="btn-secondary cut-xs min-h-8 px-3 text-xs text-ds-ink-soft !bg-ds-raised hover:!bg-ds-control-hover">
                                Remove
                              </button>
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Races */}
      <section aria-labelledby="rc-title" className="cut bg-ds-panel pb-1.5 pt-5">
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 id="rc-title" className="h2">
            Races in this car
          </h2>
          {races !== null && races.length > 0 && (
            <Link to={`/results?carId=${car.id}`} className="text-[13px] font-semibold">
              All {races.length}
            </Link>
          )}
        </div>
        {racesError && races === null ? (
          <p role="alert" className="m-0 px-5 pb-4 text-sm text-ds-danger">
            {racesError}
          </p>
        ) : races === null ? (
          <p className="m-0 px-5 pb-4 text-sm text-ds-muted">Loading...</p>
        ) : races.length === 0 ? (
          <p className="m-0 px-5 pb-4 text-sm text-ds-muted">No race results recorded yet.</p>
        ) : (
          <div>
            {pagedRaces?.map((race) => {
              const durationMs =
                race.startTime && race.endTime
                  ? new Date(race.endTime).getTime() - new Date(race.startTime).getTime()
                  : null;
              const position = race.finishingPositionInClass ?? race.finishingPosition;
              return (
                <Link
                  key={race.id}
                  to={`/results/${race.id}`}
                  className="row-hover flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-ds-line px-5 py-3 text-ds-ink"
                >
                  <span
                    className={`chip num min-w-12 flex-none justify-center px-2 py-[3px] text-base normal-case ${positionTagClass(position)}`}
                  >
                    {positionLabel(position)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">
                      {race.trackName}
                      {race.trackConfig ? ` — ${race.trackConfig}` : ''}
                    </span>
                    <span className="text-[13px] text-ds-muted">
                      {[race.seriesName, race.startTime ? formatRaceDate(race.startTime) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="w-full pl-[62px] text-xs text-ds-muted sm:w-auto sm:whitespace-nowrap sm:pl-0 sm:text-right">
                    {[
                      `${race.teamLapsComplete ?? '—'} laps`,
                      formatDuration(durationMs),
                      `${race.teamIncidents ?? 0}x incidents`,
                    ].join(' · ')}
                  </span>
                </Link>
              );
            })}
            <div className="px-5 pb-3">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
