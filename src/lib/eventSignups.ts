import type { RaceEvent } from '../types/event';

/** An event members can still sign up for right now: published, not yet started, and the signup
 * deadline (if there is one) hasn't passed. */
export function isSignupOpen(event: RaceEvent, nowMs: number = Date.now()): boolean {
  return (
    event.status === 'PUBLISHED' &&
    new Date(event.startsAt).getTime() >= nowMs &&
    (event.signupDeadline === null || new Date(event.signupDeadline).getTime() >= nowMs)
  );
}

/** Open-signup events the current user hasn't signed up for yet. Only events that explicitly say
 * `viewer.signedUp === false` count — an older backend that omits `viewer` yields none rather than
 * wrongly nagging everyone. */
export function eventsWaitingOnViewer(events: RaceEvent[], nowMs: number = Date.now()): RaceEvent[] {
  return events.filter((event) => isSignupOpen(event, nowMs) && event.viewer?.signedUp === false);
}
