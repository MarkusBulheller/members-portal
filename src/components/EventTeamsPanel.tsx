import { useState } from 'react';
import { Link } from 'react-router-dom';
import { eventTeamsApi } from '../lib/api/eventTeams';
import { eventsApi } from '../lib/api/events';
import { ApiError } from '../lib/api';
import { getDriverColor, orderedDriverIds } from '../lib/driverColors';
import { formatSlot } from '../lib/eventFormatting';
import type { Car } from '../types/car';
import type { EventSignup, EventTimeslot } from '../types/event';
import type { EventTeam } from '../types/eventTeam';
import type { IracingTeam } from '../types/iracingTeam';

interface Props {
  eventId: string;
  isAdmin: boolean;
  teams: EventTeam[];
  cars: Car[];
  timeslots: EventTimeslot[];
  /** Empty unless the viewer is an admin — GET /iracing/teams is admin-only, so a non-admin never
   * gets the roster data needed to show the on-roster check marks below. */
  iracingTeams: IracingTeam[];
  driverNames: Record<string, string>;
  /** userId -> iRacing customer id (string form, matches DriverProfile.iracingCustomerId) — null
   * for a driver with no linked iRacing account, which can't be roster-checked. */
  driverIracingCustIds: Record<string, string | null>;
  signups: EventSignup[];
  onChange: () => void;
}

function carName(cars: Car[], carId: string | null): string | null {
  return carId ? (cars.find((c) => c.id === carId)?.name ?? null) : null;
}

export default function EventTeamsPanel({
  eventId,
  isAdmin,
  teams,
  cars,
  timeslots,
  iracingTeams,
  driverNames,
  driverIracingCustIds,
  signups,
  onChange,
}: Props) {
  const [newName, setNewName] = useState('');
  const [newCarId, setNewCarId] = useState('');
  const [newIracingTeamId, setNewIracingTeamId] = useState('');
  const [newTimeslotId, setNewTimeslotId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unassigned = signups.filter((s) => s.eventTeamId === null);
  // Shared across every team card so the same driver keeps the same color everywhere on this
  // page, same convention as the Strategy timeline (driverColors.ts).
  const driverColorOrder = orderedDriverIds(signups.map((s) => ({ driverUserId: s.userId })));

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  async function handleAddTeam() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await eventTeamsApi.create(eventId, {
        name: newName.trim(),
        carId: newCarId || null,
        iracingTeamId: newIracingTeamId ? Number(newIracingTeamId) : null,
        timeslotId: newTimeslotId || null,
      });
      setNewName('');
      setNewCarId('');
      setNewIracingTeamId('');
      setNewTimeslotId('');
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create team');
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameTeam(team: EventTeam, name: string) {
    if (!name.trim() || name === team.name) return;
    try {
      await eventTeamsApi.update(eventId, team.id, { name: name.trim() });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to rename team');
    }
  }

  async function handleTeamCarChange(team: EventTeam, carId: string) {
    try {
      await eventTeamsApi.update(eventId, team.id, { carId: carId || null });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update team');
    }
  }

  async function handleTeamIracingLinkChange(team: EventTeam, iracingTeamId: string) {
    try {
      await eventTeamsApi.update(eventId, team.id, { iracingTeamId: iracingTeamId ? Number(iracingTeamId) : null });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update team');
    }
  }

  async function handleTeamTimeslotChange(team: EventTeam, timeslotId: string) {
    try {
      await eventTeamsApi.update(eventId, team.id, { timeslotId: timeslotId || null });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update team');
    }
  }

  async function handleDeleteTeam(team: EventTeam) {
    setBusy(true);
    setError(null);
    try {
      await eventTeamsApi.remove(eventId, team.id);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete team');
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(signupId: string, eventTeamId: string | null) {
    setBusy(true);
    setError(null);
    try {
      await eventsApi.assignSignupTeam(eventId, signupId, eventTeamId);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update driver assignment');
    } finally {
      setBusy(false);
    }
  }

  function rosterStatus(userId: string, iracingTeamId: number): 'on' | 'off' | 'unknown' {
    const custId = driverIracingCustIds[userId];
    if (!custId) return 'unknown';
    const team = iracingTeams.find((t) => t.teamId === iracingTeamId);
    if (!team) return 'unknown';
    return team.members.some((m) => m.custId === Number(custId)) ? 'on' : 'off';
  }

  return (
    <div>
      {isAdmin && (
        <div className="mb-6 bg-w2w-charcoal/60 border border-white/10 border-dashed p-4">
          <p className="font-heading text-[10px] tracking-[0.2em] text-white/50 uppercase mb-3">New Team</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FormField label="Team Name">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Car 1"
                className="input"
              />
            </FormField>
            <FormField label="Car">
              <select value={newCarId} onChange={(e) => setNewCarId(e.target.value)} className="input">
                <option value="">No car set</option>
                {cars.map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="iRacing Team">
              <select
                value={newIracingTeamId}
                onChange={(e) => setNewIracingTeamId(e.target.value)}
                className="input"
              >
                <option value="">No link</option>
                {iracingTeams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Timeslot">
              <select value={newTimeslotId} onChange={(e) => setNewTimeslotId(e.target.value)} className="input">
                <option value="">Not chosen</option>
                {timeslots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {formatSlot(slot.startsAt)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <button
            type="button"
            onClick={() => void handleAddTeam()}
            disabled={busy || !newName.trim()}
            className="mt-4 px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold text-xs uppercase tracking-wide transition-colors clip-corner"
          >
            + Add Team
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-w2w-red text-sm mb-3">
          {error}
        </p>
      )}

      {teams.length === 0 ? (
        <p className="text-white/65 text-sm">No teams built yet.</p>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => {
            const members = signups.filter((s) => s.eventTeamId === team.id);
            const teamCarName = carName(cars, team.carId);
            const teamIracingTeamName = iracingTeams.find((t) => t.teamId === team.iracingTeamId)?.teamName ?? null;
            const teamTimeslot = timeslots.find((s) => s.id === team.timeslotId) ?? null;

            return (
              <div key={team.id} className="border border-white/10 bg-w2w-charcoal">
                <div className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap border-b border-white/5">
                  <div className="min-w-0">
                    {isAdmin ? (
                      <input
                        defaultValue={team.name}
                        onBlur={(e) => void handleRenameTeam(team, e.target.value)}
                        className="bg-transparent font-display font-black text-lg uppercase tracking-wide text-white border-b border-transparent hover:border-white/20 focus:border-w2w-red outline-none -ml-0.5 px-0.5 min-w-0"
                      />
                    ) : (
                      <p className="font-display font-black text-lg uppercase tracking-wide text-white">{team.name}</p>
                    )}
                    {!isAdmin && (
                      <p className="text-white/50 text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {teamCarName && <span>{teamCarName}</span>}
                        {teamIracingTeamName && <span>{teamIracingTeamName}</span>}
                        {teamTimeslot && <span>{formatSlot(teamTimeslot.startsAt)}</span>}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        to={`/events/${eventId}/teams/${team.id}/plan`}
                        className="px-3 py-1.5 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-[11px] uppercase tracking-wide transition-colors"
                      >
                        Plan Stints
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTeam(team)}
                        disabled={busy}
                        className="px-3 py-1.5 border border-w2w-red/40 text-w2w-red hover:bg-w2w-red/10 disabled:opacity-50 font-heading text-[11px] uppercase tracking-wide transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-white/5 bg-white/[0.02]">
                    <FormField label="Car">
                      <select
                        value={team.carId ?? ''}
                        onChange={(e) => void handleTeamCarChange(team, e.target.value)}
                        className="input py-1.5 text-xs"
                      >
                        <option value="">No car set</option>
                        {cars.map((car) => (
                          <option key={car.id} value={car.id}>
                            {car.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="iRacing Team">
                      <select
                        value={team.iracingTeamId ?? ''}
                        onChange={(e) => void handleTeamIracingLinkChange(team, e.target.value)}
                        className="input py-1.5 text-xs"
                      >
                        <option value="">No link</option>
                        {iracingTeams.map((t) => (
                          <option key={t.teamId} value={t.teamId}>
                            {t.teamName}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Timeslot">
                      <select
                        value={team.timeslotId ?? ''}
                        onChange={(e) => void handleTeamTimeslotChange(team, e.target.value)}
                        className="input py-1.5 text-xs"
                      >
                        <option value="">Not chosen</option>
                        {timeslots.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {formatSlot(slot.startsAt)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                )}

                <div className="px-5 py-4">
                  {members.length === 0 ? (
                    <p className="text-white/50 text-xs">No drivers assigned yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {members.map((signup) => {
                        const status = team.iracingTeamId !== null ? rosterStatus(signup.userId, team.iracingTeamId) : null;
                        const name = driverNames[signup.userId] ?? 'Unknown driver';
                        const color = getDriverColor(signup.userId, driverColorOrder);
                        return (
                          <li
                            key={signup.id}
                            className="flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 rounded-sm hover:bg-white/[0.03] transition-colors"
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span
                                aria-hidden="true"
                                className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-heading font-bold text-w2w-black ${color.dot}`}
                              >
                                {initials(name)}
                              </span>
                              <span className="text-white/85 text-sm truncate">{name}</span>
                              {signup.carClass && (
                                <span className="shrink-0 text-white/50 text-[10px] font-heading uppercase tracking-wide px-1.5 py-0.5 bg-white/5">
                                  {signup.carClass}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center gap-3 shrink-0">
                              {isAdmin && status && (
                                <span
                                  className={`flex items-center gap-1.5 text-[10px] font-heading uppercase tracking-wide ${
                                    status === 'on' ? 'text-emerald-400' : status === 'off' ? 'text-w2w-red' : 'text-white/35'
                                  }`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      status === 'on' ? 'bg-emerald-400' : status === 'off' ? 'bg-w2w-red' : 'bg-white/35'
                                    }`}
                                  />
                                  {status === 'on' ? 'On roster' : status === 'off' ? 'Not on roster' : 'No link'}
                                </span>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => void handleAssign(signup.id, null)}
                                  disabled={busy}
                                  aria-label={`Remove ${name} from ${team.name}`}
                                  className="text-white/40 hover:text-w2w-red disabled:opacity-40 transition-colors"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {isAdmin && unassigned.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && void handleAssign(e.target.value, team.id)}
                      disabled={busy}
                      className="input py-1.5 text-xs mt-3 w-full sm:w-64"
                    >
                      <option value="">+ Add driver...</option>
                      {unassigned.map((signup) => (
                        <option key={signup.id} value={signup.id}>
                          {driverNames[signup.userId] ?? 'Unknown driver'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="mt-4">
          <p className="font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase mb-2">
            Unassigned ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((signup) => (
              <span key={signup.id} className="px-2.5 py-1 text-xs bg-white/5 text-white/65">
                {driverNames[signup.userId] ?? 'Unknown driver'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-heading text-[10px] tracking-[0.15em] text-white/50 uppercase">{label}</span>
      {children}
    </label>
  );
}
