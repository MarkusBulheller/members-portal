import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatTimezoneLabel, getAllTimezones } from '../lib/timezone';

const MAX_RESULTS = 20;

interface ZoneEntry {
  tz: string;
  /** Lower-cased "raw name
readable label" (newline can't be typed, so no cross-field matches),
   * matched with a single includes(). */
  haystack: string;
}

let zoneIndex: ZoneEntry[] | null = null;
let zoneIndexBuiltAt = 0;
const ZONE_INDEX_TTL_MS = 60 * 60_000;

/** Built once (lazily, the first time a picker opens) and refreshed hourly so the "(UTC+2)" part
 * follows DST changes in a long-lived tab. */
function getZoneIndex(): ZoneEntry[] {
  const now = Date.now();
  if (!zoneIndex || now - zoneIndexBuiltAt > ZONE_INDEX_TTL_MS) {
    zoneIndex = getAllTimezones().map((tz) => ({
      tz,
      haystack: `${tz}
${formatTimezoneLabel(tz) ?? ''}`.toLowerCase(),
    }));
    zoneIndexBuiltAt = now;
  }
  return zoneIndex;
}

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

  // Matches are only computed while the list is open, against a precomputed haystack, and for a
  // deferred copy of the query so typing stays responsive.
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(() => {
    if (!open) return [];
    const q = deferredQuery.toLowerCase();
    const out: string[] = [];
    for (const entry of getZoneIndex()) {
      if (entry.haystack.includes(q)) {
        out.push(entry.tz);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [open, deferredQuery]);

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
            if (!open) {
              // The list isn't computed while closed; open it and highlight the first match.
              setOpen(true);
              setActiveIndex(0);
            } else {
              setActiveIndex((i) => (matches.length === 0 ? -1 : Math.min(i + 1, matches.length - 1)));
            }
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
        <div id={listboxId} role="listbox" className="cut-sm absolute z-10 mt-1 max-h-64 w-full overflow-y-auto bg-ds-raised shadow-[inset_0_0_0_1px_var(--color-ds-control)]">
          <button
            type="button"
            onClick={clear}
            className="w-full border-b border-ds-line bg-transparent px-4 py-2 text-left text-sm text-ds-muted transition-colors hover:bg-ds-control hover:text-ds-ink"
          >
            Not set
          </button>
          {matches.length === 0 ? (
            <p className="m-0 px-4 py-2 text-sm text-ds-muted">No timezones found.</p>
          ) : (
            matches.map((tz, i) => (
              <button
                key={tz}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                type="button"
                onClick={() => pick(tz)}
                className={`w-full border-0 px-4 py-2 text-left text-sm transition-colors ${
                  i === activeIndex ? 'bg-ds-control text-ds-ink' : 'bg-transparent text-ds-ink-soft hover:bg-ds-control hover:text-ds-ink'
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
