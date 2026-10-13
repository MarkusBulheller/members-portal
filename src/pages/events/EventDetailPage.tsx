import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EventWeatherForecast from '../../components/EventWeatherForecast';
import Modal from '../../components/Modal';
import SignupForm from '../../components/SignupForm';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { carsApi } from '../../lib/api/cars';
import { driversApi } from '../../lib/api/drivers';
import { eventsApi } from '../../lib/api/events';
import { formatHour, formatSlot, hoursForSlot, SIGNUP_STATUS_STYLES } from '../../lib/eventFormatting';
import {
  EMPTY_SIGNUP_VALUES,
  formValuesToSignupInput,
  signupToFormValues,
  type SignupFormValues,
} from '../../lib/signupFormValues';
import type { Car } from '../../types/car';
import { SIM_LABELS, type EventSignup, type RaceEventDetail } from '../../types/event';
import { formatRaceLength } from '../../types/raceLength';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [event, setEvent] = useState<RaceEventDetail | null>(null);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [cars, setCars] = useState<Car[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Screen-reader-only confirmation for each save — visually silent (sr-only), so sighted users
   * still rely on the toggle's own state change, but keyboard/AT users otherwise get zero
   * feedback that a click actually saved. */
  const [liveMessage, setLiveMessage] = useState('');

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** The signup an admin is currently editing on someone else's behalf (modal open when set). */
  const [adminEditing, setAdminEditing] = useState<EventSignup | null>(null);

  const load = () => {
    if (id) void eventsApi.getById(id).then(setEvent);
  };

  useEffect(load, [id]);

  useEffect(() => {
    void driversApi.list().then((drivers) => {
      setDriverNames(Object.fromEntries(drivers.map((d) => [d.userId, d.iracingName ?? d.displayName])));
    });
    void carsApi.list().then(setCars);
  }, []);

  const mySignup = event?.signups.find((s) => s.userId === user?.id && s.status !== 'CANCELLED');
  const activeSignups = event?.signups.filter((s) => s.status !== 'CANCELLED') ?? [];
  const carNames = Object.fromEntries(cars.map((c) => [c.id, c.name]));
  // While signups are open anyone can sign up or edit; once they close (team building), only a
  // driver who's already in can keep adjusting their own availability — matches the backend rule
  // in EventsService.signup().
  const isOpenForSignups = event?.status === 'PUBLISHED';
  const canEditOwnSignup = isOpenForSignups || (event?.status === 'SIGNUPS_CLOSED' && !!mySignup);
  const showSignupForm = mySignup ? editing && canEditOwnSignup : isOpenForSignups;

  function startEdit() {
    setError(null);
    setEditing(true);
  }

  function handleDiscardEdit() {
    setEditing(false);
    setError(null);
  }

  async function handleSubmitSignup(values: SignupFormValues) {
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      await eventsApi.signup(id, formValuesToSignupInput(values));
      load();
      setEditing(false);
      setLiveMessage(mySignup ? 'Signup updated.' : "You're signed up.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save signup');
    } finally {
      setSubmitting(false);
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
      setLiveMessage(`${driverNames[signup.userId] ?? 'Driver'}'s signup updated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save signup');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!id) return;
    const ok = await confirm(
      'Cancel your signup for this event? This clears your timeslot picks, car choice, and hourly availability.',
      { confirmLabel: 'Cancel Signup' },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await eventsApi.cancelSignup(id);
      load();
      setLiveMessage('Signup cancelled.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel signup');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!(await confirm('Delete this event? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
    await eventsApi.remove(id);
    navigate('/events');
  }

  async function handleCloseSignups() {
    if (!id) return;
    const ok = await confirm(
      "Close signups for this event? Drivers won't be able to change their availability anymore, and you'll move on to building teams.",
      { confirmLabel: 'Close Signups' },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await eventsApi.update(id, { status: 'SIGNUPS_CLOSED' });
      navigate(`/events/${id}/teams`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to close signups');
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
      <Link to="/events" className="text-xs text-white/65 hover:text-white">
        ← Back to schedule
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">{event.title}</h1>
          <p className="text-white/65 text-sm mt-1">
            {SIM_LABELS[event.sim]} · {event.track.name} · {event.carClasses.join(' / ')} ·{' '}
            {formatRaceLength(event.raceLengthMinutes)}
          </p>
          <p className="text-white/65 text-sm">
            {new Date(event.startsAt).toLocaleString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
        {user?.role === 'ADMIN' && (
          <div className="flex gap-2 flex-wrap">
            {event.status === 'PUBLISHED' && (
              <button
                onClick={() => void handleCloseSignups()}
                disabled={busy}
                className="px-4 py-2 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading text-xs uppercase tracking-wide transition-colors"
              >
                Close Signups
              </button>
            )}
            {(event.status === 'SIGNUPS_CLOSED' || event.status === 'COMPLETED') && (
              <Link
                to={`/events/${event.id}/teams`}
                className="px-4 py-2 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading text-xs uppercase tracking-wide transition-colors"
              >
                Team Building
              </Link>
            )}
            <Link
              to={`/events/${event.id}/edit`}
              className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors"
            >
              Edit
            </Link>
            <button
              onClick={() => void handleDelete()}
              className="px-4 py-2 border border-w2w-red/40 text-w2w-red hover:bg-w2w-red/10 font-heading text-xs uppercase tracking-wide transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {event.description && <p className="mt-6 text-white/60 text-sm leading-relaxed max-w-2xl">{event.description}</p>}

      {event.iracingSeasonId !== null && event.iracingRaceWeekNum !== null && (
        <div className="mt-6">
          <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-3">Weather Forecast</h2>
          <EventWeatherForecast seasonId={event.iracingSeasonId} raceWeekNum={event.iracingRaceWeekNum} />
        </div>
      )}

      <div aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </div>

      {event.status === 'SIGNUPS_CLOSED' ? (
        <p className="mt-4 text-white/65 text-xs bg-white/5 px-3 py-2 border border-white/10">
          Signups are closed.{' '}
          {mySignup
            ? 'You can still edit your signup to update your availability.'
            : 'Only drivers who were already signed up can still change their availability.'}
        </p>
      ) : (
        event.status !== 'PUBLISHED' && (
          <p className="mt-4 text-white/65 text-xs bg-white/5 px-3 py-2 border border-white/10">
            Signups aren't open — this event is {event.status.toLowerCase().replace('_', ' ')}.
          </p>
        )
      )}

      {mySignup && !editing && (
        <div className="mt-8">
          <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-3">Your Signup</h2>
          <div className="bg-w2w-charcoal border border-white/10 p-5">
            <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-2">Start Time(s)</p>
            {mySignup.timeslots.length === 0 ? (
              <p className="text-white/65 text-sm">None picked yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mySignup.timeslots.map((t) => (
                  <span
                    key={t.id}
                    className="px-3 py-1.5 bg-w2w-red/15 text-w2w-red font-heading text-xs uppercase tracking-wide"
                  >
                    {formatSlot(t.startsAt)}
                  </span>
                ))}
              </div>
            )}

            {(mySignup.carClass || mySignup.carId) && (
              <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-x-8 gap-y-3">
                {mySignup.carClass && (
                  <div>
                    <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-1">Car Class</p>
                    <p className="text-white text-sm">
                      {mySignup.carClass}
                      {mySignup.secondaryCarClass ? ` (or ${mySignup.secondaryCarClass})` : ''}
                    </p>
                  </div>
                )}
                {mySignup.carId && (
                  <div>
                    <p className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-1">Favourite Car</p>
                    <p className="text-white text-sm">{carNames[mySignup.carId] ?? '—'}</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={startEdit}
                disabled={!canEditOwnSignup}
                className="px-4 py-2 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-40 text-on-accent font-heading font-bold text-xs uppercase tracking-wide transition-colors clip-corner"
              >
                Edit
              </button>
              <button
                onClick={() => void handleCancel()}
                disabled={busy || event.status !== 'PUBLISHED'}
                className="px-4 py-2 border border-w2w-red/40 text-w2w-red hover:bg-w2w-red/10 disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
              >
                Cancel Signup Entirely
              </button>
            </div>
          </div>
        </div>
      )}

      {showSignupForm && (
        <div className="mt-8">
          <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-3">
            {mySignup ? 'Edit Your Signup' : 'Sign Up'}
          </h2>
          <SignupForm
            event={event}
            cars={cars}
            initial={mySignup ? signupToFormValues(mySignup) : EMPTY_SIGNUP_VALUES}
            submitLabel={mySignup ? 'Save Changes' : 'Submit Signup'}
            submitting={submitting}
            onSubmit={(values) => void handleSubmitSignup(values)}
            onDiscard={mySignup ? handleDiscardEdit : undefined}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-w2w-red text-sm">
          {error}
        </p>
      )}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-3">
        Hourly Driving Availability
      </h2>
      <p className="text-white/65 text-xs mb-3">
        Who can take a stint, hour by hour, for each start time. Edit your signup above to change your own hours.
      </p>
      {event.timeslots.map((slot) => {
        const rows = activeSignups.filter((s) => s.timeslots.some((t) => t.id === slot.id));
        const hours = hoursForSlot(slot.startsAt, event.raceLengthMinutes);
        return (
          <div key={slot.id} className="mb-6">
            <h3 className="text-white/65 text-xs font-heading uppercase tracking-wide mb-2">
              {formatSlot(slot.startsAt)}
            </h3>
            {rows.length === 0 ? (
              <p className="text-white/65 text-xs">No one has flagged this start time yet.</p>
            ) : (
              <div className="overflow-x-auto border border-white/10">
                <table className="border-collapse text-sm">
                  <caption className="sr-only">
                    Hourly stint availability for the {formatSlot(slot.startsAt)} start option
                  </caption>
                  <thead>
                    <tr className="border-b border-white/10">
                      <th
                        scope="col"
                        className="sticky left-0 bg-w2w-charcoal py-2 px-3 text-left font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase"
                      >
                        Driver
                      </th>
                      {hours.map((hourIso) => (
                        <th
                          key={hourIso}
                          scope="col"
                          className="py-2 px-1 text-center font-heading text-[10px] tracking-wide text-white/65 uppercase whitespace-nowrap"
                        >
                          {formatHour(hourIso)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((signup) => {
                      const isMine = signup.userId === user?.id;
                      return (
                        <tr key={signup.id} className="border-b border-white/5">
                          <th
                            scope="row"
                            className={`sticky left-0 bg-w2w-charcoal py-1.5 px-3 text-left font-normal whitespace-nowrap ${
                              isMine ? 'text-white' : 'text-white/70'
                            }`}
                          >
                            {driverNames[signup.userId] ?? 'Unknown driver'}
                            {isMine ? ' (you)' : ''}
                          </th>
                          {hours.map((hourIso) => {
                            const available = signup.availableHours.includes(hourIso);
                            // Every row here is a read-only display — rendered as plain divs, not
                            // buttons, since editing your own hours now happens through the
                            // signup form above, not this shared reference table.
                            return (
                              <td key={hourIso} className="p-0.5">
                                <div className={`w-7 h-7 ${available ? 'bg-w2w-red' : 'bg-white/5'}`}>
                                  <span className="sr-only">{available ? 'Available' : 'Unavailable'}</span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <h2 className="mt-10 font-heading text-xs tracking-[0.25em] text-white/65 uppercase mb-4">
        Signups ({activeSignups.length})
      </h2>
      {activeSignups.length === 0 ? (
        <p className="text-white/65 text-sm">No one has signed up yet.</p>
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
                    ? 'No availability picked yet'
                    : signup.timeslots.map((t) => formatSlot(t.startsAt)).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
                <span className={`px-2.5 py-1 text-[11px] font-heading uppercase tracking-wide ${SIGNUP_STATUS_STYLES[signup.status]}`}>
                  {signup.status}
                </span>
                {user?.role === 'ADMIN' && (
                  <>
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
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
