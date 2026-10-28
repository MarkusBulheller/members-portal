import type { EventGuestSignup, EventTimeslot } from '../types/event';

/** The event timeslots a guest signed up for (their `timeslotIds` resolved against the event's
 * own timeslots) — the shape RankedStartTimes / rankTimeslots expect. */
export function guestSlots(guest: Pick<EventGuestSignup, 'timeslotIds'>, timeslots: readonly EventTimeslot[]): EventTimeslot[] {
  return timeslots.filter((slot) => guest.timeslotIds.includes(slot.id));
}
