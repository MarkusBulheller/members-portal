import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import Pagination from '../../components/Pagination';
import RaceResultRow from '../../components/RaceResultRow';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError, resolveAssetUrl } from '../../lib/api';
import { carsApi } from '../../lib/api/cars';
import { raceResultsApi } from '../../lib/api/raceResults';
import { tracksApi } from '../../lib/api/tracks';
import { formatDuration } from '../../lib/lapTime';
import { usePagination } from '../../lib/usePagination';
import type { Car, CreateCarTrackSetupInput } from '../../types/car';
import type { RaceResult } from '../../types/raceResult';
import type { Track } from '../../types/track';

const EMPTY_SETUP: CreateCarTrackSetupInput = { trackId: '' };

export default function CarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [car, setCar] = useState<Car | null>(null);
  const [races, setRaces] = useState<RaceResult[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveryName, setLiveryName] = useState('');
  const [liveryFile, setLiveryFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [setupForm, setSetupForm] = useState<CreateCarTrackSetupInput>(EMPTY_SETUP);
  const [savingSetup, setSavingSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ fuelPerLapLiters: string; pitLaneTimeSeconds: string; notes: string }>({
    fuelPerLapLiters: '',
    pitLaneTimeSeconds: '',
    notes: '',
  });

  const load = () => {
    if (id) void carsApi.getById(id).then(setCar);
  };

  useEffect(load, [id]);

  useEffect(() => {
    if (id) void raceResultsApi.listByCar(id).then(setRaces);
  }, [id]);

  const { page, setPage, totalPages, pageItems: pagedRaces } = usePagination(races);

  useEffect(() => {
    if (user?.role === 'ADMIN') void tracksApi.list().then(setTracks);
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
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload livery');
    } finally {
      setUploading(false);
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
      load();
    } catch (err) {
      setSetupError(err instanceof ApiError ? err.message : 'Failed to add track setup');
    } finally {
      setSavingSetup(false);
    }
  }

  function startEditSetup(setup: Car['trackSetups'][number]) {
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
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  return (
    <div>
      <Link to="/cars" className="text-xs text-white/65 hover:text-white">
        ← Back to fleet
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          {car.imageUrl && (
            <img src={car.imageUrl} alt="" className="h-16 w-24 object-cover bg-black/30 shrink-0" />
          )}
          <div>
            <h1 className="font-display font-black text-3xl uppercase text-w2w-white">{car.name}</h1>
            <p className="text-white/65 text-sm mt-1">{car.carClass}</p>
          </div>
        </div>
        {user?.role === 'ADMIN' && (
          <Link
            to={`/cars/${car.id}/edit`}
            className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors shrink-0"
          >
            Edit
          </Link>
        )}
      </div>

      <div className="mt-6 max-w-[200px]">
        <div className="bg-w2w-charcoal border border-white/10 p-4">
          <p className="font-heading text-[11px] tracking-[0.2em] text-white/65 uppercase">Tank Capacity</p>
          <p className="mt-1 font-display font-bold text-xl text-w2w-white">{car.tankCapacityLiters} L</p>
        </div>
      </div>

      {car.notes && <p className="mt-6 text-white/60 text-sm leading-relaxed max-w-2xl">{car.notes}</p>}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">Liveries</h2>

      <form onSubmit={handleUpload} className="mb-6 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2">
            <span className="font-heading text-[11px] tracking-[0.2em] uppercase text-white/65">Name</span>
            <input
              type="text"
              required
              value={liveryName}
              onChange={(e) => setLiveryName(e.target.value)}
              placeholder="e.g. Season 3 Primary"
              className="input w-56"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-[11px] tracking-[0.2em] uppercase text-white/65">Image</span>
            <input
              ref={fileInputRef}
              type="file"
              required
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setLiveryFile(e.target.files?.[0] ?? null)}
              className="text-xs text-white/60 file:mr-3 file:px-4 file:py-2 file:border-0 file:bg-w2w-red file:text-on-accent file:font-heading file:text-xs file:uppercase file:tracking-wide file:cursor-pointer"
            />
          </label>
          <button
            type="submit"
            disabled={uploading || !liveryFile || !liveryName.trim()}
            className="px-4 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold text-xs uppercase tracking-wide transition-colors clip-corner"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          {error && <p className="text-w2w-red text-xs w-full">{error}</p>}
      </form>

      {car.liveries.length === 0 ? (
        <p className="text-white/65 text-sm">No liveries uploaded yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {car.liveries.map((livery) => (
            <div key={livery.id} className="bg-w2w-charcoal border border-white/10 overflow-hidden">
              <img src={resolveAssetUrl(livery.imageUrl)} alt={livery.name} className="w-full h-40 object-cover" />
              <div className="p-3">
                <p className="text-white text-sm truncate">{livery.name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <a
                    href={resolveAssetUrl(livery.imageUrl)}
                    download={livery.name}
                    className="text-w2w-red text-xs hover:text-w2w-red-bright"
                  >
                    Download
                  </a>
                  {user?.role === 'ADMIN' && (
                    <button
                      onClick={() => void handleRemoveLivery(livery.id)}
                      className="text-white/65 text-xs hover:text-white"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">Track Setups</h2>

      {user?.role === 'ADMIN' && (
        <form onSubmit={handleAddSetup} className="mb-6 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2">
            <span className="font-heading text-[11px] tracking-[0.2em] uppercase text-white/65">Track</span>
            <select
              required
              value={setupForm.trackId}
              onChange={(e) => setSetupForm({ ...setupForm, trackId: e.target.value })}
              className="input w-56"
            >
              <option value="">Select a track...</option>
              {(tracks ?? [])
                .filter((track) => !car.trackSetups.some((setup) => setup.trackId === track.id))
                .map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-[11px] tracking-[0.2em] uppercase text-white/65">
              Fuel / Lap (L)
            </span>
            <input
              type="number"
              step="0.001"
              min="0"
              value={setupForm.fuelPerLapLiters ?? ''}
              onChange={(e) =>
                setSetupForm({
                  ...setupForm,
                  fuelPerLapLiters: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="input w-32"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-[11px] tracking-[0.2em] uppercase text-white/65">
              Pit Lane Drive-Through (s)
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={setupForm.pitLaneTimeSeconds ?? ''}
              onChange={(e) =>
                setSetupForm({
                  ...setupForm,
                  pitLaneTimeSeconds: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="input w-32"
            />
          </label>
          <button
            type="submit"
            disabled={savingSetup || !setupForm.trackId}
            className="px-4 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold text-xs uppercase tracking-wide transition-colors clip-corner"
          >
            {savingSetup ? 'Adding...' : 'Add'}
          </button>
          {setupError && <p className="text-w2w-red text-xs w-full">{setupError}</p>}
        </form>
      )}

      {car.trackSetups.length === 0 ? (
        <p className="text-white/65 text-sm">No track-specific setups yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {car.trackSetups.map((setup) => (
            <div key={setup.id} className="bg-w2w-charcoal border border-white/10 p-4">
              <p className="text-white text-sm font-heading font-semibold">{setup.track.name}</p>
              <p className="text-white/65 text-xs mt-0.5">{setup.track.category}</p>

              {editingSetupId === setup.id ? (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-white/65 uppercase tracking-wide">Fuel / Lap (L)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={editForm.fuelPerLapLiters}
                      onChange={(e) => setEditForm({ ...editForm, fuelPerLapLiters: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-white/65 uppercase tracking-wide">
                      Pit Lane Drive-Through (s)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.pitLaneTimeSeconds}
                      onChange={(e) => setEditForm({ ...editForm, pitLaneTimeSeconds: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-white/65 uppercase tracking-wide">Notes</label>
                    <textarea
                      rows={2}
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      className="input resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={() => void handleSaveSetup(setup.id)}
                      className="text-w2w-red text-xs hover:text-w2w-red-bright"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingSetupId(null)}
                      className="text-white/65 text-xs hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-white/65 uppercase tracking-wide">Fuel / Lap</p>
                      <p className="text-white text-sm">
                        {setup.fuelPerLapLiters ? `${setup.fuelPerLapLiters} L` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/65 uppercase tracking-wide">Pit Drive-Through</p>
                      <p className="text-white text-sm">
                        {setup.pitLaneTimeSeconds ? `${setup.pitLaneTimeSeconds} s` : '—'}
                      </p>
                    </div>
                  </div>
                  {setup.notes && <p className="mt-2 text-white/65 text-xs leading-relaxed">{setup.notes}</p>}
                  {user?.role === 'ADMIN' && (
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={() => startEditSetup(setup)}
                        className="text-white/65 text-xs hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleRemoveSetup(setup.id)}
                        className="text-white/65 text-xs hover:text-white"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">Races</h2>
      {races === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : races.length === 0 ? (
        <p className="text-white/65 text-sm">No race results recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {pagedRaces?.map((race) => {
            const durationMs =
              race.startTime && race.endTime
                ? new Date(race.endTime).getTime() - new Date(race.startTime).getTime()
                : null;
            return (
              <RaceResultRow
                key={race.id}
                to={`/results/${race.id}`}
                title={`${race.trackName}${race.trackConfig ? ` — ${race.trackConfig}` : ''}`}
                subtitle={[race.seriesName, race.startTime ? new Date(race.startTime).toLocaleDateString() : null]
                  .filter(Boolean)
                  .join(' · ')}
                position={race.finishingPositionInClass ?? race.finishingPosition}
                statsLine={[
                  `${race.teamLapsComplete ?? '—'} laps`,
                  formatDuration(durationMs),
                  `${race.teamIncidents ?? 0}x incidents`,
                ].join(' · ')}
              />
            );
          })}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
