import type { EventTeam } from '../types/eventTeam';
import type { User } from '../types/user';

/**
 * Who may run an event team's race planning in the UI. Mirrors the backend's TeamManagePolicy
 * (members-backend `src/auth/team-manage.policy.ts`), which is the actual enforcement - this only
 * decides which controls to show. A lead belongs to ONE event crew (one `event_teams` row), chosen
 * by an admin on that crew's plan page; `/auth/me` lists the crews the user currently leads.
 *
 * | user                                    | `leadOfEventTeamIds` | event team id | canManageTeam |
 * | --------------------------------------- | -------------------- | ------------- | ------------- |
 * | ADMIN                                   | anything             | anything      | true          |
 * | member who leads this crew              | [A]                  | A             | true          |
 * | member who leads another crew           | [A]                  | B             | false         |
 * | member who leads nothing / plain member | [] / undefined       | A             | false         |
 * | no user / no team yet                   | -                    | -             | false         |
 *
 * The crew's iRacing team plays no role. The backend only lists crews the lead is still placed on,
 * so a lead moved off a crew drops out of `leadOfEventTeamIds` on the next /auth/me.
 */
export function canManageTeam(
  user: Pick<User, 'role' | 'leadOfEventTeamIds'> | null | undefined,
  eventTeam: Pick<EventTeam, 'id'> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!eventTeam) return false;
  return (user.leadOfEventTeamIds ?? []).includes(eventTeam.id);
}

/** A non-admin who can manage this team: shown the "You lead this team" chip. */
export function isTeamLeadOnly(
  user: Pick<User, 'role' | 'leadOfEventTeamIds'> | null | undefined,
  eventTeam: Pick<EventTeam, 'id'> | null | undefined,
): boolean {
  return !!user && user.role !== 'ADMIN' && canManageTeam(user, eventTeam);
}
