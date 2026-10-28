import type { ReadinessCheck, ReadinessFix, ReadinessSummary } from '../types/readiness';

/** Where a readiness "fix" button leads. Team-level fixes without a teamId fall back to the
 * event page. The plan page reads `?tab=` once on mount to pick its initial tab. */
export function readinessFixPath(eventId: string, fix: ReadinessFix): string {
  const base = `/events/${eventId}`;
  const plan = fix.teamId ? `${base}/teams/${fix.teamId}/plan` : base;
  switch (fix.kind) {
    case 'team-settings':
      return fix.teamId ? `${plan}?tab=settings` : base;
    case 'team-availability':
      return fix.teamId ? `${plan}?tab=availability` : base;
    case 'team-plan':
      return plan;
    case 'team-building':
      return `${base}/teams`;
    case 'event-edit':
      return `${base}/edit`;
    case 'signups':
      return `${base}#signups`;
  }
}

/** Fixes that lead to pages only admins can open. */
export function isAdminOnlyFix(fix: ReadinessFix): boolean {
  return fix.kind === 'team-building' || fix.kind === 'event-edit';
}

const LEVEL_ORDER = { BLOCKER: 0, WARNING: 1, INFO: 2 } as const;

export interface GroupedChecks {
  /** Failed checks, blockers first, then warnings, then infos. */
  failed: ReadinessCheck[];
  /** Checks that cannot be evaluated yet. */
  pending: ReadinessCheck[];
  passed: ReadinessCheck[];
}

export function groupChecks(checks: ReadinessCheck[]): GroupedChecks {
  const byLevel = (a: ReadinessCheck, b: ReadinessCheck) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
  return {
    failed: checks.filter((c) => c.status === 'FAIL').sort(byLevel),
    pending: checks.filter((c) => c.status === 'PENDING').sort(byLevel),
    passed: checks.filter((c) => c.status === 'PASS'),
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Label for the big status chip: "Ready to race", "2 warnings", "1 blocker", "Not enough set up yet". */
export function readinessStatusLabel(summary: ReadinessSummary): string {
  switch (summary.status) {
    case 'READY':
      return 'Ready to race';
    case 'WARNINGS':
      return plural(summary.warnings, 'warning', 'warnings');
    case 'BLOCKED':
      return plural(summary.blockers, 'blocker', 'blockers');
    case 'PENDING':
      return 'Not enough set up yet';
  }
}

/** Short label for a per-team tag: "Ready", "2 issues", "Not set up yet". */
export function readinessTagLabel(summary: ReadinessSummary): string {
  switch (summary.status) {
    case 'READY':
      return 'Ready';
    case 'PENDING':
      return 'Not set up yet';
    default: {
      const issues = summary.blockers + summary.warnings;
      return plural(issues, 'issue', 'issues');
    }
  }
}

/** Whole-event tag wording: "2 blockers · 1 warning", "Ready", "Not set up yet". */
export function readinessSummaryLabel(summary: ReadinessSummary): string {
  if (summary.status === 'READY') return 'Ready';
  if (summary.status === 'PENDING') return 'Not set up yet';
  const parts: string[] = [];
  if (summary.blockers > 0) parts.push(plural(summary.blockers, 'blocker', 'blockers'));
  if (summary.warnings > 0) parts.push(plural(summary.warnings, 'warning', 'warnings'));
  return parts.join(' · ') || readinessTagLabel(summary);
}

/** Total checks that have been decided (passed or failed) vs. all checks, for the progress line. */
export function progressOf(summary: ReadinessSummary): { passed: number; total: number } {
  const total = summary.passed + summary.blockers + summary.warnings + summary.infos + summary.pending;
  return { passed: summary.passed, total };
}

/** The failed checks of a list, worst first (blockers, warnings, infos). */
export function failedChecksOf(checks: ReadinessCheck[]): ReadinessCheck[] {
  return groupChecks(checks).failed;
}

/** The readiness check is only shown while teams are being built: after signups close
 * (SIGNUPS_CLOSED) and until the event is completed or cancelled. Before that there is nothing
 * to check yet, and afterwards it no longer matters. */
export function isReadinessPhase(status: string | null | undefined): boolean {
  return status === 'SIGNUPS_CLOSED';
}
