import { readinessStatusLabel } from '../lib/readiness';
import type { ReadinessSummary } from '../types/readiness';

const DANGER_BG = { background: 'color-mix(in oklab, var(--color-ds-danger) 14%, transparent)' };

/** The overall status tag of a readiness summary (accent = ready, warn = warnings, danger =
 * blockers, muted = not enough set up yet). */
export default function ReadinessStatusChip({ summary, small = false }: { summary: ReadinessSummary; small?: boolean }) {
  const size = small ? ' chip-sm' : '';
  const label = readinessStatusLabel(summary);
  switch (summary.status) {
    case 'READY':
      return <span className={`chip chip-accent${size}`}>{label}</span>;
    case 'WARNINGS':
      return <span className={`chip chip-warn${size}`}>{label}</span>;
    case 'BLOCKED':
      return (
        <span className={`chip text-ds-danger${size}`} style={DANGER_BG}>
          {label}
        </span>
      );
    case 'PENDING':
      return <span className={`chip chip-muted${size}`}>{label}</span>;
  }
}
