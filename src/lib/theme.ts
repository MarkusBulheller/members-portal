export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'w2w-theme';

/** Dark is this app's default (matches how it always looked before light mode existed) — only
 * an explicit stored "light" choice switches it. No stored preference, or a stale/invalid value,
 * quietly falls back to dark instead of throwing. */
export function getStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Sets the [data-theme] attribute index.css keys its light-mode token overrides off, and
 * persists the choice. Called synchronously at module load (see main.tsx) — before React ever
 * renders — so a returning light-mode visitor never sees a flash of the dark default first. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (private browsing, storage disabled) — theme just won't persist
  }
}
