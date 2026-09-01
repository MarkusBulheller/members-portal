// References the theme-aware --color-podium-* custom properties (see index.css) rather than
// literal hex — podium colors are used as TEXT, so they need different values per theme (a
// silver light enough to read on a dark card is nearly invisible on a white one), and this way
// the color automatically follows the live theme without every call site needing to know it.
const PODIUM_VARS: Record<number, string> = {
  1: 'var(--color-podium-gold)',
  2: 'var(--color-podium-silver)',
  3: 'var(--color-podium-bronze)',
};

/** Position display color: a podium metal for P1–P3 (in-class, per the app's convention of
 * showing class position over overall), the given fallback for everyone else. */
export function podiumColor(position: number | null, fallback: string): string {
  if (position === null) return fallback;
  return PODIUM_VARS[position] ?? fallback;
}
