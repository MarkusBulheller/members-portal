import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import DatePicker from './DatePicker';
import { formatDisplay, inRange, normalizeBound, normalizeValue, parseText, type PickerMode } from './datetimeUtils';

/** Props shared by DateTimeField, DateField and TimeField. The value contract is the native inputs':
 * "YYYY-MM-DDTHH:mm" / "YYYY-MM-DD" / "HH:mm" (local wall-clock, no zone); onChange gets '' when cleared. */
export interface PickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Layout classes for the field wrapper (width, flex, margin). */
  className?: string;
  /** Extra classes for the text input itself (e.g. font-bold). */
  inputClassName?: string;
  required?: boolean;
  disabled?: boolean;
  /** Same formats as the value. Out-of-range days / times are disabled in the picker and flagged when typed. */
  min?: string;
  max?: string;
  /** Granularity of the minute column. Any minute can still be typed. Default 5. */
  minuteStep?: number;
  placeholder?: string;
  name?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  /** Called first for every keydown on the text input; call preventDefault() to skip the field's own
   * handling (Enter / ArrowDown open the picker). */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Ref to the text input (React 19: an ordinary prop). */
  ref?: Ref<HTMLInputElement>;
}

const COPY: Record<PickerMode, { placeholder: string; invalid: string; dialog: string; open: string }> = {
  datetime: {
    placeholder: 'DD.MM.YYYY HH:mm',
    invalid: 'Enter a date and time like 24.10.2026 13:00.',
    dialog: 'Choose date and time',
    open: 'Choose date and time',
  },
  date: {
    placeholder: 'DD.MM.YYYY',
    invalid: 'Enter a date like 24.10.2026.',
    dialog: 'Choose date',
    open: 'Choose date',
  },
  time: {
    placeholder: 'HH:mm',
    invalid: 'Enter a 24-hour time like 13:00.',
    dialog: 'Choose time',
    open: 'Choose time',
  },
};

interface Draft {
  text: string;
  /** The value the parent holds once this draft's onChange (if any) landed. The draft is only shown
   * while that is still the value; an outside change to the value (a form reset) discards it. */
  emitted: string;
  blurred: boolean;
}

/** A text input styled as `.input` with a calendar / clock button and a portal popover. Typing is
 * parsed leniently and emitted as soon as it makes sense; blur normalises the text. A real <input>
 * keeps native behaviour: `required` blocks form submit, setCustomValidity flags unparseable or
 * out-of-range text, and a wrapping <label> focuses it. */
export default function PickerField({
  mode,
  value,
  onChange,
  id,
  className = '',
  inputClassName = '',
  required,
  disabled,
  min,
  max,
  minuteStep = 5,
  placeholder,
  name,
  autoFocus,
  onKeyDown,
  ref,
  ...aria
}: PickerFieldProps & { mode: PickerMode }) {
  const copy = COPY[mode];
  const popoverId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const current = useMemo(() => normalizeValue(mode, value), [mode, value]);
  const minB = useMemo(() => normalizeBound(mode, min), [mode, min]);
  const maxB = useMemo(() => normalizeBound(mode, max), [mode, max]);

  const draftActive = draft !== null && draft.emitted === current;
  const text = draftActive ? draft.text : formatDisplay(mode, current);
  const parseFailed = draftActive && draft.text.trim() !== '' && parseText(mode, draft.text, current) === null;
  const outOfRange = current !== '' && !inRange(current, minB, maxB);
  const invalid = (parseFailed && draft.blurred && !open) || outOfRange;

  let message = '';
  if (parseFailed) message = copy.invalid;
  else if (outOfRange) {
    message =
      minB && current < minB
        ? `Must be ${formatDisplay(mode, minB)} or later.`
        : `Must be ${formatDisplay(mode, maxB)} or earlier.`;
  }
  useEffect(() => {
    inputRef.current?.setCustomValidity(message);
  }, [message]);

  // A field that becomes disabled while its popover is open takes the popover with it.
  const popoverOpen = open && !disabled;

  function handleChange(nextText: string) {
    const next = nextText.trim() === '' ? '' : parseText(mode, nextText, current);
    if (next === null) {
      setDraft({ text: nextText, emitted: current, blurred: false });
      return;
    }
    setDraft({ text: nextText, emitted: next, blurred: false });
    if (next !== current) onChange(next);
  }

  function handleBlur() {
    if (!draft || !draftActive) return;
    if (parseFailed) setDraft({ ...draft, blurred: true });
    else setDraft(null); // show the normalised form
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented || disabled) return;
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) inputRef.current?.focus({ preventScroll: true });
  }

  const label = aria['aria-label'];
  return (
    <div ref={wrapperRef} className={`relative min-w-0 ${className}`}>
      <input
        ref={setInputRef}
        id={id}
        type="text"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder ?? copy.placeholder}
        aria-label={label}
        aria-labelledby={aria['aria-labelledby']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={invalid || undefined}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
        aria-controls={popoverOpen ? popoverId : undefined}
        className={`input tabular-nums !pr-11 aria-[invalid=true]:text-ds-danger aria-[invalid=true]:shadow-[inset_0_-2px_0_var(--color-ds-danger)] ${inputClassName}`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={copy.open}
        aria-expanded={popoverOpen}
        onClick={() => (popoverOpen ? close(true) : setOpen(true))}
        className="cut-xs absolute right-1 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center border-0 bg-transparent text-ds-muted hover:bg-ds-control hover:text-ds-ink disabled:pointer-events-none"
      >
        {mode === 'time' ? <ClockIcon /> : <CalendarIcon />}
      </button>
      {name && <input type="hidden" name={name} value={current} />}
      {popoverOpen && (
        <DatePicker
          mode={mode}
          value={current}
          onChange={onChange}
          onClose={close}
          anchorRef={wrapperRef}
          id={popoverId}
          ariaLabel={label ?? copy.dialog}
          min={minB}
          max={maxB}
          minuteStep={Math.min(60, Math.max(1, Math.floor(minuteStep)))}
          canClear={!required && current !== ''}
        />
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
      <path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
