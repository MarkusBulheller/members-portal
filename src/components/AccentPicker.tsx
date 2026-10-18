import { useAccent } from '../context/AccentContext';
import { ACCENT_OPTIONS } from '../lib/accent';

/** A row of slanted colour chips instead of a dropdown — every option is visible at once and the
 * choice is one click. The active one is larger with an ink underline. Behaves as a radio group
 * for keyboard and screen-reader users. */
export default function AccentPicker() {
  const { accent, setAccent } = useAccent();

  return (
    <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap items-center gap-[3px]">
      {ACCENT_OPTIONS.map((option) => {
        const selected = option.value === accent;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => setAccent(option.value)}
            className={`slant block shrink-0 border-0 p-0 focus-visible:[box-shadow:inset_0_0_0_2px_var(--color-ds-ink)] ${
              selected
                ? 'h-3.5 w-5 shadow-[inset_0_-3px_0_var(--color-ds-ink)]'
                : 'h-2.5 w-4 hover:brightness-110'
            }`}
            style={{ backgroundColor: option.swatch }}
          />
        );
      })}
    </div>
  );
}
