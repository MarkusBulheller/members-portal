import { useEffect, useId, useRef, useState } from 'react';
import { formatTimezoneLabel } from '../lib/timezone';

const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone').sort();
const MAX_RESULTS = 20;

/** Type-to-filter timezone picker — same pattern as TrackAutocomplete/SeriesAutocomplete, since
 * a plain <select> with 400+ IANA timezones is painful to scroll. Matches against both the raw
 * IANA name (e.g. "America/Los_Angeles") and its readable label (e.g. "Los Angeles (UTC-7)"), so
 * typing either the region or the city works. Nullable, like SeriesAutocomplete: clearing the
 * text or typing past every match clears the selection back to "not set". */
export default function TimezoneAutocomplete({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (timezone: string | null) => void;
}) {
  const [query, setQuery] = useState(value ? (formatTimezoneLabel(value) ?? value) : '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Keep the displayed text in sync if `value` changes from outside (e.g. loading a different
  // driver's profile into an already-mounted form).
  useEffect(() => {
    setQuery(value ? (formatTimezoneLabel(value) ?? value) : '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value ? (formatTimezoneLabel(value) ?? value) : '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const q = query.toLowerCase();
  const matches = ALL_TIMEZONES.filter(
    (tz) => tz.toLowerCase().includes(q) || (formatTimezoneLabel(tz) ?? '').toLowerCase().includes(q),
  ).slice(0, MAX_RESULTS);

  function pick(tz: string) {
    onChange(tz);
    setQuery(formatTimezoneLabel(tz) ?? tz);
    setOpen(false);
    setActiveIndex(-1);
  }

  function clear() {
    onChange(null);
    setQuery('');
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
            setQuery(value ? (formatTimezoneLabel(value) ?? value) : '');
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
          } else if (e.key === 'Backspace' && query === '' && value !== null) {
            onChange(null);
          }
        }}
        placeholder="Search timezones..."
        autoComplete="off"
        className="input"
      />
      {open && (
        <div id={listboxId} role="listbox" className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-w2w-black border border-white/15">
          <button
            type="button"
            onClick={clear}
            className="w-full text-left px-4 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white transition-colors border-b border-white/10"
          >
            Not set
          </button>
          {matches.length === 0 ? (
            <p className="px-4 py-2 text-sm text-white/65">No timezones found.</p>
          ) : (
            matches.map((tz, i) => (
              <button
                key={tz}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                type="button"
                onClick={() => pick(tz)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  i === activeIndex ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'
                }`}
              >
                {formatTimezoneLabel(tz) ?? tz}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
