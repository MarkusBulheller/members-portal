import { Link } from 'react-router-dom';

/** Shared by the "Races" section on driver, car, and track detail pages — same card, different
 * title/subtitle/stats depending on which entity's page it's shown on. */
export function positionLabel(position: number | null): string {
  return position === null ? '—' : `P${position}`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "27 Dec 2025" — the date format used across the results pages. Fixed 3-letter months (modern
 * ICU renders September as "Sept" in en-GB). */
export function formatRaceDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

const PODIUM_BG: Record<number, string> = { 1: '#e8c34a', 2: '#c7cbd1', 3: '#cd8a4e' };

/** Slanted finishing-position pill: gold/silver/bronze for P1-P3 (same hex in both themes, dark
 * text on top), neutral control fill otherwise. */
export function PositionPill({ position, className = '' }: { position: number | null; className?: string }) {
  const medal = position !== null ? PODIUM_BG[position] : undefined;
  return (
    <span
      className={`slant num inline-block min-w-12 px-2 py-[3px] text-center text-[15px] ${
        medal ? '' : 'bg-ds-control text-ds-ink-soft'
      } ${className}`}
      style={medal ? { background: medal, color: '#111113' } : undefined}
    >
      {positionLabel(position)}
    </span>
  );
}

export default function RaceResultRow({
  to,
  title,
  subtitle,
  position,
  statsLine,
}: {
  to: string;
  title: string;
  subtitle: string;
  position: number | null;
  statsLine: string | null;
}) {
  return (
    <Link
      to={to}
      className="cut row-hover flex items-center justify-between gap-4 bg-ds-panel px-5 py-3.5 text-ds-ink"
    >
      <div className="min-w-0">
        <p className="font-bold text-ds-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ds-muted">{subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <PositionPill position={position} />
        {statsLine && <p className="text-[11px] text-ds-muted">{statsLine}</p>}
      </div>
    </Link>
  );
}
