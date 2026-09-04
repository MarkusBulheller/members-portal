import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { carsApi } from '../../lib/api/cars';
import { CAR_CLASSES } from '../../types/carClass';
import type { Car } from '../../types/car';

export default function CarsListPage() {
  const { user } = useAuth();
  const [cars, setCars] = useState<Car[] | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');

  useEffect(() => {
    void carsApi.list().then(setCars);
  }, []);

  const filtered = (cars ?? []).filter((car) => {
    const matchesSearch = car.name.toLowerCase().includes(search.toLowerCase());
    const matchesClass = classFilter === '' || car.carClass === classFilter;
    return matchesSearch && matchesClass;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Fleet</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">Cars</h1>
        </div>
        {user?.role === 'ADMIN' && (
          <Link
            to="/cars/new"
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
          >
            New Car
          </Link>
        )}
      </div>

      {cars === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : cars.length === 0 ? (
        <p className="text-white/65 text-sm">No cars in the fleet yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <input
              type="text"
              aria-label="Search cars"
              placeholder="Search cars..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input max-w-sm"
            />
            <select
              aria-label="Filter by class"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="">All Classes</option>
              {CAR_CLASSES.map((carClass) => (
                <option key={carClass} value={carClass}>
                  {carClass}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-white/65 text-sm">No cars match that search/filter.</p>
          ) : (
            (() => {
              // Canonical order first, then any class that isn't one of the known ones (shouldn't
              // normally happen — carClass is validated against CAR_CLASSES on create — but a
              // group for it beats silently dropping the car from the page).
              const knownClasses = CAR_CLASSES.filter((c) => filtered.some((car) => car.carClass === c));
              const otherClasses = Array.from(new Set(filtered.map((c) => c.carClass))).filter(
                (c) => !(CAR_CLASSES as readonly string[]).includes(c),
              );
              const groups = [...knownClasses, ...otherClasses];
              return (
                <div className="space-y-10">
                  {groups.map((carClass) => (
                    <div key={carClass}>
                      <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4 pb-2 border-b border-white/10">
                        {carClass}
                      </h2>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered
                          .filter((car) => car.carClass === carClass)
                          .map((car) => (
                            <Link
                              key={car.id}
                              to={`/cars/${car.id}`}
                              className="bg-w2w-charcoal border border-white/10 hover:border-w2w-red/50 overflow-hidden transition-colors"
                            >
                              {car.imageUrl && <img src={car.imageUrl} alt="" className="w-full h-32 object-cover" />}
                              <div className="p-4">
                                <p className="font-heading font-semibold text-white text-sm">{car.name}</p>
                                <p className="text-white/65 text-xs mt-2">{car.tankCapacityLiters} L tank</p>
                              </div>
                            </Link>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </>
      )}
    </div>
  );
}
