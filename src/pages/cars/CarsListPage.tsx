import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { resolveAssetUrl } from '../../lib/api';
import { carsApi } from '../../lib/api/cars';
import { CAR_CLASSES } from '../../types/carClass';
import type { Car } from '../../types/car';

const CAR_PATH = 'M3 14l2.2-5.5A2 2 0 0 1 7 7h10a2 2 0 0 1 1.8 1.5L21 14v3H3zM7 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM17 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z';

export default function CarsListPage() {
  const { user } = useAuth();
  const [cars, setCars] = useState<Car[] | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Always load retired cars too: the header counts them, and the toggle then just filters.
  useEffect(() => {
    let cancelled = false;
    carsApi
      .list(true)
      .then((loaded) => {
        if (!cancelled) setCars(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load cars.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (cars ?? []).filter((car) => {
    const matchesSearch = car.name.toLowerCase().includes(search.toLowerCase());
    const matchesClass = classFilter === '' || car.carClass === classFilter;
    return matchesSearch && matchesClass && (showRetired || car.active);
  });

  const activeCount = (cars ?? []).filter((car) => car.active).length;
  const retiredCount = (cars ?? []).length - activeCount;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Cars</h1>
          {cars !== null && (
            <span className="text-ds-muted">
              {activeCount} active car{activeCount === 1 ? '' : 's'}
              {retiredCount > 0 ? ` · ${retiredCount} retired` : ''}
            </span>
          )}
        </div>
        {user?.role === 'ADMIN' && (
          <Link to="/cars/new" className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New car
          </Link>
        )}
      </header>

      {cars === null && loadError ? (
        <p role="alert" className="text-sm text-ds-danger">
          {loadError}
        </p>
      ) : cars === null ? (
        <p className="text-ds-muted text-sm">Loading...</p>
      ) : cars.length === 0 ? (
        <p className="text-ds-muted text-sm">No cars in the fleet yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="cut-sm flex h-[42px] max-w-[340px] min-w-0 flex-[1_1_240px] items-center gap-2 bg-ds-panel px-3 text-ds-muted">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <input
                type="text"
                aria-label="Search cars"
                placeholder="Search cars"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent text-ds-ink outline-none placeholder:text-ds-dim"
              />
            </div>
            <div role="group" aria-label="Class" className="seg">
              <button type="button" aria-pressed={classFilter === ''} onClick={() => setClassFilter('')}>
                All classes
              </button>
              {CAR_CLASSES.map((carClass) => (
                <button
                  key={carClass}
                  type="button"
                  aria-pressed={classFilter === carClass}
                  onClick={() => setClassFilter(carClass)}
                >
                  {carClass}
                </button>
              ))}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showRetired}
              onClick={() => setShowRetired((v) => !v)}
              className="ml-auto flex min-h-10 cursor-pointer items-center gap-2.5 border-0 bg-transparent px-1 text-[13px] font-semibold text-ds-ink-soft"
            >
              <span className={`relative inline-block h-[22px] w-[42px] flex-none ${showRetired ? 'bg-w2w-red' : 'bg-ds-control-hover'}`}>
                <span
                  className="absolute top-1 h-3.5 w-4 bg-on-accent"
                  style={{
                    left: showRetired ? 22 : 4,
                    clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)',
                  }}
                />
              </span>
              Show retired cars
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="cut m-0 bg-ds-panel px-4 py-10 text-center text-ds-muted">No cars match that search or class.</p>
          ) : (
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
              {filtered.map((car) => (
                <Link
                  key={car.id}
                  to={`/cars/${car.id}`}
                  className={`cut row-hover flex flex-col overflow-hidden bg-ds-panel text-ds-ink ${car.active ? '' : 'opacity-60'}`}
                >
                  <div className="relative flex h-32 items-center justify-center bg-ds-sidebar text-[#34343a] [:root[data-theme=light]_&]:text-ds-dim/60">
                    {car.imageUrl ? (
                      <img
                        src={resolveAssetUrl(car.imageUrl)}
                        alt=""
                        width={270}
                        height={128}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                        <path d={CAR_PATH} />
                      </svg>
                    )}
                    <span className="chip chip-sm absolute left-3 top-3 bg-ds-control px-3 py-[3px] text-[11px] text-ds-ink">
                      {car.carClass}
                    </span>
                    {!car.active && (
                      <span className="chip chip-sm absolute right-3 top-3 px-3 py-[3px] text-[11px]">Retired</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5 px-[18px] pb-4 pt-3.5">
                    <span className="text-[15px] font-bold">{car.name}</span>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="flex flex-col">
                        <span className="num text-[22px] leading-[1.1]">{Number(car.tankCapacityLiters) || car.tankCapacityLiters}</span>
                        <span className="text-xs text-ds-dim">Tank (L)</span>
                      </span>
                      <span className="flex flex-col">
                        <span className="num text-[22px] leading-[1.1]">{car.trackSetupCount ?? car.trackSetups?.length ?? 0}</span>
                        <span className="text-xs text-ds-dim">Track setups</span>
                      </span>
                      <span className="flex flex-col">
                        <span className="num text-[22px] leading-[1.1]">{car.raceCount ?? 0}</span>
                        <span className="text-xs text-ds-dim">Races</span>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
