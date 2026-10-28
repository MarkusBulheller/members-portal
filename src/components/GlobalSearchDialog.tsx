import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import NavIcon from './NavIcon';
import { groupResults, loadSearchIndex, peekSearchIndex, type SearchEntry } from '../lib/globalSearch';
import { useDialogA11y } from '../lib/useDialogA11y';

/** Command-palette style search over events, drivers, series, cars and tracks. Opened by Ctrl/Cmd+K,
 * the dashboard search field, or the mobile header button (see GlobalSearchContext). It is a
 * combobox: focus stays in the input while Up/Down move the highlighted result and Enter opens it. */
export default function GlobalSearchDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const titleId = useId();

  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useDialogA11y(dialogRef, onClose, inputRef);

  // Fetch lazily on first open; later opens reuse the in-memory cache (refreshed after 5 minutes).
  // A cached (possibly stale) index is shown immediately while the refresh runs.
  useEffect(() => {
    let cancelled = false;
    const cached = peekSearchIndex();
    if (cached) {
      void cached.then((list) => !cancelled && setEntries(list)).catch(() => undefined);
    }
    loadSearchIndex()
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => (entries ? groupResults(entries, query) : []), [entries, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const hasQuery = query.trim().length > 0;

  // New results -> back to the top of the list.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, entries]);

  const optionId = useCallback((index: number) => `${listboxId}-opt-${index}`, [listboxId]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (flat.length === 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, flat.length, optionId]);

  const choose = useCallback(
    (entry: SearchEntry) => {
      onClose();
      navigate(entry.to);
    },
    [navigate, onClose],
  );

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length > 0) setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length > 0) setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = flat[activeIndex];
      if (entry) choose(entry);
    }
  }

  let status: string;
  if (failed && !entries) status = 'Search is unavailable right now.';
  else if (!entries) status = 'Loading...';
  else if (!hasQuery) status = '';
  else if (flat.length === 0) status = `No results for "${query.trim()}".`;
  else status = `${flat.length} result${flat.length === 1 ? '' : 's'}`;

  // Flat index of each group's first option, so aria-activedescendant ids line up across groups.
  const groupStarts = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.items.length, 0));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-3 sm:px-4 sm:pt-[10vh] print:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="cut flex max-h-[min(560px,calc(100dvh-24px))] w-full max-w-[620px] flex-col bg-ds-panel text-ds-ink"
      >
        <h2 id={titleId} className="sr-only">
          Search the portal
        </h2>

        <div className="flex flex-none items-center gap-3 border-b border-ds-line px-4">
          <NavIcon name="search" className="h-[18px] w-[18px] text-ds-muted" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={flat.length > 0 ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-label="Search events, drivers, series, cars and tracks"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Search events, drivers, series, cars, tracks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-base text-ds-ink outline-none placeholder:text-ds-dim"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="slant flex-none bg-ds-control px-2.5 py-0.5 text-[11px] font-semibold text-ds-muted hover:text-ds-ink"
          >
            Esc
          </button>
        </div>

        <div
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="min-h-0 flex-1 overflow-y-auto pb-2"
        >
          {groups.map((group, groupIndex) => (
            <div key={group.kind} role="group" aria-labelledby={`${listboxId}-g-${group.kind}`}>
              <p id={`${listboxId}-g-${group.kind}`} className="m-0 px-4 pb-1 pt-3 text-xs font-semibold text-ds-dim">
                {group.label}
              </p>
              {group.items.map((item, itemIndex) => {
                const index = groupStarts[groupIndex] + itemIndex;
                const active = index === activeIndex;
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={active}
                    onMouseMove={() => {
                      if (!active) setActiveIndex(index);
                    }}
                    onClick={() => choose(item)}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 ${
                      active ? 'bg-ds-active shadow-[inset_3px_0_0_var(--color-w2w-red)]' : ''
                    }`}
                  >
                    <NavIcon
                      name={group.icon}
                      className={`h-[18px] w-[18px] ${active ? 'text-w2w-red-ink' : 'text-ds-muted'}`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{item.title}</span>
                      {item.subtitle && <span className="truncate text-xs text-ds-muted">{item.subtitle}</span>}
                    </span>
                    {active && (
                      <span className="slant hidden flex-none bg-ds-control px-2 py-px text-[10px] font-bold text-ds-muted sm:block">
                        Enter
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {entries && !hasQuery && (
            <p className="m-0 px-4 py-8 text-center text-sm text-ds-muted">
              Type to search events, drivers, series, cars and tracks.
            </p>
          )}
          {((entries && hasQuery && flat.length === 0) || !entries) && (
            <p className="m-0 px-4 py-8 text-center text-sm text-ds-muted">{status}</p>
          )}
        </div>

        {/* Polite announcements for screen readers: result count / loading / empty. */}
        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>
      </div>
    </div>
  );
}
