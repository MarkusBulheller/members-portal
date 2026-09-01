export type Accent = 'blue' | 'red' | 'green' | 'racing-green' | 'purple' | 'orange' | 'teal' | 'pink';

export const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: 'blue', label: 'Racing Blue' },
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Electric Green' },
  { value: 'racing-green', label: 'British Racing Green' },
  { value: 'purple', label: 'Royal Purple' },
  { value: 'orange', label: 'Papaya Orange' },
  { value: 'teal', label: 'Petronas Teal' },
  { value: 'pink', label: 'Hot Pink' },
];

const STORAGE_KEY = 'w2w-accent';
const VALID_ACCENTS: Accent[] = ACCENT_OPTIONS.map((o) => o.value);

/** "blue" is the default (the base --color-w2w-red values in index.css) — every other option is
 * an opt-in data-accent="…" override. No stored preference, or a stale/invalid value, quietly
 * falls back to blue instead of throwing. */
export function getStoredAccent(): Accent {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return VALID_ACCENTS.includes(stored as Accent) ? (stored as Accent) : 'blue';
  } catch {
    return 'blue';
  }
}

/** Sets (or clears, for the default "blue") the [data-accent] attribute index.css keys its
 * accent-color overrides off, and persists the choice. Called synchronously at module load (see
 * main.tsx) — before React ever renders — so a returning visitor never sees a flash of blue
 * first if they'd picked something else. */
export function applyAccent(accent: Accent): void {
  if (accent === 'blue') {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accent;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, accent);
  } catch {
    // localStorage unavailable (private browsing, storage disabled) — choice just won't persist
  }
}
