import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../lib/useMediaQuery';
import {
  DEFAULT_TIME,
  MONTHS_LONG,
  WEEKDAYS_LONG_MON,
  WEEKDAYS_SHORT_MON,
  addDays,
  addMonths,
  buildMonthCells,
  clampValue,
  clampYmd,
  compareYmd,
  hmKey,
  joinValue,
  parseYmdKey,
  splitValue,
  todayYmd,
  weekdayMon,
  ymdKey,
  type Hm,
  type PickerMode,
  type Ymd,
} from './datetimeUtils';

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"])';
const SHEET_QUERY = '(max-width: 639px)';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface DatePickerProps {
  mode: PickerMode;
  /** Canonical value ('' when empty). Every change is emitted live through onChange. */
  value: string;
  onChange: (value: string) => void;
  /** `restoreFocus` is true for Escape / Done / Clear / picking a date, false for an outside click. */
  onClose: (restoreFocus: boolean) => void;
  /** The field wrapper: the popover is placed against it, and clicks on it don't count as "outside". */
  anchorRef: RefObject<HTMLElement | null>;
  id: string;
  ariaLabel: string;
  /** Normalised bounds in the field's own format ('' = none). */
  min: string;
  max: string;
  minuteStep: number;
  canClear: boolean;
}

/** The calendar + time-of-day popover behind DateField / TimeField / DateTimeField. Rendered through a
 * portal because `.input` is clipped with clip-path, which would cut off anything overflowing the field.
 * Desktop: a floating panel anchored under (or, with no room, above) the field. < 640px: a bottom sheet.
 *
 * Focus handling is local rather than useDialogA11y: that hook closes on a *document-level* Escape
 * listener, which would also let the same keypress reach an enclosing <Modal>'s own document listener.
 * Here keydown is handled on the panel and stopped, so Escape only ever closes the picker. */
export default function DatePicker({
  mode,
  value,
  onChange,
  onClose,
  anchorRef,
  id,
  ariaLabel,
  min,
  max,
  minuteStep,
  canClear,
}: DatePickerProps) {
  const isSheet = useMediaQuery(SHEET_QUERY);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasDate = mode !== 'time';
  const hasTime = mode !== 'date';

  const today = useMemo(() => todayYmd(), []);
  const { date: selDate, time: selTime } = useMemo(() => splitValue(mode, value), [mode, value]);
  const minDay = useMemo(() => (hasDate ? parseYmdKey(min.slice(0, 10)) : null), [hasDate, min]);
  const maxDay = useMemo(() => (hasDate ? parseYmdKey(max.slice(0, 10)) : null), [hasDate, max]);

  // The day that owns the roving tabindex; its month is the month on show.
  const [focusDay, setFocusDay] = useState<Ymd>(() => clampYmd(selDate ?? today, minDay, maxDay));
  const focusKey = ymdKey(focusDay);
  const cells = useMemo(() => buildMonthCells(focusDay.y, focusDay.m), [focusDay.y, focusDay.m]);
  const monthTitle = `${MONTHS_LONG[focusDay.m - 1]} ${focusDay.y}`;
  const selectedKey = selDate ? ymdKey(selDate) : null;
  const todayKey = ymdKey(today);
  const minKey = minDay ? ymdKey(minDay) : '';
  const maxKey = maxDay ? ymdKey(maxDay) : '';

  const keyboardMove = useRef(false);
  function moveFocus(next: Ymd) {
    const target = clampYmd(next, minDay, maxDay);
    if (ymdKey(target) !== focusKey) keyboardMove.current = true;
    setFocusDay(target);
  }
  // After a keyboard move the new day's button exists only once the grid has re-rendered.
  useEffect(() => {
    if (!keyboardMove.current) return;
    keyboardMove.current = false;
    panelRef.current?.querySelector<HTMLElement>(`[data-day="${focusKey}"]`)?.focus({ preventScroll: true });
  }, [focusKey]);

  const prevMonthLast = addDays({ ...focusDay, d: 1 }, -1);
  const nextMonthFirst = addMonths({ ...focusDay, d: 1 }, 1);
  const canPrev = !minDay || compareYmd(prevMonthLast, minDay) >= 0;
  const canNext = !maxDay || compareYmd(nextMonthFirst, maxDay) <= 0;
  const canToday = (!minDay || compareYmd(today, minDay) >= 0) && (!maxDay || compareYmd(today, maxDay) <= 0);

  /* ---- selection ---- */
  function commit(date: Ymd | null, time: Hm | null) {
    onChange(clampValue(joinValue(mode, date, time), min, max));
  }
  function pickDay({ y, m, d }: Ymd) {
    const day = { y, m, d };
    setFocusDay(day);
    if (mode === 'date') {
      commit(day, null);
      onClose(true); // a date on its own is a finished choice
    } else {
      commit(day, selTime ?? DEFAULT_TIME);
    }
  }
  function pickTime(time: Hm) {
    commit(mode === 'time' ? null : (selDate ?? focusDay), time);
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    let next: Ymd | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = addDays(focusDay, -1);
        break;
      case 'ArrowRight':
        next = addDays(focusDay, 1);
        break;
      case 'ArrowUp':
        next = addDays(focusDay, -7);
        break;
      case 'ArrowDown':
        next = addDays(focusDay, 7);
        break;
      case 'PageUp':
        next = addMonths(focusDay, e.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(focusDay, e.shiftKey ? 12 : 1);
        break;
      case 'Home':
        next = addDays(focusDay, -weekdayMon(focusDay));
        break;
      case 'End':
        next = addDays(focusDay, 6 - weekdayMon(focusDay));
        break;
    }
    if (!next) return;
    e.preventDefault();
    moveFocus(next);
  }

  /* ---- panel-level keys: Escape closes only the picker, Tab stays inside ---- */
  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose(true);
    } else if (e.key === 'Tab') {
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (focusable.length === 0) {
        e.preventDefault();
      } else {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !panelRef.current?.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    // Keep the keypress away from ancestors in the React tree (a panel's own Escape handler) and, via
    // React's root listener, from document-level listeners (a <Modal>'s Escape-to-close).
    e.stopPropagation();
  }

  /* ---- focus in on open, outside click out ---- */
  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>('[role="grid"] [tabindex="0"], [role="listbox"] [tabindex="0"]')
      ?.focus({ preventScroll: true });
  }, []);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      // The sheet's backdrop lives inside the root and closes on click, so the tap can't fall through.
      if (rootRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [anchorRef]);

  /* ---- placement + entrance ---- */
  useLayoutEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!root || !panel) return;

    if (isSheet) {
      if (!reducedMotion()) {
        panel.animate([{ transform: 'translateY(32px)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], {
          duration: 180,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        });
      }
      return;
    }
    if (!anchor) return;

    const GAP = 6;
    const MARGIN = 8;
    function place() {
      if (!root || !panel || !anchor) return;
      const a = anchor.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      panel.style.maxHeight = '';
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const below = vh - a.bottom - GAP - MARGIN;
      const above = a.top - GAP - MARGIN;
      const placeBelow = height <= below || below >= above;
      const room = Math.max(160, placeBelow ? below : above);
      panel.style.maxHeight = `${room}px`;
      const used = Math.min(height, room);
      root.style.top = `${placeBelow ? a.bottom + GAP : a.top - GAP - used}px`;
      root.style.left = `${Math.max(MARGIN, Math.min(a.left, vw - width - MARGIN))}px`;
    }
    function onScroll(e: Event) {
      // The picker's own hour/minute lists scroll too; that must not re-place the panel.
      if (e.target instanceof Node && root?.contains(e.target)) return;
      place();
    }
    place();
    if (!reducedMotion()) {
      root.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], {
        duration: 120,
        easing: 'ease-out',
      });
    }
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isSheet, anchorRef]);

  const calendar = hasDate && (
    <div className={isSheet ? 'w-full' : 'w-[280px] shrink-0'}>
      <div className="mb-2 flex items-center gap-1.5">
        <NavButton
          label="Previous month"
          disabled={!canPrev}
          onClick={() => moveFocus(addMonths(focusDay, -1))}
          path="M15 6l-6 6 6 6"
        />
        <NavButton
          label="Next month"
          disabled={!canNext}
          onClick={() => moveFocus(addMonths(focusDay, 1))}
          path="M9 6l6 6-6 6"
        />
        <div aria-live="polite" className="ml-1 min-w-0 flex-1 truncate text-sm font-extrabold">
          {monthTitle}
        </div>
        <button
          type="button"
          disabled={!canToday}
          onClick={() => pickDay(clampYmd(today, minDay, maxDay))}
          className="cut-xs h-[30px] shrink-0 border-0 bg-ds-control px-3 text-xs font-bold uppercase text-ds-ink hover:bg-ds-control-hover disabled:pointer-events-none disabled:opacity-40"
        >
          Today
        </button>
      </div>
      <div role="grid" aria-label={monthTitle} onKeyDown={onGridKeyDown}>
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS_SHORT_MON.map((label, i) => (
            <div
              key={label}
              role="columnheader"
              aria-label={WEEKDAYS_LONG_MON[i]}
              className="py-1 text-center text-[11px] font-bold uppercase text-ds-dim"
            >
              {label}
            </div>
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} role="row" className="grid grid-cols-7">
            {cells.slice(row * 7, row * 7 + 7).map((cell) => {
              const selected = cell.key === selectedKey;
              const disabled = (minKey !== '' && cell.key < minKey) || (maxKey !== '' && cell.key > maxKey);
              return (
                <div key={cell.key} role="gridcell" aria-selected={selected} className="p-px">
                  <button
                    type="button"
                    data-day={cell.key}
                    aria-label={cell.label}
                    aria-current={cell.key === todayKey ? 'date' : undefined}
                    disabled={disabled}
                    tabIndex={cell.key === focusKey ? 0 : -1}
                    onClick={() => pickDay(cell)}
                    className={`num cut-xs flex h-9 w-full items-center justify-center border-0 text-sm disabled:pointer-events-none disabled:opacity-30 ${
                      selected
                        ? 'bg-w2w-red text-on-accent'
                        : `bg-transparent hover:bg-ds-control ${cell.inMonth ? 'text-ds-ink-soft' : 'text-ds-dim'} ${
                            cell.key === todayKey ? 'shadow-[inset_0_0_0_2px_var(--color-w2w-red-ink)]' : ''
                          }`
                    }`}
                  >
                    {cell.d}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const timeSection = hasTime && (
    <TimeColumns
      isSheet={isSheet}
      tall={hasDate}
      time={selTime}
      minuteStep={minuteStep}
      isAllowed={(h, mi) => {
        const full = (hh: number, mm: number) =>
          mode === 'time' ? hmKey({ h: hh, mi: mm }) : `${ymdKey(selDate ?? focusDay)}T${hmKey({ h: hh, mi: mm })}`;
        if (mi === null) {
          // An hour is selectable while any of its minutes is in range.
          return (!min || full(h, 59) >= min) && (!max || full(h, 0) <= max);
        }
        const v = full(h, mi);
        return (!min || v >= min) && (!max || v <= max);
      }}
      onPick={pickTime}
    />
  );

  const body = (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onKeyDown={onPanelKeyDown}
      className={`bg-ds-raised p-3.5 text-ds-ink ${
        isSheet
          ? 'max-h-[80vh] w-full overflow-y-auto pb-[max(14px,env(safe-area-inset-bottom))] [clip-path:polygon(14px_0,100%_0,100%_100%,0_100%,0_14px)]'
          : 'cut w-max overflow-y-auto'
      }`}
    >
      <div className={`flex ${isSheet ? 'flex-col gap-3' : 'gap-4'}`}>
        {calendar}
        {timeSection}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-ds-line pt-3">
        {canClear ? (
          <button
            type="button"
            onClick={() => {
              onChange('');
              onClose(true);
            }}
            className="cursor-pointer border-0 bg-transparent p-1 text-[13px] font-semibold text-w2w-red-ink hover:underline"
          >
            Clear
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => onClose(true)} className="btn-primary btn-sm">
          Done
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div
      ref={rootRef}
      // Clicks inside the portal would otherwise bubble (React-tree wise) to clickable ancestors of the field.
      onClick={(e) => e.stopPropagation()}
      className={isSheet ? 'fixed inset-0 z-[100] flex items-end print:hidden' : 'fixed left-0 top-0 z-[100] w-max print:hidden'}
      // clip-path clips box-shadow, so the lift comes from a filter on the unclipped wrapper.
      style={isSheet ? undefined : { filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.35))' }}
    >
      {isSheet && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black/60"
          onClick={() => onClose(false)}
        />
      )}
      {isSheet ? <div className="relative w-full">{body}</div> : body}
    </div>,
    document.body,
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  path,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  path: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="cut-xs flex h-[30px] w-[30px] shrink-0 items-center justify-center border-0 bg-ds-control text-ds-ink hover:bg-ds-control-hover disabled:pointer-events-none disabled:opacity-40"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Hour / minute columns                                                                          */
/* ---------------------------------------------------------------------------------------------- */

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function TimeColumns({
  isSheet,
  tall,
  time,
  minuteStep,
  isAllowed,
  onPick,
}: {
  isSheet: boolean;
  /** True when sitting next to the calendar (matches its height); false for a time-only picker. */
  tall: boolean;
  time: Hm | null;
  minuteStep: number;
  /** `mi === null` asks about a whole hour. */
  isAllowed: (h: number, mi: number | null) => boolean;
  onPick: (time: Hm) => void;
}) {
  const minutes = useMemo(() => {
    const list: number[] = [];
    for (let mi = 0; mi < 60; mi += minuteStep) list.push(mi);
    // A typed minute that isn't on the step (13:07) still has to show as selected.
    if (time && !list.includes(time.mi)) list.push(time.mi);
    return list.sort((a, b) => a - b);
  }, [minuteStep, time]);

  return (
    <div className={`flex gap-1.5 ${isSheet ? 'w-full' : 'shrink-0'}`}>
      <TimeList
        label="Hour"
        isSheet={isSheet}
        tall={tall}
        values={HOURS}
        selected={time?.h ?? null}
        isAllowed={(h) => isAllowed(h, null)}
        onPick={(h) => onPick({ h, mi: time?.mi ?? 0 })}
      />
      <TimeList
        label="Minute"
        isSheet={isSheet}
        tall={tall}
        values={minutes}
        selected={time?.mi ?? null}
        isAllowed={(mi) => isAllowed(time?.h ?? DEFAULT_TIME.h, mi)}
        onPick={(mi) => onPick({ h: time?.h ?? DEFAULT_TIME.h, mi })}
      />
    </div>
  );
}

function TimeList({
  label,
  isSheet,
  tall,
  values,
  selected,
  isAllowed,
  onPick,
}: {
  label: string;
  isSheet: boolean;
  tall: boolean;
  values: number[];
  selected: number | null;
  isAllowed: (value: number) => boolean;
  onPick: (value: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Roving tabindex: Tab visits the list once (on the selected option, else the first allowed one).
  const tabbable = selected !== null && values.includes(selected) ? selected : (values.find(isAllowed) ?? values[0]);

  const optionFor = (value: number) => listRef.current?.querySelector<HTMLElement>(`[data-value="${value}"]`) ?? null;
  function reveal(button: HTMLElement | null, centre: boolean) {
    const list = listRef.current;
    if (!list || !button) return;
    const top = button.offsetTop;
    const bottom = top + button.offsetHeight;
    if (centre) list.scrollTop = top - (list.clientHeight - button.offsetHeight) / 2;
    else if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  // Open with the selected option in the middle of the list.
  useLayoutEffect(() => {
    reveal(optionFor(tabbable), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = values.indexOf(Number((document.activeElement as HTMLElement | null)?.dataset.value));
    if (current < 0) return;
    let target = current;
    const step = (dir: 1 | -1, by: number) => {
      let i = current;
      let moved = 0;
      while (moved < by && i + dir >= 0 && i + dir < values.length) {
        i += dir;
        if (isAllowed(values[i])) {
          target = i;
          moved++;
        }
      }
    };
    switch (e.key) {
      case 'ArrowDown':
        step(1, 1);
        break;
      case 'ArrowUp':
        step(-1, 1);
        break;
      case 'PageDown':
        step(1, 6);
        break;
      case 'PageUp':
        step(-1, 6);
        break;
      case 'Home':
        target = values.findIndex(isAllowed);
        break;
      case 'End':
        target = values.findLastIndex(isAllowed);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (target < 0 || target === current) return;
    // Selection follows focus, like a native listbox.
    const next = optionFor(values[target]);
    next?.focus({ preventScroll: true });
    reveal(next, false);
    onPick(values[target]);
  }

  return (
    <div className={`flex min-w-0 flex-col ${isSheet ? 'flex-1' : 'w-[62px]'}`}>
      <div className={`flex items-center text-[11px] font-bold uppercase text-ds-dim ${tall && !isSheet ? 'mb-2 h-[30px]' : 'mb-1 h-6'}`}>
        {label}
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={`relative flex flex-col gap-px overflow-y-auto overscroll-contain bg-ds-field p-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          isSheet ? 'h-[148px]' : tall ? 'h-[242px]' : 'h-[232px]'
        }`}
      >
        {values.map((value) => {
          const isSelected = value === selected;
          const allowed = isAllowed(value);
          return (
            <button
              key={value}
              type="button"
              role="option"
              data-value={value}
              aria-selected={isSelected}
              disabled={!allowed}
              tabIndex={value === tabbable ? 0 : -1}
              onClick={() => onPick(value)}
              className={`num cut-xs flex h-8 w-full shrink-0 items-center justify-center border-0 text-sm disabled:pointer-events-none disabled:opacity-30 ${
                isSelected ? 'bg-w2w-red text-on-accent' : 'bg-transparent text-ds-ink-soft hover:bg-ds-control'
              }`}
            >
              {String(value).padStart(2, '0')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
