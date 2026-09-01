import { useEffect, useId, useRef, useState } from 'react';
import type { IracingSeriesSeason } from '../types/iracingSeries';

const MAX_RESULTS = 20;

function seasonLabel(season: IracingSeriesSeason): string {
  return [season.seriesName, season.seasonName].filter(Boolean).join(' — ');
}

/** Type-to-filter series-season picker — same pattern as TrackAutocomplete, since the synced
 * series catalog is long enough that scrolling a plain <select> is painful. Nullable (unlike
 * TrackAutocomplete's required track): clearing the text or typing past every match clears the
 * selection back to "not linked" rather than leaving a stale id behind. */
export default function SeriesAutocomplete({
  seasons,
  value,
  onChange,
}: {
  seasons: IracingSeriesSeason[];
  value: number | null;
  onChange: (seasonId: number | null) => void;
}) {
  const selected = seasons.find((s) => s.seasonId === value) ?? null;
  const [query, setQuery] = useState(selected ? seasonLabel(selected) : '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Keep the displayed text in sync if the selected season becomes resolvable after the fact
  // (e.g. editing an existing event: `value` arrives before `seasons` finishes loading).
  useEffect(() => {
    setQuery(selected ? seasonLabel(selected) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.seasonId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected ? seasonLabel(selected) : '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const matches = seasons.filter((s) => seasonLabel(s).toLowerCase().includes(query.toLowerCase())).slice(0, MAX_RESULTS);

  function pick(season: IracingSeriesSeason) {
    onChange(season.seasonId);
    setQuery(seasonLabel(season));
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
          if (value !== null) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery(selected ? seasonLabel(selected) : '');
            setActiveIndex(-1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => (matches.length === 0 ? -1 : Math.min(i + 1, matches.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && matches.length > 0) {
            e.preventDefault();
            pick(matches[activeIndex >= 0 ? activeIndex : 0]);
          }
        }}
        placeholder="Search series... (not linked)"
        autoComplete="off"
        className="input"
      />
      {open && (
        <div id={listboxId} role="listbox" className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-w2w-black border border-white/15">
          {matches.length === 0 ? (
            <p className="px-4 py-2 text-sm text-white/65">No series found.</p>
          ) : (
            matches.map((season, i) => (
              <button
                key={season.seasonId}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                type="button"
                onClick={() => pick(season)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  i === activeIndex ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'
                }`}
              >
                {seasonLabel(season)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
