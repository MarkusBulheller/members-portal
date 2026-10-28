/** Slanted on/off switch (same look as the SwitchRow in RacePreferenceFields) for places where the
 * visible label sits elsewhere. `label` is the accessible name. Fully controlled. */
export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-12 shrink-0 cursor-pointer border-0 p-0 disabled:cursor-default disabled:opacity-50 ${
        checked ? 'bg-w2w-red' : 'bg-ds-control'
      }`}
    >
      <span
        className={`absolute top-1 h-[18px] w-5 [clip-path:polygon(5px_0,100%_0,calc(100%-5px)_100%,0_100%)] ${
          checked ? 'left-6 bg-on-accent' : 'left-1 bg-ds-muted'
        }`}
      />
    </button>
  );
}
