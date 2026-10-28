import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { groupChecks, isAdminOnlyFix, readinessFixPath } from '../lib/readiness';
import type { ReadinessCheck } from '../types/readiness';

const TONE_BG = {
  danger: 'bg-[color-mix(in_oklab,var(--color-ds-danger)_16%,transparent)] text-ds-danger',
  warn: 'bg-[color-mix(in_oklab,var(--color-ds-warn)_16%,transparent)] text-ds-warn',
  muted: 'bg-ds-control text-ds-muted',
  pass: 'bg-w2w-red text-on-accent',
} as const;

const LEVEL_WORD = { BLOCKER: 'Blocker', WARNING: 'Warning', INFO: 'Info' } as const;

function CheckIcon({ check }: { check: ReadinessCheck }) {
  const tone =
    check.status === 'PASS'
      ? 'pass'
      : check.status === 'PENDING'
        ? 'muted'
        : check.level === 'BLOCKER'
          ? 'danger'
          : check.level === 'WARNING'
            ? 'warn'
            : 'muted';
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'square' as const };
  let glyph;
  if (check.status === 'PASS') glyph = <path d="M5 12.5l4.5 4.5L19 7.5" />;
  else if (check.status === 'PENDING') glyph = <path d="M12 6v6.5l4 2" />;
  else if (check.level === 'BLOCKER') glyph = <path d="M6 6l12 12M18 6L6 18" />;
  else if (check.level === 'WARNING') glyph = <path d="M12 5v9M12 18.5v.5" />;
  else glyph = <path d="M12 11v7M12 5.5v.5" />;
  return (
    <span aria-hidden="true" className={`cut-xs mt-px flex h-6 w-6 shrink-0 items-center justify-center ${TONE_BG[tone]}`}>
      <svg {...common}>{glyph}</svg>
    </span>
  );
}

function CheckRow({ check, eventId }: { check: ReadinessCheck; eventId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const pending = check.status === 'PENDING';
  const passed = check.status === 'PASS';
  const showFix = !!check.fix && !passed && (isAdmin || !isAdminOnlyFix(check.fix));
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ds-line py-2.5 first:border-t-0">
      <CheckIcon check={check} />
      <span className="flex min-w-0 flex-1 basis-[200px] flex-col gap-0.5">
        <span className={`text-sm font-bold ${pending || passed ? 'text-ds-muted' : 'text-ds-ink'}`}>
          {pending && <span className="font-semibold">Waiting: </span>}
          {check.title}
          <span className="sr-only">
            {passed ? ' (passed)' : pending ? ' (waiting)' : ` (${LEVEL_WORD[check.level].toLowerCase()})`}
          </span>
        </span>
        {check.detail && <span className="text-xs text-ds-muted">{check.detail}</span>}
      </span>
      {showFix && check.fix && (
        <Link to={readinessFixPath(eventId, check.fix)} className="btn-secondary btn-sm shrink-0">
          {check.fix.label}
        </Link>
      )}
    </li>
  );
}

/** A group of readiness checks: failures first (blockers, warnings, infos), then the ones still
 * waiting on something, then — folded into a disclosure — everything that passed. With
 * `onlyIssues` the passed checks are left out entirely (used by the compact tag). */
export default function ReadinessCheckList({
  checks,
  eventId,
  onlyIssues = false,
}: {
  checks: ReadinessCheck[];
  eventId: string;
  onlyIssues?: boolean;
}) {
  const [showPassed, setShowPassed] = useState(false);
  const passedId = useId();
  const { failed, pending, passed } = groupChecks(checks);
  const open = [...failed, ...pending];

  return (
    <div className="flex flex-col">
      {open.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {open.map((check) => (
            <CheckRow key={check.id} check={check} eventId={eventId} />
          ))}
        </ul>
      )}
      {open.length === 0 && (onlyIssues || passed.length === 0) && (
        <p className="m-0 py-1 text-[13px] text-ds-muted">
          {passed.length === 0 ? 'No checks to show.' : 'Nothing needs attention.'}
        </p>
      )}
      {!onlyIssues && passed.length > 0 && (
        <div className={open.length > 0 ? 'border-t border-ds-line pt-1' : ''}>
          <button
            type="button"
            aria-expanded={showPassed}
            aria-controls={passedId}
            onClick={() => setShowPassed((v) => !v)}
            className="flex cursor-pointer items-center gap-2 border-0 bg-transparent px-0 py-2 text-xs font-semibold text-ds-muted hover:text-ds-ink"
          >
            <svg
              aria-hidden="true"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              className={`transition-transform motion-reduce:transition-none ${showPassed ? 'rotate-90' : ''}`}
            >
              <path d="M2 0l6 5-6 5z" />
            </svg>
            <span className="num">{passed.length}</span>
            <span>{passed.length === 1 ? 'check passed' : 'checks passed'}</span>
          </button>
          <ul id={passedId} hidden={!showPassed} className="m-0 list-none p-0">
            {showPassed && passed.map((check) => <CheckRow key={check.id} check={check} eventId={eventId} />)}
          </ul>
        </div>
      )}
    </div>
  );
}
