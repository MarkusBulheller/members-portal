import { useTheme } from '../context/ThemeContext';

/** Sun/moon glyphs rather than text labels — reads at a glance in the narrow sidebar and doesn't
 * need translating if this app ever isn't English-only. */
function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M13.5 9.5A6 6 0 016.5 2.5a6 6 0 106.99 6.99z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      aria-pressed={isLight}
      className="inline-flex items-center gap-2 shrink-0"
    >
      <span className="text-white/65">
        <MoonIcon />
      </span>
      <span
        className="relative inline-flex h-5 w-9 items-center rounded-full bg-white/10 transition-colors"
      >
        <span
          className="inline-block h-4 w-4 rounded-full bg-w2w-red transition-transform"
          style={{ transform: isLight ? 'translateX(18px)' : 'translateX(2px)' }}
        />
      </span>
      <span className="text-white/65">
        <SunIcon />
      </span>
    </button>
  );
}
