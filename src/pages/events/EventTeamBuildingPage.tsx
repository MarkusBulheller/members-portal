import { useEffect, useState } from 'react';
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
import { formatSlot, SIGNUP_STATUS_STYLES } from '../../lib/eventFormatting';
import { formValuesToSignupInput, signupToFormValues, type SignupFormValues } from '../../lib/signupFormValues';
import type { Car } from '../../types/car';
import { SIM_LABELS, type EventSignup, type RaceEventDetail } from '../../types/event';
import type { EventTeam } from '../../types/eventTeam';
import type { IracingTeam } from '../../types/iracingTeam';
import { formatRaceLength } from '../../types/raceLength';

/** Admin-only workspace reached from EventDetailPage's "Close Signups"/"Team Building" button —
 * shows a read-only recap of who signed up (and their hourly stint availability) alongside the
 * team-splitting tool, so the admin doesn't have to flip between the event page and this one
 * while building crews. */
export default function EventTeamBuildingPage() {
  const { id } = useParams<{ id: string }>();
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

  const load = () => {
    if (id) void eventsApi.getById(id).then(setEvent);
  };

  const loadTeams = () => {
    if (id) void eventTeamsApi.list(id).then(setTeams);
  };

  useEffect(load, [id]);
  useEffect(loadTeams, [id]);

  useEffect(() => {
    void driversApi.list().then((drivers) => {
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
    });
    void carsApi.list().then(setCars);
    void iracingTeamsApi.list().then(setIracingTeams);
  }, []);

  const activeSignups = event?.signups.filter((s) => s.status !== 'CANCELLED') ?? [];
  const carNames = Object.fromEntries(cars.map((c) => [c.id, c.name]));

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

  /** Quick hour toggle straight from the availability grid — same admin endpoint as the full
   * editor, but only touches the one signup's availableHours. */
  async function handleToggleHour(row: AvailabilityGridRow, hourIso: string) {
    if (!id) return;
    const next = row.availableHours.includes(hourIso)
      ? row.availableHours.filter((h) => h !== hourIso)
      : [...row.availableHours, hourIso];
    setBusy(true);
    setError(null);
    try {
      await eventsApi.updateSignupDetails(id, row.id, { availableHours: next });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update availability');
    } finally {
      setBusy(false);
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
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  return (
    <div>
      <Link to={`/events/${event.id}`} className="text-xs text-white/65 hover:text-white">
        ← Back to event
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Team Building</p>
          <h1 className="font-display font-black text-2xl uppercase text-w2w-white">{event.title}</h1>
          <p className="text-white/65 text-sm mt-1">
            {SIM_LABELS[event.sim]} · {event.track.name} · {event.carClasses.join(' / ')} ·{' '}
            {formatRaceLength(event.raceLengthMinutes)}
          </p>
        </div>
        {event.status === 'SIGNUPS_CLOSED' && (
          <button
            onClick={() => void handleReopenSignups()}
            disabled={busy}
            className="shrink-0 px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
          >
            Reopen Signups
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-w2w-red text-sm">
          {error}
        </p>
      )}

      <h2 className="mt-8 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">
        Signed Up ({activeSignups.length})
      </h2>
      {activeSignups.length === 0 ? (
        <p className="text-white/65 text-sm">No one signed up for this event.</p>
      ) : (
        <div className="space-y-2">
          {activeSignups.map((signup) => (
            <div
              key={signup.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-w2w-charcoal border border-white/10 px-5 py-3"
            >
              <div>
                <span className="text-white/70 text-sm">{driverNames[signup.userId] ?? 'Unknown driver'}</span>
                {signup.carClass && (
                  <span className="text-white/65 text-[11px] ml-2">
                    {signup.carClass}
                    {signup.secondaryCarClass ? ` (or ${signup.secondaryCarClass})` : ''}
                    {signup.carId && carNames[signup.carId] ? ` · ${carNames[signup.carId]}` : ''}
                  </span>
                )}
                <p className="text-white/65 text-[11px] mt-0.5">
                  {signup.timeslots.length === 0
                    ? 'No availability picked'
                    : signup.timeslots.map((t) => formatSlot(t.startsAt)).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
                <span
                  className={`px-2.5 py-1 text-[11px] font-heading uppercase tracking-wide ${SIGNUP_STATUS_STYLES[signup.status]}`}
                >
                  {signup.status}
                </span>
                <button
                  onClick={() => {
                    setError(null);
                    setAdminEditing(signup);
                  }}
                  className="text-white/65 hover:text-white text-[11px] font-heading uppercase tracking-wide transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleDeleteSignup(signup.id)}
                  disabled={busy}
                  className="text-white/65 hover:text-w2w-red text-[11px] font-heading uppercase tracking-wide transition-colors disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-3">
        Hourly Driving Availability
      </h2>
      <p className="text-white/65 text-xs mb-3">
        Who can take a stint, hour by hour, for each start time. Click a cell to change a driver's availability.
      </p>
      <HourlyAvailabilityGrid
        timeslots={event.timeslots}
        raceLengthMinutes={event.raceLengthMinutes}
        signups={activeSignups}
        driverNames={driverNames}
        onToggleHour={(row, hourIso) => void handleToggleHour(row, hourIso)}
        emptyLabel="No one flagged this start time."
      />

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-3">Teams</h2>
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
        onChange={() => {
          load();
          loadTeams();
        }}
      />

      {adminEditing && (
        <Modal
          title={`Edit ${driverNames[adminEditing.userId] ?? 'driver'}'s signup`}
          onClose={() => setAdminEditing(null)}
        >
          {error && (
            <p role="alert" className="mb-3 text-w2w-red text-sm">
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
