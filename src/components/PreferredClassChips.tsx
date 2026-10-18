import { CAR_CLASSES } from '../types/carClass';

/** The backend stores "preferred classes" as one comma-separated string (e.g. "GT3, GTP"). These
 * helpers read/write that exact format, so the chips below stay compatible with every existing
 * row — including free-text values typed before the chips existed ("Porsche Cup"), which are kept
 * untouched when other chips are toggled. */
export function parsePreferredClasses(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function serializePreferredClasses(classes: string[]): string {
  return classes.join(', ');
}

/** Canonical form for comparing two stored values (ignores spacing / empty tokens). */
export function normalizePreferredClasses(value: string | null | undefined): string {
  return serializePreferredClasses(parsePreferredClasses(value));
}

/** Toggle chips for the app's car classes. Fully controlled: `value` is the stored string, and
 * `onChange` receives the new string to store. */
export default function PreferredClassChips({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
}) {
  const selected = parsePreferredClasses(value);
  const legacy = selected.filter((c) => !(CAR_CLASSES as readonly string[]).includes(c));

  function toggle(carClass: string) {
    onChange(
      serializePreferredClasses(
        selected.includes(carClass) ? selected.filter((c) => c !== carClass) : [...selected, carClass],
      ),
    );
  }

  const chipClass = (on: boolean) =>
    `cut-xs min-h-9 cursor-pointer border-0 px-4 text-[13px] font-extrabold uppercase ${
      on ? 'bg-w2w-red text-on-accent hover:brightness-110' : 'bg-ds-control text-ds-muted hover:bg-ds-control-hover'
    }`;

  return (
    <div role="group" aria-label="Preferred classes" className="flex flex-wrap gap-1.5">
      {CAR_CLASSES.map((carClass) => {
        const on = selected.includes(carClass);
        return (
          <button
            key={carClass}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(carClass)}
            className={chipClass(on)}
          >
            {carClass}
          </button>
        );
      })}
      {legacy.map((carClass) => (
        <button
          key={carClass}
          type="button"
          aria-pressed
          title="Custom value — click to remove"
          onClick={() => toggle(carClass)}
          className={chipClass(true)}
        >
          {carClass}
        </button>
      ))}
    </div>
  );
}
