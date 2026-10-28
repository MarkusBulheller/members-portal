export type ReadinessLevel = 'BLOCKER' | 'WARNING' | 'INFO';
export type ReadinessStatus = 'PASS' | 'FAIL' | 'PENDING';

export interface ReadinessFix {
  kind: 'team-settings' | 'team-plan' | 'team-availability' | 'team-building' | 'event-edit' | 'signups';
  teamId?: string;
  label: string;
}

export interface ReadinessCheck {
  id: string;
  level: ReadinessLevel;
  status: ReadinessStatus;
  title: string;
  detail?: string;
  fix?: ReadinessFix;
}

export interface ReadinessSummary {
  blockers: number;
  warnings: number;
  infos: number;
  pending: number;
  passed: number;
  status: 'READY' | 'WARNINGS' | 'BLOCKED' | 'PENDING';
}

export interface ReadinessTeam {
  teamId: string;
  teamName: string;
  summary: ReadinessSummary;
  checks: ReadinessCheck[];
}

export interface ReadinessResult {
  eventId: string;
  generatedAt: string;
  minDriversPerTeam: number;
  summary: ReadinessSummary;
  event: ReadinessCheck[];
  teams: ReadinessTeam[];
}
