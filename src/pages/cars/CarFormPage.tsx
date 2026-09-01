import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { carsApi } from '../../lib/api/cars';
import { iracingCarsApi } from '../../lib/api/iracingCars';
import { beginIracingCarSync } from '../../lib/iracing';
import type { CreateCarInput } from '../../types/car';
import { CAR_CLASSES } from '../../types/carClass';
import type { IracingCar } from '../../types/iracingCar';

const EMPTY: CreateCarInput = {
  name: '',
  carClass: '',
  tankCapacityLiters: 0,
  imageUrl: undefined,
};

export default function CarFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justSynced = searchParams.get('synced');
  const [form, setForm] = useState<CreateCarInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<IracingCar[] | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!id) return;
    void carsApi.getById(id).then((car) => {
      setForm({
        name: car.name,
        carClass: car.carClass,
        tankCapacityLiters: Number(car.tankCapacityLiters),
        notes: car.notes ?? undefined,
        imageUrl: car.imageUrl ?? undefined,
      });
    });
  }, [id]);

  useEffect(() => {
    if (isEdit) return;
    void iracingCarsApi.list().then(setCatalog);
  }, [isEdit]);

  function handleSync() {
    setSyncing(true);
    beginIracingCarSync().catch((err: unknown) => {
      setSyncing(false);
      setError(err instanceof Error ? `Could not start iRacing sync: ${err.message}` : 'Could not start iRacing sync.');
    });
  }

  function pickCar(car: IracingCar) {
    setForm({
      ...form,
      name: car.carName,
      imageUrl: car.smallImageUrl ?? undefined,
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit && id ? await carsApi.update(id, form) : await carsApi.create(form);
      navigate(`/cars/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save car');
    } finally {
      setSaving(false);
    }
  }

  const filteredCatalog =
    catalog?.filter((car) => car.carName.toLowerCase().includes(search.toLowerCase())) ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-8">
        {isEdit ? 'Edit Car' : 'New Car'}
      </h1>

      {justSynced && (
        <p className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">
          Synced {justSynced} cars from iRacing.
        </p>
      )}

      <div className="grid md:grid-cols-[1fr_320px] gap-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {form.imageUrl && (
            <img src={form.imageUrl} alt="" className="h-24 w-36 object-cover bg-black/30" />
          )}
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Car Class</span>
            <select
              required
              value={form.carClass}
              onChange={(e) => setForm({ ...form, carClass: e.target.value })}
              className="input"
            >
              <option value="" disabled>
                Select a class...
              </option>
              {CAR_CLASSES.map((carClass) => (
                <option key={carClass} value={carClass}>
                  {carClass}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">
              Tank Capacity (L)
            </span>
            <input
              required
              type="number"
              step="0.1"
              min="0"
              value={form.tankCapacityLiters}
              onChange={(e) => setForm({ ...form, tankCapacityLiters: Number(e.target.value) })}
              className="input max-w-[200px]"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Notes</span>
            <textarea
              rows={4}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input resize-none"
            />
          </label>

          {error && <p role="alert" className="text-w2w-red text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-sm transition-colors clip-corner"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Car'}
          </button>
        </form>

        {!isEdit && (
          <div className="bg-w2w-charcoal border border-white/10 p-4 h-fit">
            <div className="flex items-center justify-between mb-3">
              <p className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">
                Pick from iRacing
              </p>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-[11px] text-white/65 hover:text-white disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>

            {catalog === null ? (
              <p className="text-white/65 text-xs">Loading...</p>
            ) : catalog.length === 0 ? (
              <p className="text-white/65 text-xs">
                No cars synced yet. Click "Sync" to pull the car list from iRacing (requires
                signing in with an iRacing account).
              </p>
            ) : (
              <>
                <input
                  type="text"
                  aria-label="Search iRacing cars"
                  placeholder="Search cars..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input mb-3"
                />
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {filteredCatalog.map((car) => (
                    <button
                      key={car.carId}
                      type="button"
                      onClick={() => pickCar(car)}
                      className="w-full flex items-center gap-3 text-left px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {car.smallImageUrl ? (
                        <img src={car.smallImageUrl} alt="" className="h-8 w-12 object-cover shrink-0 bg-black/30" />
                      ) : (
                        <div className="h-8 w-12 shrink-0 bg-black/30" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate">{car.carName}</p>
                        {car.categories && <p className="text-[11px] text-white/65 truncate">{car.categories}</p>}
                      </div>
                    </button>
                  ))}
                  {filteredCatalog.length === 0 && (
                    <p className="text-white/65 text-xs px-3 py-2">No matches.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
