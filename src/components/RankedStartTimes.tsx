import { Fragment } from 'react';
import { formatClock } from '../lib/eventFormatting';
import { ordinal, rankTimeslots } from '../lib/timeslotPreference';
import type { EventTimeslot } from '../types/event';

/** A signup's start times as inline text, in the driver's preference order. With 2+ times each
 * gets an ordinal prefix ("1st 13:00, 2nd 21:00") and the preferred one is emphasised; a single
 * time is plain. `format` picks the time label (clock only by default, `formatSlot` for a date
 * too); `separator` sits between entries. */
export default function RankedStartTimes({
  timeslots,
  preference,
  format = formatClock,
  separator = ', ',
}: {
  timeslots: readonly EventTimeslot[];
  preference: readonly string[] | null | undefined;
  format?: (startsAtIso: string) => string;
  separator?: string;
}) {
  const ranked = rankTimeslots(timeslots, preference);
  if (ranked.length < 2) return <>{ranked.map((t) => format(t.startsAt))}</>;
  return (
    <>
      {ranked.map((t, index) => (
        <Fragment key={t.id}>
          {index > 0 && separator}
          <span className={index === 0 ? 'font-bold text-ds-ink-soft' : undefined}>
            {ordinal(index + 1)} {format(t.startsAt)}
          </span>
        </Fragment>
      ))}
    </>
  );
}
