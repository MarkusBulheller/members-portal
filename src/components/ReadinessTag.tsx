import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { readinessTagLabel } from '../lib/readiness';
import type { ReadinessCheck, ReadinessSummary } from '../types/readiness';
import ReadinessCheckList from './ReadinessCheckList';

const DANGER_BG = { background: 'color-mix(in oklab, var(--color-ds-danger) 14%, transparent)' };

function toneClass(summary: ReadinessSummary): string {
  switch (summary.status) {
    case 'READY':
      return 'chip-accent';
    case 'WARNINGS':
      return 'chip-warn';
    case 'BLOCKED':
      return 'text-ds-danger';
    case 'PENDING':
      return 'chip-muted';
  }
}

/** Compact readiness tag. With `checks` it is a button that expands that list of open issues
 * inline (put it last in a `flex-wrap` row — the list takes a full line); with `to` it is a link
 * (e.g. to the event page's readiness panel). */
export default function ReadinessTag({
  summary,
  eventId,
  checks,
  to,
  label,
}: {
  summary: ReadinessSummary;
  eventId: string;
  checks?: ReadinessCheck[];
  to?: string;
  /** Overrides the default wording ("Ready" / "2 issues" / "Not set up yet"). */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const text = label ?? readinessTagLabel(summary);
  const className = `chip chip-sm ${toneClass(summary)} cursor-pointer border-0 focus-visible:shadow-[inset_0_0_0_2px_currentColor]`;
  const style = summary.status === 'BLOCKED' ? DANGER_BG : undefined;

  if (to) {
    return (
      <Link to={to} className={className} style={style} title="Open the race readiness check">
        Readiness: {text}
      </Link>
    );
  }

  const hasList = !!checks;
  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        aria-expanded={hasList ? open : undefined}
        aria-controls={hasList ? listId : undefined}
        disabled={!hasList}
        onClick={() => setOpen((v) => !v)}
        title="Race readiness"
      >
        Readiness: {text}
      </button>
      {hasList && open && (
        <div id={listId} className="cut basis-full bg-ds-panel px-4 py-2.5">
          <ReadinessCheckList checks={checks} eventId={eventId} onlyIssues />
        </div>
      )}
    </>
  );
}
