import { useEffect, useId, useRef, useState } from 'react';
import type { Track } from '../types/track';

const MAX_RESULTS = 20;

/** Type-to-filter track picker — the roster select list was getting long enough that scrolling
 * a plain <select> was painful. The displayed text is decoupled from the actual selected id: on
 * submit, callers must check the id (not the text) since a user can type without ever picking a
 * match, which this component surfaces by clearing the id (see onChange) rather than pretending
 * whatever's typed is a valid selection. */
export default function TrackAutocomplete({
  tracks,
  value,
  onChange,
}: {
  tracks: Track[] | null;
  value: string;
  onChange: (trackId: string) => void;
}) {
  const selected = tracks?.find((t) => t.id === value) ?? null;
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Keep the displayed text in sync if the selected track becomes resolvable after the fact
  // (e.g. editing an existing event: `value` arrives before `tracks` finishes loading).
  useEffect(() => {
    setQuery(selected?.name ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.name ?? '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const matches =
    tracks?.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())).slice(0, MAX_RESULTS) ?? [];

  function pick(track: Track) {
    onChange(track.id);
    setQuery(track.name);
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
          if (value) onChange('');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery(selected?.name ?? '');
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
        placeholder="Search tracks..."
        autoComplete="off"
        className="input"
      />
      {open && (
        <div id={listboxId} role="listbox" className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-w2w-black border border-white/15">
          {tracks === null ? (
            <p className="px-4 py-2 text-sm text-white/65">Loading tracks...</p>
          ) : matches.length === 0 ? (
            <p className="px-4 py-2 text-sm text-white/65">No tracks found.</p>
          ) : (
            matches.map((track, i) => (
              <button
                key={track.id}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                type="button"
                onClick={() => pick(track)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  i === activeIndex ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'
                }`}
              >
                {track.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
