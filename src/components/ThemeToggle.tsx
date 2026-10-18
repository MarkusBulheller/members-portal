import { useTheme } from '../context/ThemeContext';

/** Moon / sun glyphs rather than text labels — reads at a glance in the narrow sidebar and doesn't
 * need translating if this app ever isn't English-only. */
function SunIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

/** Two-way theme switch: a dark / light pair where the active side is filled. Either button flips
 * the theme only when it isn't already the current one (the context only exposes a toggle). */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  function segment(selected: boolean) {
    return `cut-xs flex h-7 w-[30px] items-center justify-center transition-colors ${
      selected ? 'bg-ds-rank text-ds-ink' : 'text-ds-muted hover:text-ds-ink'
    }`;
  }

  return (
    <div role="group" aria-label="Theme" className="cut-xs flex shrink-0 gap-0.5 bg-ds-field p-[3px]">
      <button
        type="button"
        aria-pressed={!isLight}
        aria-label="Dark theme"
        onClick={() => isLight && toggleTheme()}
        className={segment(!isLight)}
      >
        <MoonIcon />
      </button>
      <button
        type="button"
        aria-pressed={isLight}
        aria-label="Light theme"
        onClick={() => !isLight && toggleTheme()}
        className={segment(isLight)}
      >
        <SunIcon />
      </button>
    </div>
  );
}
