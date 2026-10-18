/** Presentational building blocks for the "Race preferences" panel shared by EditMyProfilePage,
 * AdminEditMemberSettingsPage and DriverFormPage (the DriverForm / EditProfile design boards):
 * a switch row for each boolean flag and a −/+ stepper for "Max stints in a row". Both are fully
 * controlled — the pages keep owning the state and the save payload. */

/** Upper bound of the stints stepper (the backend rejects larger *changes*; an older stored value
 * above it still displays and saves, and the first − click snaps it down into range). */
const MAX_STINTS_CAP = 6;

export function SwitchRow({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description?: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between border-t border-ds-line ${
        description ? 'gap-4 py-3.5' : 'gap-3 py-3'
      }`}
    >
      <span className="flex flex-col">
        <span className="font-bold">{label}</span>
        {description && <span className="text-[13px] text-ds-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-[26px] w-12 shrink-0 cursor-pointer border-0 p-0 ${on ? 'bg-w2w-red' : 'bg-ds-control'}`}
      >
        <span
          className={`absolute top-1 h-[18px] w-5 [clip-path:polygon(5px_0,100%_0,calc(100%-5px)_100%,0_100%)] ${
            on ? 'left-6 bg-on-accent' : 'left-1 bg-ds-muted'
          }`}
        />
      </button>
    </div>
  );
}

/** Max successive stints. `null` means "not set" (rendered as an en dash): − from 1 clears it and
 * + from "not set" starts at 1, capped at MAX_STINTS_CAP. */
export function StintsRow({
  value,
  onChange,
  description,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  description?: string;
}) {
  const size = description ? 'h-[38px] w-[38px]' : 'h-9 w-9';
  const buttonClass = `cut-xs ${size} cursor-pointer border-0 bg-ds-control text-lg font-bold text-ds-ink hover:bg-ds-control-hover disabled:cursor-default disabled:opacity-50`;
  return (
    <div
      className={`flex items-center justify-between border-t border-ds-line pb-0 ${
        description ? 'gap-4 pt-3.5' : 'gap-3 pt-3'
      }`}
    >
      <span className="flex flex-col">
        <span className="font-bold">Max stints in a row</span>
        {description && <span className="text-[13px] text-ds-muted">{description}</span>}
      </span>
      <div
        role="group"
        aria-label="Max stints in a row"
        className="cut-xs flex shrink-0 items-center gap-1 bg-ds-field p-[3px]"
      >
        <button
          type="button"
          aria-label="Fewer"
          disabled={value === null}
          onClick={() => onChange(value === null || value <= 1 ? null : Math.min(value - 1, MAX_STINTS_CAP))}
          className={buttonClass}
        >
          −
        </button>
        <span aria-live="polite" className={`num text-center text-[22px] ${description ? 'min-w-9' : 'min-w-8'}`}>
          {value ?? '—'}
        </span>
        <button
          type="button"
          aria-label="More"
          disabled={value !== null && value >= MAX_STINTS_CAP}
          onClick={() => onChange((value ?? 0) + 1)}
          className={buttonClass}
        >
          +
        </button>
      </div>
    </div>
  );
}
