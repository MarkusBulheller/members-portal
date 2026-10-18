import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EventTeamsPanel from '../../components/EventTeamsPanel';
import HourlyAvailabilityGrid, { type AvailabilityGridRow } from '../../components/HourlyAvailabilityGrid';
import Modal from '../../components/Modal';
import SignupForm from '../../components/SignupForm';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { carsApi } from '../../lib/api/cars';
import { driversApi } from '../../lib/api/drivers';
import { eventsApi } from '../../lib/api/events';
import { eventTeamsApi } from '../../lib/api/eventTeams';
import { iracingTeamsApi } from '../../lib/api/iracingTeams';
import { formatClock, formatDayShort, formatSlot } from '../../lib/eventFormatting';
import { formValuesToSignupInput, signupToFormValues, type SignupFormValues } from '../../lib/signupFormValues';
import type { Car } from '../../types/car';
import type { EventSignup, EventTimeslot, RaceEventDetail } from '../../types/event';
import type { EventTeam } from '../../types/eventTeam';
import type { IracingTeam } from '../../types/iracingTeam';
import { formatRaceLength } from '../../types/raceLength';

/** Team colours for the availability grid: the board's accent for the first team, slate for the
 * second, then a stable run of distinct hues for any further teams (by team order). */
const TEAM_GRID_COLORS = [
  'var(--color-w2w-red)',
  '#64748b',
  '#0891b2',
  '#d97706',
  '#7c3aed',
  '#059669',
  '#db2777',
  '#65a30d',
];

/** "13:00 start" tab label; adds the day only when two start times share a clock time. */
function slotTabLabel(slot: EventTimeslot, all: EventTimeslot[]): string {
  const time = formatClock(slot.startsAt);
  const clash = all.some((other) => other.id !== slot.id && formatClock(other.startsAt) === time);
  return clash ? `${formatDayShort(slot.startsAt)} · ${time} start` : `${time} start`;
}

/** Admin-only workspace reached from EventDetailPage's "Close Signups"/"Team Building" button —
 * shows a read-only recap of who signed up (and their hourly stint availability) alongside the
 * team-splitting tool, so the admin doesn't have to flip between the event page and this one
 * while building crews. */
export default function EventTeamBuildingPage() {
  const { id } = useParams<{ id: string }>();
  // Keyed by route id: moving from one event to another remounts, so nothing from the previous
  // event (state, in-flight responses) can show up on the next one.
  return <EventTeamBuilding key={id} id={id} />;
}

function EventTeamBuilding({ id }: { id: string | undefined }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [event, setEvent] = useState<RaceEventDetail | null>(null);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [driverIracingCustIds, setDriverIracingCustIds] = useState<Record<string, string | null>>({});
  const [rosterMembers, setRosterMembers] = useState<{ userId: string; name: string }[]>([]);
  const [rosterGuests, setRosterGuests] = useState<{ profileId: string; name: string }[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [teams, setTeams] = useState<EventTeam[]>([]);
  const [iracingTeams, setIracingTeams] = useState<IracingTeam[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The signup being edited in the modal on a driver's behalf. */
  const [adminEditing, setAdminEditing] = useState<EventSignup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Freshly created team whose name input should be focused once it renders. */
  const [focusTeamId, setFocusTeamId] = useState<string | null>(null);
  /** Start time whose availability grid is shown (null = the event's first one). */
  const [tabSlotId, setTabSlotId] = useState<string | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);
  /** Latest event, readable from async handlers (rapid availability toggles build on each other). */
  const eventRef = useRef<RaceEventDetail | null>(null);
  /** Latest-request tokens: only the newest load()/loadTeams() response is applied. */
  const eventSeq = useRef(0);
  const teamsSeq = useRef(0);

  const applyEvent = useCallback((next: RaceEventDetail | null) => {
    eventRef.current = next;
    setEvent(next);
  }, []);

  const load = useCallback(() => {
    if (!id) return;
    const seq = ++eventSeq.current;
    eventsApi
      .getById(id)
      .then((loaded) => {
        if (eventSeq.current !== seq) return;
        applyEvent(loaded);
        setLoadFailed(false);
      })
      .catch(() => {
        if (eventSeq.current === seq) setLoadFailed(true);
      });
  }, [id, applyEvent]);

  const loadTeams = useCallback(() => {
    if (!id) return;
    const seq = ++teamsSeq.current;
    eventTeamsApi
      .list(id)
      .then((list) => {
        if (teamsSeq.current === seq) setTeams(list);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    load();
    const seqRef = eventSeq;
    return () => {
      seqRef.current++;
    };
  }, [load]);
  useEffect(() => {
    loadTeams();
    const seqRef = teamsSeq;
    return () => {
      seqRef.current++;
    };
  }, [loadTeams]);

  useEffect(() => {
    let cancelled = false;
    driversApi.list().then((drivers) => {
      if (cancelled) return;
      setDriverNames(Object.fromEntries(drivers.map((d) => [d.userId, d.iracingName ?? d.displayName])));
      setDriverIracingCustIds(Object.fromEntries(drivers.map((d) => [d.userId, d.iracingCustomerId])));
      // Only drivers with a portal account can be signed up; guest drivers (no userId) can't.
      setRosterMembers(
        drivers
          .filter((d): d is typeof d & { userId: string } => d.userId !== null)
          .map((d) => ({ userId: d.userId, name: d.iracingName ?? d.displayName }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setRosterGuests(
        drivers
          .filter((d) => d.userId === null)
          .map((d) => ({ profileId: d.id, name: d.iracingName ?? d.displayName }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    }).catch(() => {});
    carsApi
      .list()
      .then((list) => {
        if (!cancelled) setCars(list);
      })
      .catch(() => {});
    iracingTeamsApi
      .list()
      .then((list) => {
        if (!cancelled) setIracingTeams(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSignups = useMemo(() => event?.signups.filter((s) => s.status !== 'CANCELLED') ?? [], [event]);
  const carNames = useMemo(() => Object.fromEntries(cars.map((c) => [c.id, c.name])), [cars]);

  /** Grid cell colour for a driver: their team's colour; drivers not on a team use the first-team
   * accent, as the board does. */
  const availabilityColor = useMemo(() => {
    const signupTeamId = new Map(activeSignups.map((sg) => [sg.id, sg.eventTeamId]));
    return (row: AvailabilityGridRow): string => {
      const teamIndex = teams.findIndex((t) => t.id === signupTeamId.get(row.id));
      return TEAM_GRID_COLORS[teamIndex < 0 ? 0 : teamIndex % TEAM_GRID_COLORS.length];
    };
  }, [activeSignups, teams]);

  /** Per-row promise chain: availability PATCHes for the same signup run one after another, each
   * sending the latest local state, so rapid clicks can't clobber each other or arrive out of order. */
  const toggleQueues = useRef(new Map<string, Promise<void>>());

  /** Quick hour toggle straight from the availability grid — same admin endpoint as the full
   * editor, but only touches the one signup's availableHours. The change is applied locally right
   * away (no refetch of the whole event); only a failure falls back to reloading it. */
  const handleToggleHour = useCallback(
    (row: AvailabilityGridRow, hourIso: string) => {
      if (!id) return;
      const current = eventRef.current;
      const signup = current?.signups.find((sg) => sg.id === row.id);
      if (!current || !signup) return;
      const next = signup.availableHours.includes(hourIso)
        ? signup.availableHours.filter((h) => h !== hourIso)
        : [...signup.availableHours, hourIso];
      applyEvent({
        ...current,
        signups: current.signups.map((sg) => (sg.id === row.id ? { ...sg, availableHours: next } : sg)),
      });
      setError(null);

      const queues = toggleQueues.current;
      const run = (queues.get(row.id) ?? Promise.resolve()).then(async () => {
        // Send whatever the row holds by the time this request's turn comes.
        const latest = eventRef.current?.signups.find((sg) => sg.id === row.id)?.availableHours ?? next;
        try {
          await eventsApi.updateSignupDetails(id, row.id, { availableHours: latest });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Failed to update availability');
          load();
        }
      });
      queues.set(row.id, run);
      void run.then(() => {
        if (queues.get(row.id) === run) queues.delete(row.id);
      });
    },
    [id, applyEvent, load],
  );

  async function handleReopenSignups() {
    if (!id) return;
    const ok = await confirm(
      'Reopen signups for this event? New drivers will be able to sign up again (drivers already signed up can edit their availability either way).',
      { confirmLabel: 'Reopen Signups' },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await eventsApi.update(id, { status: 'PUBLISHED' });
      navigate(`/events/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reopen signups');
      setBusy(false);
    }
  }

  /** One-click team creation: the next free "Team N" name, then the new team's name input takes
   * focus so the admin can rename it straight away. */
  async function handleQuickAddTeam() {
    if (!id) return;
    const taken = new Set(teams.map((t) => t.name.trim().toLowerCase()));
    let n = teams.length + 1;
    while (taken.has(`team ${n}`)) n += 1;
    setBusy(true);
    setError(null);
    try {
      const created = await eventTeamsApi.create(id, { name: `Team ${n}` });
      const refreshed = await eventTeamsApi.list(id);
      setTeams(refreshed);
      setFocusTeamId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create team');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminSubmit(signup: EventSignup, values: SignupFormValues) {
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      await eventsApi.updateSignupDetails(id, signup.id, formValuesToSignupInput(values));
      load();
      setAdminEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save signup');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteSignup(signupId: string) {
    if (!id) return;
    if (!(await confirm('Delete this signup? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    setBusy(true);
    setError(null);
    try {
      await eventsApi.deleteSignup(id, signupId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete signup');
    } finally {
      setBusy(false);
    }
  }

  if (!event) {
    return (
      <p className="text-ds-muted text-sm">
        {loadFailed ? 'Couldn’t load this event. Try reloading the page.' : 'Loading...'}
      </p>
    );
  }

  const statusNote = event.status === 'SIGNUPS_CLOSED' ? 'Team building, signups closed' : 'Team building';
  const activeSlot = event.timeslots.find((slot) => slot.id === tabSlotId) ?? event.timeslots[0];
  const timeslotsForTabs = event.timeslots;
  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, slotId: string) {
    const slots = timeslotsForTabs;
    const index = slots.findIndex((slot) => slot.id === slotId);
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % slots.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + slots.length) % slots.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = slots.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = slots[next];
    if (!target) return;
    setTabSlotId(target.id);
    document.getElementById(`tb-av-tab-${target.id}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[13px] text-ds-muted">
        <Link to="/events" className="text-ds-muted hover:text-ds-ink">
          Events
        </Link>
        <ChevronRight />
        <Link to={`/events/${event.id}`} className="text-ds-muted hover:text-ds-ink">
          {event.title}
        </Link>
        <ChevronRight />
        <span className="text-ds-ink">Team building</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">{event.title}</h1>
          <span className="text-sm text-ds-muted">
            {statusNote} · {event.track.name} · {event.carClasses.join(' / ')} ·{' '}
            {formatRaceLength(event.raceLengthMinutes)} · {activeSignups.length}{' '}
            {activeSignups.length === 1 ? 'driver' : 'drivers'} signed up
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.status === 'SIGNUPS_CLOSED' && (
            <button onClick={() => void handleReopenSignups()} disabled={busy} className="btn-secondary px-5">
              Reopen signups
            </button>
          )}
          <button type="button" onClick={() => void handleQuickAddTeam()} disabled={busy} className="btn-primary">
            + Add team
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {error}
        </p>
      )}

      <EventTeamsPanel
        eventId={event.id}
        isAdmin
        teams={teams}
        cars={cars}
        timeslots={event.timeslots}
        iracingTeams={iracingTeams}
        driverNames={driverNames}
        driverIracingCustIds={driverIracingCustIds}
        signups={activeSignups}
        isIracing={event.sim === 'IRACING'}
        rosterMembers={rosterMembers}
        rosterGuests={rosterGuests}
        focusTeamId={focusTeamId}
        onFocusHandled={() => setFocusTeamId(null)}
        onChange={() => {
          load();
          loadTeams();
        }}
      />

      <section aria-labelledby="hav" className="cut flex flex-col gap-4 bg-ds-panel px-6 py-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="hav" className="h2">
              Hourly availability{activeSlot ? ` · ${slotTabLabel(activeSlot, event.timeslots)}` : ''}
            </h2>
            <span className="text-[13px] text-ds-muted">
              Use this to balance crews so every hour has someone fresh. Click a cell to change a driver's availability.
            </span>
          </div>
          {event.timeslots.length > 1 && (
            <div role="tablist" aria-label="Start time" className="seg seg-field">
              {event.timeslots.map((slot) => {
                const selected = slot.id === activeSlot?.id;
                return (
                  <button
                    key={slot.id}
                    id={`tb-av-tab-${slot.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="tb-av-panel"
                    tabIndex={selected ? 0 : -1}
                    title={formatSlot(slot.startsAt)}
                    onClick={() => setTabSlotId(slot.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, slot.id)}
                    className={
                      selected ? 'bg-ds-control px-3.5 text-ds-ink shadow-[inset_0_-2px_0_var(--color-w2w-red)]' : 'px-3.5'
                    }
                  >
                    {slotTabLabel(slot, event.timeslots)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div
          id="tb-av-panel"
          role={event.timeslots.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={event.timeslots.length > 1 && activeSlot ? `tb-av-tab-${activeSlot.id}` : undefined}
        >
          <HourlyAvailabilityGrid
            timeslots={event.timeslots}
            raceLengthMinutes={event.raceLengthMinutes}
            signups={activeSignups}
            driverNames={driverNames}
            onToggleHour={handleToggleHour}
            emptyLabel="No one flagged this start time."
            activeSlotId={activeSlot?.id}
            rowColor={availabilityColor}
            hideEmptyRows
            compact
          />
        </div>
      </section>

      <section aria-labelledby="signed-up" className="cut bg-ds-panel pb-1.5 pt-5">
        <div className="flex items-center justify-between gap-2 px-5 pb-3">
          <h2 id="signed-up" className="h2">
            Signed up
          </h2>
          <span className="chip chip-sm num">{activeSignups.length}</span>
        </div>
        {activeSignups.length === 0 ? (
          <p className="m-0 border-t border-ds-line px-5 py-4 text-ds-muted">No one signed up for this event.</p>
        ) : (
          <div>
            {activeSignups.map((signup) => (
              <div
                key={signup.id}
                className="row-hover flex flex-col gap-2 border-t border-ds-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="font-bold">{driverNames[signup.userId] ?? 'Unknown driver'}</span>
                  {signup.carClass && (
                    <span className="ml-2 text-xs text-ds-muted">
                      {signup.carClass}
                      {signup.secondaryCarClass ? ` (or ${signup.secondaryCarClass})` : ''}
                      {signup.carId && carNames[signup.carId] ? ` · ${carNames[signup.carId]}` : ''}
                    </span>
                  )}
                  <p className="m-0 mt-0.5 text-xs text-ds-muted">
                    {signup.timeslots.length === 0
                      ? 'No availability picked'
                      : signup.timeslots.map((t) => formatSlot(t.startsAt)).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <span className={`chip chip-sm ${signup.status === 'CONFIRMED' ? 'chip-accent' : ''}`}>
                    {signup.status}
                  </span>
                  <button
                    onClick={() => {
                      setError(null);
                      setAdminEditing(signup);
                    }}
                    className="btn-secondary btn-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleDeleteSignup(signup.id)}
                    disabled={busy}
                    className="btn-danger btn-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {adminEditing && (
        <Modal
          title={`Edit ${driverNames[adminEditing.userId] ?? 'driver'}'s signup`}
          onClose={() => setAdminEditing(null)}
        >
          {error && (
            <p role="alert" className="mb-3 text-sm text-ds-danger">
              {error}
            </p>
          )}
          <SignupForm
            event={event}
            cars={cars}
            initial={signupToFormValues(adminEditing)}
            submitLabel="Save Changes"
            submitting={submitting}
            driverLabel={driverNames[adminEditing.userId] ?? 'Driver'}
            onSubmit={(values) => void handleAdminSubmit(adminEditing, values)}
            onDiscard={() => setAdminEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
