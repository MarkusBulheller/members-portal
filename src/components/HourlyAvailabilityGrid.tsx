import { formatHour, formatSlot, hoursForSlot } from '../lib/eventFormatting';
import type { EventSignup, EventTimeslot } from '../types/event';

/** Read-only per-timeslot hourly stint-availability grid — the same table EventDetailPage shows
 * (with each viewer's own row editable there), reused wherever a purely informational view is
 * needed: the full roster on EventTeamBuildingPage, or one team's own drivers on
 * EventTeamPlanPage. */
export default function HourlyAvailabilityGrid({
  timeslots,
  raceLengthMinutes,
  signups,
  driverNames,
  emptyLabel = 'No one flagged this start time.',
}: {
  timeslots: EventTimeslot[];
  raceLengthMinutes: number;
  signups: EventSignup[];
  driverNames: Record<string, string>;
  emptyLabel?: string;
}) {
  return (
    <>
      {timeslots.map((slot) => {
        const rows = signups.filter((s) => s.timeslots.some((t) => t.id === slot.id));
        const hours = hoursForSlot(slot.startsAt, raceLengthMinutes);
        return (
          <div key={slot.id} className="mb-6">
            <h3 className="text-white/65 text-xs font-heading uppercase tracking-wide mb-2">
              {formatSlot(slot.startsAt)}
            </h3>
            {rows.length === 0 ? (
              <p className="text-white/65 text-xs">{emptyLabel}</p>
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
                    {rows.map((signup) => (
                      <tr key={signup.id} className="border-b border-white/5">
                        <th
                          scope="row"
                          className="sticky left-0 bg-w2w-charcoal py-1.5 px-3 text-left font-normal text-white/70 whitespace-nowrap"
                        >
                          {driverNames[signup.userId] ?? 'Unknown driver'}
                        </th>
                        {hours.map((hourIso) => {
                          const available = signup.availableHours.includes(hourIso);
                          return (
                            <td key={hourIso} className="p-0.5">
                              <div className={`w-7 h-7 ${available ? 'bg-w2w-red' : 'bg-white/5'}`}>
                                <span className="sr-only">{available ? 'Available' : 'Unavailable'}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
