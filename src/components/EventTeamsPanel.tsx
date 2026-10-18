import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { eventTeamDummyDriversApi } from '../lib/api/eventTeamDummyDrivers';
import { eventTeamsApi } from '../lib/api/eventTeams';
import { eventsApi } from '../lib/api/events';
import { ApiError } from '../lib/api';
import { formatClock, formatSlot } from '../lib/eventFormatting';
import { initials } from '../lib/initials';
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
  /** False for a non-iRacing event, where the iRacing team link has no meaning. Defaults true. */
  isIracing?: boolean;
  /** Every portal member (with an account) an admin may add to a team. Those without an active
   * signup are offered under "Not signed up" and get signed up as they're added. */
  rosterMembers?: { userId: string; name: string }[];
  /** Drivers-roster entries with no portal account. They can't sign up, so they're added to a
   * team directly (as a guest on that team's plan) rather than through a signup. */
  rosterGuests?: { profileId: string; name: string }[];
  /** A team whose name input should take focus as soon as it renders — set by the page after its
   * header "+ Add team" creates one. Cleared through onFocusHandled once focused. */
  focusTeamId?: string | null;
  onFocusHandled?: () => void;
  onChange: () => void;
}

/** Pool detail line, e.g. "GT3 (or GTP) · 13:00, 20:00" — class plus the start times the driver
 * flagged at signup. Times carry the weekday/date only when the event has candidates on several days. */
function buildSignupDetail(signup: EventSignup, multiDay: boolean): string {
  const parts: string[] = [];
  if (signup.carClass) {
    parts.push(signup.carClass + (signup.secondaryCarClass ? ` (or ${signup.secondaryCarClass})` : ''));
  }
  const slots = [...signup.timeslots].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (slots.length > 0) {
    parts.push(slots.map((t) => (multiDay ? formatSlot(t.startsAt) : formatClock(t.startsAt))).join(', '));
  }
  return parts.join(' · ');
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
  isIracing = true,
  rosterMembers = [],
  rosterGuests = [],
  focusTeamId = null,
  onFocusHandled,
  onChange,
}: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Team whose inline "+ Guest driver (no account)" form is open, and the name being typed. */
  const [guestFormTeamId, setGuestFormTeamId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const nameInputRefs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (!focusTeamId) return;
    const input = nameInputRefs.current.get(focusTeamId);
    if (!input) return;
    input.focus();
    input.select();
    onFocusHandled?.();
  }, [focusTeamId, teams, onFocusHandled]);

  // Whether the event's candidate start times span several days, and each signup's detail line —
  // computed once per input change instead of twice per pool row per render.
  const multiDay = useMemo(() => new Set(timeslots.map((t) => new Date(t.startsAt).toDateString())).size > 1, [timeslots]);
  const detailBySignupId = useMemo(
    () => new Map(signups.map((sg) => [sg.id, buildSignupDetail(sg, multiDay)])),
    [signups, multiDay],
  );

  const unassigned = signups.filter((s) => s.eventTeamId === null);
  const signedUpUserIds = new Set(signups.map((s) => s.userId));
  const notSignedUp = rosterMembers.filter((m) => !signedUpUserIds.has(m.userId));
  const placedGuestProfileIds = new Set(
    teams.flatMap((t) => t.dummyDrivers ?? []).flatMap((d) => (d.driverProfileId ? [d.driverProfileId] : [])),
  );
  const availableGuests = rosterGuests.filter((g) => !placedGuestProfileIds.has(g.profileId));
  /** Avatar fill: neutral for everyone, the accent for the signed-in user. */
  function avatarClass(userId: string | null): string {
    return userId !== null && userId === user?.id ? 'bg-w2w-red text-on-accent' : 'bg-ds-control text-ds-ink';
  }

  /** Car class a driver signed up with, e.g. "GT3 (or GTP)". */
  function signupClass(signup: EventSignup): string | null {
    if (!signup.carClass) return null;
    return signup.carClass + (signup.secondaryCarClass ? ` (or ${signup.secondaryCarClass})` : '');
  }

  /** Short button label for a team: drops a shared "W2W Racing " prefix ("W2W Racing Red" -> "Red"). */
  function shortTeamName(name: string): string {
    const short = name.replace(/^W2W Racing\s+/i, '').trim();
    return short || name;
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

  async function handleAddMember(userId: string, eventTeamId: string) {
    setBusy(true);
    setError(null);
    try {
      await eventsApi.addSignup(eventId, { userId, eventTeamId });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add driver');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddGuest(profileId: string, teamId: string) {
    setBusy(true);
    setError(null);
    try {
      await eventTeamDummyDriversApi.create(eventId, teamId, { driverProfileId: profileId });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add driver');
    } finally {
      setBusy(false);
    }
  }

  /** Adds a free-text guest driver (no portal account, no roster entry) to a team's plan. */
  async function handleAddNamedGuest(teamId: string) {
    const name = guestName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await eventTeamDummyDriversApi.create(eventId, teamId, { name });
      setGuestName('');
      setGuestFormTeamId(null);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add guest driver');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveGuest(teamId: string, dummyId: string) {
    setBusy(true);
    setError(null);
    try {
      await eventTeamDummyDriversApi.remove(eventId, teamId, dummyId);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove driver');
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
    <div className="flex flex-wrap items-start gap-5">
      {(isAdmin || unassigned.length > 0) && (
        <section aria-labelledby="pool-title" className="cut min-w-0 flex-[1_1_300px] bg-ds-panel pb-1.5 pt-5">
          <div className="flex items-center justify-between gap-2 px-5 pb-3">
            <h2 id="pool-title" className="h2">
              Not on a team
            </h2>
            <span className="chip px-3 py-[3px]">
              {unassigned.length} of {signups.length}
            </span>
          </div>
          {unassigned.map((signup) => {
            const name = driverNames[signup.userId] ?? 'Unknown driver';
            const detail = detailBySignupId.get(signup.id);
            return (
              <div key={signup.id} className="row-hover flex flex-col gap-2.5 border-t border-ds-line px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`cut-xs flex h-[34px] w-[34px] shrink-0 items-center justify-center text-[13px] num ${avatarClass(signup.userId)}`}
                  >
                    {initials(name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{name}</span>
                    {detail && <span className="text-xs text-ds-muted">{detail}</span>}
                  </span>
                </div>
                {isAdmin && teams.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-[46px]">
                    {teams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => void handleAssign(signup.id, team.id)}
                        disabled={busy}
                        aria-label={`Add ${name} to ${team.name}`}
                        className="cut-xs min-h-8 max-w-full truncate border-0 bg-ds-control px-3 text-xs font-bold uppercase text-ds-ink hover:bg-ds-control-hover disabled:opacity-40"
                      >
                        + {shortTeamName(team.name)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {unassigned.length === 0 && (
            <p className="m-0 border-t border-ds-line px-5 py-4 text-ds-muted">Everyone who signed up is on a team.</p>
          )}
        </section>
      )}

      <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-4">
        {error && (
          <p role="alert" className="m-0 text-sm text-ds-danger">
            {error}
          </p>
        )}

        {teams.length === 0 && <p className="m-0 text-sm text-ds-muted">No teams built yet.</p>}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
          {teams.map((team) => {
            const members = signups.filter((s) => s.eventTeamId === team.id);
            const guests = team.dummyDrivers ?? [];
            const driverCount = members.length + guests.length;
            const teamCarName = carName(cars, team.carId);
            const teamIracingTeamName = iracingTeams.find((t) => t.teamId === team.iracingTeamId)?.teamName ?? null;
            const teamTimeslot = timeslots.find((s) => s.id === team.timeslotId) ?? null;

            return (
              <section key={team.id} className="cut flex flex-col gap-4 bg-ds-panel px-5 pb-5 pt-[18px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {isAdmin ? (
                      <input
                        ref={(el) => {
                          if (el) nameInputRefs.current.set(team.id, el);
                          else nameInputRefs.current.delete(team.id);
                        }}
                        aria-label="Team name"
                        defaultValue={team.name}
                        onBlur={(e) => void handleRenameTeam(team, e.target.value)}
                        className="cut-sm -ml-2.5 h-11 w-full min-w-0 border-0 bg-transparent px-2.5 text-[22px] font-extrabold text-ds-ink outline-none hover:bg-ds-raised focus:bg-ds-raised focus:shadow-[inset_0_-2px_0_var(--color-w2w-red)]"
                      />
                    ) : (
                      <p className="m-0 text-[22px] font-extrabold">{team.name}</p>
                    )}
                    {!isAdmin && (
                      <p className="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ds-muted">
                        {teamCarName && <span>{teamCarName}</span>}
                        {teamIracingTeamName && <span>{teamIracingTeamName}</span>}
                        {teamTimeslot && <span>{formatSlot(teamTimeslot.startsAt)}</span>}
                      </p>
                    )}
                  </div>
                  <span className={`chip ${driverCount >= 3 ? 'chip-accent' : 'chip-warn'}`}>
                    {driverCount} {driverCount === 1 ? 'driver' : 'drivers'}
                  </span>
                </div>

                {isAdmin && (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
                    <FormField label="Car">
                      <select
                        value={team.carId ?? ''}
                        onChange={(e) => void handleTeamCarChange(team, e.target.value)}
                        className="input px-2.5 text-[13px]"
                      >
                        <option value="">No car set</option>
                        {cars.map((car) => (
                          <option key={car.id} value={car.id}>
                            {car.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Start time">
                      <select
                        value={team.timeslotId ?? ''}
                        onChange={(e) => void handleTeamTimeslotChange(team, e.target.value)}
                        className="input px-2.5 text-[13px]"
                      >
                        <option value="">Not chosen</option>
                        {timeslots.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {formatSlot(slot.startsAt)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    {isIracing && (
                      <FormField label="iRacing team" className="col-span-full">
                        <select
                          value={team.iracingTeamId ?? ''}
                          onChange={(e) => void handleTeamIracingLinkChange(team, e.target.value)}
                          className="input px-2.5 text-[13px]"
                        >
                          <option value="">No link</option>
                          {iracingTeams.map((t) => (
                            <option key={t.teamId} value={t.teamId}>
                              {t.teamName}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    )}
                  </div>
                )}

                <div className="flex flex-col">
                  <span className="lbl pb-1.5">Drivers</span>
                  {members.length === 0 && guests.length === 0 ? (
                    <span className="border-t border-ds-line py-2.5 text-[13px] text-ds-dim">
                      {isAdmin ? 'No drivers yet. Add from the list on the left.' : 'No drivers assigned yet.'}
                    </span>
                  ) : (
                    <ul className="m-0 flex list-none flex-col p-0">
                      {members.map((signup) => {
                        const status = team.iracingTeamId !== null ? rosterStatus(signup.userId, team.iracingTeamId) : null;
                        const name = driverNames[signup.userId] ?? 'Unknown driver';
                        const driverClass = signupClass(signup);
                        return (
                          <li key={signup.id} className="flex items-center gap-2.5 border-t border-ds-line py-2">
                            <span
                              aria-hidden="true"
                              className={`cut-xs flex h-8 w-8 shrink-0 items-center justify-center text-[13px] num ${avatarClass(signup.userId)}`}
                            >
                              {initials(name)}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-bold">{name}</span>
                              {driverClass && <span className="truncate text-xs text-ds-muted">{driverClass}</span>}
                            </span>
                            <span className="chip chip-sm">Signed up</span>
                            {isAdmin && status && (
                              <span
                                className={`chip chip-sm ${
                                  status === 'on' ? 'chip-accent' : status === 'off' ? 'chip-warn' : 'chip-muted'
                                }`}
                              >
                                {status === 'on' ? 'On roster' : status === 'off' ? 'Not on roster' : 'No link'}
                              </span>
                            )}
                            {isAdmin && (
                              <RemoveButton
                                label={`Remove ${name} from ${team.name}`}
                                disabled={busy}
                                onClick={() => void handleAssign(signup.id, null)}
                              />
                            )}
                          </li>
                        );
                      })}
                      {guests.map((guest) => {
                        const name =
                          rosterGuests.find((g) => g.profileId === guest.driverProfileId)?.name ?? guest.name;
                        return (
                          <li key={guest.id} className="flex items-center gap-2.5 border-t border-ds-line py-2">
                            <span
                              aria-hidden="true"
                              className={`cut-xs flex h-8 w-8 shrink-0 items-center justify-center text-[13px] num ${avatarClass(null)}`}
                            >
                              {initials(name)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-bold">{name}</span>
                            <span className="chip chip-sm">{guest.driverProfileId ? 'Guest' : 'Dummy'}</span>
                            {isAdmin && (
                              <RemoveButton
                                label={`Remove ${name} from ${team.name}`}
                                disabled={busy}
                                onClick={() => void handleRemoveGuest(team.id, guest.id)}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {isAdmin && (unassigned.length > 0 || notSignedUp.length > 0 || availableGuests.length > 0) && (
                    <select
                      value=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        // "new:<userId>" = a member who hasn't signed up; anything else is an
                        // existing unassigned signup's id.
                        if (value.startsWith('new:')) void handleAddMember(value.slice(4), team.id);
                        else if (value.startsWith('guest:')) void handleAddGuest(value.slice(6), team.id);
                        else void handleAssign(value, team.id);
                      }}
                      disabled={busy}
                      aria-label={`Add driver to ${team.name}`}
                      className="input mt-2 w-full self-start text-xs sm:w-64"
                    >
                      <option value="">+ Add driver...</option>
                      {unassigned.length > 0 && (
                        <optgroup label="Signed up">
                          {unassigned.map((signup) => (
                            <option key={signup.id} value={signup.id}>
                              {driverNames[signup.userId] ?? 'Unknown driver'}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {notSignedUp.length > 0 && (
                        <optgroup label="Not signed up">
                          {notSignedUp.map((m) => (
                            <option key={m.userId} value={`new:${m.userId}`}>
                              {m.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {availableGuests.length > 0 && (
                        <optgroup label="Guest drivers (no account)">
                          {availableGuests.map((g) => (
                            <option key={g.profileId} value={`guest:${g.profileId}`}>
                              {g.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  )}

                  {isAdmin &&
                    (guestFormTeamId === team.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleAddNamedGuest(team.id);
                        }}
                        className="mt-2 flex flex-wrap gap-2"
                      >
                        <label htmlFor={`guest-name-${team.id}`} className="sr-only">
                          Guest driver name for {team.name}
                        </label>
                        <input
                          id={`guest-name-${team.id}`}
                          autoFocus
                          type="text"
                          placeholder="Guest driver name"
                          maxLength={60}
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setGuestFormTeamId(null);
                              setGuestName('');
                            }
                          }}
                          className="input min-w-0 flex-[1_1_160px]"
                        />
                        <button
                          type="submit"
                          disabled={busy || guestName.trim() === ''}
                          className="btn-secondary btn-sm"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGuestFormTeamId(null);
                            setGuestName('');
                          }}
                          className="btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setGuestFormTeamId(team.id);
                          setGuestName('');
                        }}
                        disabled={busy}
                        className="cut-sm mt-2 min-h-9 self-start border-0 bg-ds-raised px-3.5 text-xs font-bold uppercase text-ds-ink-soft hover:bg-ds-control-hover disabled:opacity-40"
                      >
                        + Guest driver (no account)
                      </button>
                    ))}
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ds-line pt-3.5">
                    <button
                      type="button"
                      onClick={() => void handleDeleteTeam(team)}
                      disabled={busy}
                      className="btn-danger min-h-10 px-4 text-[13px]"
                    >
                      Delete team
                    </button>
                    <Link to={`/events/${eventId}/teams/${team.id}/plan`} className="btn-primary px-5">
                      Plan stints
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="square"
                        aria-hidden="true"
                      >
                        <path d="M5 12h13M13 6l6 6-6 6" />
                      </svg>
                    </Link>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="cut-xs inline-flex h-9 w-9 shrink-0 items-center justify-center border-0 bg-transparent text-ds-muted transition-colors hover:bg-ds-control-hover hover:text-ds-ink disabled:opacity-40"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function FormField({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="lbl text-xs">{label}</span>
      {children}
    </label>
  );
}
