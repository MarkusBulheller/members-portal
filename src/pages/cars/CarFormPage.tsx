import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ImageDropZone from '../../components/ImageDropZone';
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
  // Lower-cased names of cars already in the library (retired ones included), so the picker can
  // tag and lock catalog entries that were added before.
  const [libraryNames, setLibraryNames] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    carsApi
      .getById(id)
      .then((car) => {
        if (cancelled) return;
        setForm({
          name: car.name,
          carClass: car.carClass,
          tankCapacityLiters: Number(car.tankCapacityLiters),
          notes: car.notes ?? undefined,
          imageUrl: car.imageUrl ?? undefined,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the car.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    iracingCarsApi
      .list()
      .then((loaded) => {
        if (!cancelled) setCatalog(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCatalog([]);
          setError(err instanceof Error ? err.message : 'Failed to load the iRacing car catalog.');
        }
      });
    // Only the names are needed here (the slim list has no liveries / setups).
    carsApi
      .list(true)
      .then((cars) => {
        if (!cancelled) setLibraryNames(new Set(cars.map((c) => c.name.toLowerCase())));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
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

  const title = isEdit ? 'Edit car' : 'New car';
  const backHref = isEdit && id ? `/cars/${id}` : '/cars';

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ds-muted">
          <Link to="/cars" className="font-semibold text-ds-muted hover:text-ds-ink">
            Cars
          </Link>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="text-ds-ink">{title}</span>
        </nav>
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">{title}</h1>
        {!isEdit && (
          <span className="text-sm text-ds-muted">
            Start from iRacing’s list so names match results imports, then add the team’s own details.
          </span>
        )}
      </header>

      {justSynced && (
        <p className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-w2w-red-ink shadow-[inset_3px_0_0_var(--color-w2w-red)]">
          Synced {justSynced} cars from iRacing.
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        {!isEdit && (
          <section
            aria-labelledby="cat-title"
            className="cut flex min-w-0 flex-[2_1_320px] flex-col gap-3.5 bg-ds-panel pb-2.5 pt-[22px]"
          >
            <div className="flex flex-col gap-3.5 px-5">
              <div className="flex items-center justify-between gap-3">
                <h2 id="cat-title" className="h2">
                  <span className="num text-ds-dim">1</span> Pick from iRacing
                </h2>
                <button type="button" onClick={handleSync} disabled={syncing} className="btn-secondary btn-sm">
                  {syncing ? 'Syncing...' : 'Sync'}
                </button>
              </div>
              {catalog !== null && catalog.length > 0 && (
                <div className="cut-sm flex h-[42px] items-center gap-2 bg-ds-field px-3 text-ds-dim">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">
                    <path d="M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM16 16l4.5 4.5" />
                  </svg>
                  <input
                    type="text"
                    aria-label="Search iRacing cars"
                    placeholder="Search iRacing cars"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="min-w-0 flex-1 border-0 bg-transparent text-ds-ink outline-none placeholder:text-ds-dim"
                  />
                </div>
              )}
            </div>

            {catalog === null ? (
              <p className="m-0 px-5 pb-3 text-sm text-ds-muted">Loading...</p>
            ) : catalog.length === 0 ? (
              <p className="m-0 px-5 pb-3 text-sm text-ds-muted">
                No cars synced yet. Click "Sync" to pull the car list from iRacing (requires signing in with an iRacing
                account).
              </p>
            ) : (
              <div className="flex max-h-[520px] flex-col overflow-y-auto">
                {filteredCatalog.map((car) => {
                  const inLibrary = libraryNames.has(car.carName.toLowerCase());
                  const selected = !inLibrary && form.name === car.carName;
                  return (
                    <button
                      key={car.carId}
                      type="button"
                      onClick={() => pickCar(car)}
                      aria-pressed={selected}
                      disabled={inLibrary}
                      className={`row-hover flex w-full items-center gap-3 border-0 border-t border-solid border-ds-line px-5 py-3 text-left text-ds-ink ${
                        inLibrary ? 'cursor-default opacity-55' : 'cursor-pointer'
                      } ${selected ? 'bg-ds-raised shadow-[inset_3px_0_0_var(--color-w2w-red)]' : 'bg-transparent'}`}
                    >
                      {car.smallImageUrl ? (
                        <img
                          src={car.smallImageUrl}
                          alt=""
                          width={48}
                          height={32}
                          loading="lazy"
                          decoding="async"
                          className="h-8 w-12 flex-none bg-ds-field object-cover"
                        />
                      ) : (
                        <div className="h-8 w-12 flex-none bg-ds-field" />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{car.carName}</span>
                        {car.categories && <span className="truncate text-xs text-ds-muted">{car.categories}</span>}
                      </span>
                      {selected && <span className="chip chip-solid chip-sm">Selected</span>}
                      {inLibrary && <span className="chip chip-sm">In library</span>}
                    </button>
                  );
                })}
                {filteredCatalog.length === 0 && <p className="m-0 px-5 py-4 text-ds-muted">No matches.</p>}
              </div>
            )}
          </section>
        )}

        <section
          aria-labelledby="det-title"
          className="cut min-w-0 flex-[3_1_420px] bg-ds-panel px-6 pb-6 pt-[22px]"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
            <h2 id="det-title" className="h2">
              {!isEdit && <span className="num text-ds-dim">2</span>} Team details
            </h2>

            <ImageDropZone
              imageUrl={form.imageUrl || undefined}
              hint="A side or 3/4 shot works best · JPG or PNG"
              upload={carsApi.uploadImage}
              // On edit an empty string tells the backend to clear the image (undefined would leave it).
              onChange={(url) => setForm({ ...form, imageUrl: url ?? (isEdit ? '' : undefined) })}
            />

            <label className="flex flex-col gap-1.5">
              <span className="lbl">Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
              />
            </label>

            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Car class</span>
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
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Tank capacity (L)</span>
                <input
                  required
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.tankCapacityLiters}
                  onChange={(e) => setForm({ ...form, tankCapacityLiters: Number(e.target.value) })}
                  className="input"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="lbl">
                Team notes <span className="font-normal text-ds-dim">optional</span>
              </span>
              <textarea
                rows={3}
                placeholder="Anything the team should know: tyre wear, quirks, BoP notes"
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input resize-y"
              />
            </label>

            {error && (
              <p role="alert" className="m-0 text-sm text-ds-danger">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-ds-line pt-4">
              <Link to={backHref} className="btn-secondary">
                Cancel
              </Link>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add car'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
