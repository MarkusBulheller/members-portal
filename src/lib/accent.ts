export type Accent = 'red' | 'blue' | 'green' | 'racing-green' | 'purple' | 'orange' | 'teal' | 'pink';

/** `swatch` mirrors each option's base --color-w2w-red value in index.css — only used to paint the
 * picker's own swatch dots, which have to show every option at once regardless of which is active. */
export const ACCENT_OPTIONS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'red', label: 'W2W Red', swatch: '#e10600' },
  { value: 'blue', label: 'Racing Blue', swatch: '#2e6ff2' },
  { value: 'green', label: 'Electric Green', swatch: '#059669' },
  { value: 'racing-green', label: 'British Racing Green', swatch: '#1b7a4d' },
  { value: 'purple', label: 'Royal Purple', swatch: '#7c3aed' },
  { value: 'orange', label: 'Papaya Orange', swatch: '#ea580c' },
  { value: 'teal', label: 'Petronas Teal', swatch: '#0891b2' },
  { value: 'pink', label: 'Hot Pink', swatch: '#db2777' },
];

/** Only an explicit pick from the accent picker is stored. The old key ('w2w-accent') was written on
 * every page load, so a stored 'blue' there just meant "never changed it" back when blue was the
 * default; any other value there was a real choice and is carried over. */
const STORAGE_KEY = 'w2w-accent-choice';
const LEGACY_STORAGE_KEY = 'w2w-accent';
const VALID_ACCENTS: Accent[] = ACCENT_OPTIONS.map((o) => o.value);
const DEFAULT_ACCENT: Accent = 'red';

function isAccent(value: string | null): value is Accent {
  return value !== null && VALID_ACCENTS.includes(value as Accent);
}

/** The visitor's chosen accent, or W2W red. Never throws (private browsing, storage disabled). */
export function getStoredAccent(): Accent {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isAccent(stored)) return stored;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (isAccent(legacy) && legacy !== 'blue') return legacy;
  } catch {
    // storage unavailable — fall through to the default
  }
  return DEFAULT_ACCENT;
}

/** Sets (or clears, for the default red) the [data-accent] attribute index.css keys its accent
 * overrides off. Called at module load (see main.tsx) before React renders, so there's no flash of
 * the default. Pass `remember` only for a choice the visitor actually made in the picker. */
export function applyAccent(accent: Accent, remember = false): void {
  if (accent === DEFAULT_ACCENT) {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accent;
  }
  if (!remember) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, accent);
  } catch {
    // localStorage unavailable — choice just won't persist
  }
}
