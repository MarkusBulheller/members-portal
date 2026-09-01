import { Link } from 'react-router-dom';
import { podiumColor } from '../lib/podium';

/** Shared by the "Races" section on driver, car, and track detail pages — same card, different
 * title/subtitle/stats depending on which entity's page it's shown on. */
export function positionLabel(position: number | null): string {
  return position === null ? '—' : `P${position}`;
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
      className="flex items-center justify-between bg-w2w-charcoal border border-white/10 px-5 py-4 hover:border-white/30 transition-colors"
    >
      <div>
        <p className="font-heading font-semibold text-white text-sm">{title}</p>
        <p className="text-white/65 text-xs mt-0.5">{subtitle}</p>
      </div>
      <div className="text-right shrink-0 ml-4">
        <p
          className="font-display font-black text-xl leading-none"
          style={{ color: podiumColor(position, 'var(--color-w2w-red)') }}
        >
          {positionLabel(position)}
        </p>
        {statsLine && <p className="text-white/65 text-[11px] mt-1.5">{statsLine}</p>}
      </div>
    </Link>
  );
}
