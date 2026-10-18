import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EventWeatherForecast from '../../components/EventWeatherForecast';
import HourlyAvailabilityGrid from '../../components/HourlyAvailabilityGrid';
import Modal from '../../components/Modal';
import SignupForm from '../../components/SignupForm';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { carsApi } from '../../lib/api/cars';
import { driversApi } from '../../lib/api/drivers';
import { eventsApi } from '../../lib/api/events';
import { formatClock, formatDayShort, formatDayTime, formatSlot } from '../../lib/eventFormatting';
import { initials } from '../../lib/initials';
import {
  EMPTY_SIGNUP_VALUES,
  formValuesToSignupInput,
  signupToFormValues,
  type SignupFormValues,
} from '../../lib/signupFormValues';
import type { Car } from '../../types/car';
import {
  SIM_LABELS,
  type EventSignup,
  type EventStatus,
  type EventTimeslot,
  type RaceEventDetail,
  type SignupStatus,
} from '../../types/event';
import { formatRaceLength } from '../../types/raceLength';

/** Status tag for the event header (label + .chip modifier). */
const EVENT_STATUS_CHIPS: Record<EventStatus, { label: string; className: string }> = {
  PUBLISHED: { label: 'Signups open', className: 'chip-solid' },
  SIGNUPS_CLOSED: { label: 'Team building', className: '' },
  DRAFT: { label: 'Draft', className: 'chip-draft' },
  COMPLETED: { label: 'Completed', className: 'chip-muted' },
  CANCELLED: { label: 'Cancelled', className: 'chip-muted' },
};

/** Status tag per signed-up driver. */
const SIGNUP_CHIPS: Record<SignupStatus, { label: string; className: string }> = {
  CONFIRMED: { label: 'Confirmed', className: 'chip-accent' },
  WAITLISTED: { label: 'Waitlisted', className: '' },
  CANCELLED: { label: 'Cancelled', className: 'chip-muted' },
};

/** "17:00 start" tab label; adds the day only when two start times share a clock time. */
function slotTabLabel(slot: EventTimeslot, all: EventTimeslot[]): string {
  const time = formatClock(slot.startsAt);
  const clash = all.some((other) => other.id !== slot.id && formatClock(other.startsAt) === time);
  return clash ? `${formatDayShort(slot.startsAt)} · ${time} start` : `${time} start`;
}

/** Count of signups per start time, leaving out the signup a form is editing. */
function slotCountsExcluding(signups: EventSignup[], signupId: string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const signup of signups) {
    if (signup.id === signupId) continue;
    for (const slot of signup.timeslots) counts[slot.id] = (counts[slot.id] ?? 0) + 1;
  }
  return counts;
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [loadedEvent, setLoadedEvent] = useState<RaceEventDetail | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const loadFailed = failedId !== null && failedId === id;
  // Only ever show the event that matches the current route: navigating from event A to B must
  // not keep showing A while B loads (or if A's response lands late).
  const event = loadedEvent !== null && loadedEvent.id === id ? loadedEvent : null;
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
  /** The driver's own unsaved signup draft (from SignupForm), overlaid on their row in the
   * availability grid so it updates live while they edit. */
  const [draft, setDraft] = useState<SignupFormValues | null>(null);
  const draftSlotIds = useRef<string[] | null>(null);
  /** Which start time's availability grid is showing (null = the first). */
  const [tabSlotId, setTabSlotId] = useState<string | null>(null);

  /** Latest-request token: a response only lands if no newer load (or route change) has started. */
  const loadSeq = useRef(0);
  const load = useCallback(() => {
    if (!id) return;
    const seq = ++loadSeq.current;
    eventsApi
      .getById(id)
      .then((loaded) => {
        if (loadSeq.current !== seq) return;
        setLoadedEvent(loaded);
        setFailedId(null);
      })
      .catch(() => {
        if (loadSeq.current === seq) setFailedId(id);
      });
  }, [id]);

  useEffect(() => {
    load();
    const seqRef = loadSeq;
    return () => {
      seqRef.current++;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    driversApi
      .list()
      .then((drivers) => {
        if (cancelled) return;
        setDriverNames(Object.fromEntries(drivers.map((d) => [d.userId, d.iracingName ?? d.displayName])));
      })
      .catch(() => {});
    carsApi
      .list()
      .then((list) => {
        if (!cancelled) setCars(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const userId = user?.id;
  const mySignup = useMemo(
    () => event?.signups.find((s) => s.userId === userId && s.status !== 'CANCELLED'),
    [event, userId],
  );
  const activeSignups = useMemo(() => event?.signups.filter((s) => s.status !== 'CANCELLED') ?? [], [event]);
  const carNames = useMemo(() => Object.fromEntries(cars.map((c) => [c.id, c.name])), [cars]);
  // While signups are open anyone can sign up or edit; once they close (team building), only a
  // driver who's already in can keep adjusting their own availability — matches the backend rule
  // in EventsService.signup().
  const isOpenForSignups = event?.status === 'PUBLISHED';
  const canEditOwnSignup = isOpenForSignups || (event?.status === 'SIGNUPS_CLOSED' && !!mySignup);
  const showSignupForm = mySignup ? editing && canEditOwnSignup : isOpenForSignups;

  useEffect(() => {
    if (!showSignupForm) {
      draftSlotIds.current = null;
      setDraft(null);
    }
  }, [showSignupForm]);

  /** How many OTHER drivers are signed up for each start time, excluding the signup a form is
   * currently editing (the form adds its own pick on top). */
  const ownSlotCounts = useMemo(() => slotCountsExcluding(activeSignups, mySignup?.id), [activeSignups, mySignup]);
  const adminSlotCounts = useMemo(
    () => slotCountsExcluding(activeSignups, adminEditing?.id),
    [activeSignups, adminEditing],
  );

  // The grid shows saved signups, except the viewer's own row while their form is open: that one
  // reflects the unsaved draft so it updates as they click. Memoised so unrelated re-renders hand
  // the (memoised) grid the same array.
  const gridSignups = useMemo<EventSignup[]>(() => {
    if (!event || !draft || !showSignupForm || !userId) return activeSignups;
    const own: EventSignup = {
      id: mySignup?.id ?? 'draft-own-signup',
      eventId: event.id,
      userId,
      carId: null,
      carClass: draft.carClass || null,
      secondaryCarClass: draft.secondaryCarClass || null,
      status: 'CONFIRMED',
      notes: null,
      eventTeamId: mySignup?.eventTeamId ?? null,
      signedUpAt: mySignup?.signedUpAt ?? '',
      timeslots: event.timeslots.filter((slot) => draft.timeslotIds.includes(slot.id)),
      availableHours: draft.availableHours,
    };
    return mySignup ? activeSignups.map((sg) => (sg.id === mySignup.id ? own : sg)) : [...activeSignups, own];
  }, [event, draft, showSignupForm, userId, mySignup, activeSignups]);

  // The forecast only depends on the season/week, so a stable element lets React skip it entirely
  // while the signup form's draft changes on every click.
  const seasonId = event?.iracingSeasonId ?? null;
  const raceWeekNum = event?.iracingRaceWeekNum ?? null;
  const forecastSection = useMemo(
    () =>
      seasonId !== null && raceWeekNum !== null ? (
        <section aria-labelledby="wx-title" className="cut flex flex-col gap-3 bg-ds-panel px-[22px] py-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="wx-title" className="h2">
              Forecast
            </h2>
            <span className="text-xs text-ds-muted">iRacing week {raceWeekNum + 1}</span>
          </div>
          <EventWeatherForecast seasonId={seasonId} raceWeekNum={raceWeekNum} />
        </section>
      ) : null,
    [seasonId, raceWeekNum],
  );

  function handleDraftChange(values: SignupFormValues) {
    // Picking a new start time in the form switches the availability tab to it (not on mount,
    // where the previous ids are still unknown).
    const previous = draftSlotIds.current;
    if (previous) {
      const added = values.timeslotIds.find((slotId) => !previous.includes(slotId));
      if (added) setTabSlotId(added);
    }
    draftSlotIds.current = values.timeslotIds;
    setDraft(values);
  }

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
    return (
      <p className="m-0 text-sm text-ds-muted">
        {loadFailed ? 'Couldn’t load this event. Try reloading the page.' : 'Loading...'}
      </p>
    );
  }

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
    document.getElementById(`av-tab-${target.id}`)?.focus();
  }

  const statusChip = EVENT_STATUS_CHIPS[event.status] ?? { label: event.status, className: '' };
  const showSignupPanel = !!mySignup || showSignupForm;

  const detailTiles: { label: string; value: string }[] = [
    { label: 'Race start', value: formatDayTime(event.startsAt) },
    { label: 'Track', value: event.track.name },
    { label: 'Length', value: formatRaceLength(event.raceLengthMinutes) },
    { label: 'Classes', value: event.carClasses.join(' / ') },
    {
      label: 'Start options',
      value: `${event.timeslots.length} timeslot${event.timeslots.length === 1 ? '' : 's'}`,
    },
  ];
  if (event.signupDeadline) {
    detailTiles.push({
      label: 'Signups close',
      value: formatDayTime(event.signupDeadline),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ds-muted">
        <Link to="/events" className="text-ds-muted hover:text-[#ff6a5f] [:root[data-theme=light]_&]:hover:text-w2w-red-ink">
          Events
        </Link>
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
        <span className="text-ds-ink">{event.title}</span>
      </nav>

      <div className="@container">
        <header className="cut-lg relative flex flex-col gap-[22px] bg-ds-panel px-5 py-5 @xl:py-[26px] @xl:pl-[30px] @xl:pr-[200px]">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 hidden w-40 @xl:block"
            style={{
              background:
                'linear-gradient(110deg, transparent 0 28%, var(--color-w2w-red) 28% 40%, transparent 40% 50%, var(--color-w2w-red) 50% 100%)',
            }}
          />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
              <div className="flex flex-wrap gap-1.5">
                <span className={`chip ${statusChip.className}`}>{statusChip.label}</span>
                <span className="chip">{SIM_LABELS[event.sim]}</span>
              </div>
              <h1 className="m-0 text-[30px] font-extrabold leading-[1.05] text-ds-ink @xl:text-[40px]">
                {event.title}
              </h1>
              {event.description && <p className="m-0 max-w-[640px] text-ds-muted">{event.description}</p>}
            </div>
            {user?.role === 'ADMIN' && (
              <div className="flex flex-wrap gap-2">
                <Link to={`/events/${event.id}/edit`} className="btn-secondary px-5">
                  Edit
                </Link>
                {event.status === 'PUBLISHED' && (
                  <button onClick={() => void handleCloseSignups()} disabled={busy} className="btn-secondary px-5">
                    Close signups
                  </button>
                )}
                {(event.status === 'SIGNUPS_CLOSED' || event.status === 'COMPLETED') && (
                  <Link to={`/events/${event.id}/teams`} className="btn-secondary px-5">
                    Team building
                  </Link>
                )}
                <button onClick={() => void handleDelete()} className="btn-danger px-5">
                  Delete
                </button>
              </div>
            )}
          </div>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2">
            {detailTiles.map((tile) => (
              <div key={tile.label} className="cut-sm flex flex-col gap-0.5 bg-ds-field px-4 py-3">
                <dt className="text-xs font-semibold text-ds-muted">{tile.label}</dt>
                <dd className="m-0 font-bold text-ds-ink">{tile.value}</dd>
              </div>
            ))}
          </dl>
        </header>
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </div>

      {event.status === 'SIGNUPS_CLOSED' ? (
        <p className="cut-sm m-0 bg-ds-panel px-4 py-3 text-[13px] text-ds-muted">
          Signups are closed.{' '}
          {mySignup
            ? 'You can still edit your signup to update your availability.'
            : 'Only drivers who were already signed up can still change their availability.'}
        </p>
      ) : (
        event.status !== 'PUBLISHED' && (
          <p className="cut-sm m-0 bg-ds-panel px-4 py-3 text-[13px] text-ds-muted">
            Signups aren't open — this event is {event.status.toLowerCase().replace('_', ' ')}.
          </p>
        )
      )}

      {error && (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        {showSignupPanel && (
          <section
            aria-labelledby="su-title"
            className="cut flex min-w-0 flex-[3_1_540px] flex-col gap-6 bg-ds-panel px-6 py-[22px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="su-title" className="h2">
                Your signup
              </h2>
              {showSignupForm && <span className="text-[13px] text-ds-muted">Nothing is saved until you submit</span>}
            </div>

            {mySignup && !editing && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <span className="lbl">Start times</span>
                  {mySignup.timeslots.length === 0 ? (
                    <p className="m-0 text-sm text-ds-muted">None picked yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {mySignup.timeslots.map((t) => (
                        <span key={t.id} className="chip chip-accent">
                          {formatSlot(t.startsAt)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {(mySignup.carClass || mySignup.carId) && (
                  <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2">
                    {mySignup.carClass && (
                      <div className="cut-sm flex flex-col gap-0.5 bg-ds-field px-4 py-3">
                        <dt className="text-xs font-semibold text-ds-muted">Car class</dt>
                        <dd className="m-0 font-bold text-ds-ink">
                          {mySignup.carClass}
                          {mySignup.secondaryCarClass ? ` (or ${mySignup.secondaryCarClass})` : ''}
                        </dd>
                      </div>
                    )}
                    {mySignup.carId && (
                      <div className="cut-sm flex flex-col gap-0.5 bg-ds-field px-4 py-3">
                        <dt className="text-xs font-semibold text-ds-muted">Favourite car</dt>
                        <dd className="m-0 font-bold text-ds-ink">{carNames[mySignup.carId] ?? '—'}</dd>
                      </div>
                    )}
                  </dl>
                )}

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={startEdit} disabled={!canEditOwnSignup} className="btn-primary">
                    Edit
                  </button>
                  <button
                    onClick={() => void handleCancel()}
                    disabled={busy || event.status !== 'PUBLISHED'}
                    className="btn-danger"
                  >
                    Cancel signup entirely
                  </button>
                </div>
              </div>
            )}

            {showSignupForm && (
              <SignupForm
                event={event}
                cars={cars}
                initial={mySignup ? signupToFormValues(mySignup) : EMPTY_SIGNUP_VALUES}
                submitLabel={mySignup ? 'Save changes' : 'Submit signup'}
                submitting={submitting}
                onSubmit={(values) => void handleSubmitSignup(values)}
                onDiscard={mySignup ? handleDiscardEdit : undefined}
                slotCounts={ownSlotCounts}
                onChange={handleDraftChange}
              />
            )}
          </section>
        )}

        <div className={`flex min-w-0 flex-col gap-5 ${showSignupPanel ? 'flex-[2_1_320px]' : 'flex-[1_1_100%]'}`}>
          {forecastSection}

          <section aria-labelledby="list-title" className="cut bg-ds-panel pb-1.5 pt-5">
            <div className="flex items-center justify-between gap-2 px-5 pb-3">
              <h2 id="list-title" className="h2">
                Signed up
              </h2>
              <span className="chip chip-sm">
                {activeSignups.length} driver{activeSignups.length === 1 ? '' : 's'}
              </span>
            </div>
            {activeSignups.length === 0 ? (
              <p className="m-0 border-t border-ds-line px-5 py-4 text-sm text-ds-muted">No one has signed up yet.</p>
            ) : (
              activeSignups.map((signup) => {
                const name = driverNames[signup.userId] ?? 'Unknown driver';
                const chip = SIGNUP_CHIPS[signup.status];
                return (
                  <div
                    key={signup.id}
                    className="row-hover flex flex-wrap items-center gap-3 border-t border-ds-line px-5 py-3"
                  >
                    <span className="cut-xs flex h-[34px] w-[34px] flex-none items-center justify-center bg-ds-control text-[13px] font-black italic text-ds-ink">
                      {initials(name)}
                    </span>
                    <span className="flex min-w-0 flex-[1_1_160px] flex-col">
                      <span className="text-sm font-bold text-ds-ink">{name}</span>
                      <span className="text-xs text-ds-muted">
                        {signup.carClass && (
                          <>
                            {signup.carClass}
                            {signup.secondaryCarClass ? ` (or ${signup.secondaryCarClass})` : ''}
                            {signup.carId && carNames[signup.carId] ? ` · ${carNames[signup.carId]}` : ''}
                            {' · '}
                          </>
                        )}
                        {signup.timeslots.length === 0
                          ? 'No availability picked yet'
                          : signup.timeslots.map((t) => formatClock(t.startsAt)).join(', ')}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`chip ${chip.className}`}>{chip.label}</span>
                      {user?.role === 'ADMIN' && (
                        <>
                          <button
                            onClick={() => {
                              setError(null);
                              setAdminEditing(signup);
                            }}
                            className="border-0 bg-transparent p-0 text-[11px] font-bold uppercase text-ds-muted transition-colors hover:text-ds-ink"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDeleteSignup(signup.id)}
                            disabled={busy}
                            className="border-0 bg-transparent p-0 text-[11px] font-bold uppercase text-ds-muted transition-colors hover:text-ds-danger disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </section>
        </div>
      </div>

      <section aria-labelledby="av-title" className="cut flex flex-col gap-4 bg-ds-panel px-6 py-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="av-title" className="h2">
              Who can drive when
            </h2>
            <span className="text-[13px] text-ds-muted">
              Hour by hour, per start time.{' '}
              {mySignup || showSignupForm ? 'Your row updates as you edit above.' : 'Your row shows once you sign up.'}
            </span>
          </div>
          <div role="tablist" aria-label="Start time" className="seg seg-field">
            {event.timeslots.map((slot) => {
              const selected = slot.id === activeSlot?.id;
              return (
                <button
                  key={slot.id}
                  id={`av-tab-${slot.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="av-panel"
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
        </div>
        <div id="av-panel" role="tabpanel" aria-labelledby={activeSlot ? `av-tab-${activeSlot.id}` : undefined}>
          <HourlyAvailabilityGrid
            timeslots={event.timeslots}
            raceLengthMinutes={event.raceLengthMinutes}
            signups={gridSignups}
            driverNames={driverNames}
            activeSlotId={activeSlot?.id}
            showTotals
            highlightDriverId={user?.id}
            emptyLabel="No one has flagged this start time yet."
          />
        </div>
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
            submitLabel="Save changes"
            submitting={submitting}
            driverLabel={driverNames[adminEditing.userId] ?? 'Driver'}
            onSubmit={(values) => void handleAdminSubmit(adminEditing, values)}
            onDiscard={() => setAdminEditing(null)}
            slotCounts={adminSlotCounts}
          />
        </Modal>
      )}
    </div>
  );
}
