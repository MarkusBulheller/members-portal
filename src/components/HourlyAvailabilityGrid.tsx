import { formatHour, formatSlot, hoursForSlot } from '../lib/eventFormatting';
import type { EventSignup, EventTimeslot } from '../types/event';

/** One row of the grid. Signup rows are built from `signups`; `extraRows` lets a caller add
 * rows that aren't signups (a team plan's dummy drivers), shown under every timeslot. */
export interface AvailabilityGridRow {
  /** Stable key for this row — the signup id, or the dummy driver's id. */
  id: string;
  /** The driver id (userId for a signup, the dummy's id for a dummy) — lets callers decide
   * whether the viewer may edit this particular row. */
  driverId: string;
  name: string;
  availableHours: string[];
  /** No hours set means "free for any hour" — drawn as a dimmer all-available row. */
  unrestricted?: boolean;
}

/** Per-timeslot hourly stint-availability grid — the same table EventDetailPage shows, reused
 * wherever the roster's availability is needed: the full roster on EventTeamBuildingPage, or one
 * team's own drivers on EventTeamPlanPage. Read-only by default; pass `onToggleHour` (and
 * optionally `canEditRow` to limit it to some rows) to make cells clickable. */
export default function HourlyAvailabilityGrid({
  timeslots,
  raceLengthMinutes,
  signups,
  driverNames,
  extraRows = [],
  onToggleHour,
  canEditRow,
  emptyLabel = 'No one flagged this start time.',
}: {
  timeslots: EventTimeslot[];
  raceLengthMinutes: number;
  signups: EventSignup[];
  driverNames: Record<string, string>;
  extraRows?: AvailabilityGridRow[];
  /** `slotHours` is every hour of the timeslot being shown, so a caller can seed an
   * unrestricted row from "all hours" when its first cell is toggled. */
  onToggleHour?: (row: AvailabilityGridRow, hourIso: string, slotHours: string[]) => void;
  canEditRow?: (row: AvailabilityGridRow) => boolean;
  emptyLabel?: string;
}) {
  return (
    <>
      {timeslots.map((slot) => {
        const signupRows: AvailabilityGridRow[] = signups
          .filter((s) => s.timeslots.some((t) => t.id === slot.id))
          .map((s) => ({
            id: s.id,
            driverId: s.userId,
            name: driverNames[s.userId] ?? 'Unknown driver',
            availableHours: s.availableHours,
          }));
        const rows = [...signupRows, ...extraRows];
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
                    {rows.map((row) => {
                      const editable = onToggleHour !== undefined && (canEditRow?.(row) ?? true);
                      return (
                        <tr key={row.id} className="border-b border-white/5">
                          <th
                            scope="row"
                            className="sticky left-0 bg-w2w-charcoal py-1.5 px-3 text-left font-normal text-white/70 whitespace-nowrap"
                          >
                            {row.name}
                            {row.unrestricted && (
                              <span className="block text-[10px] text-white/50">Any hour</span>
                            )}
                          </th>
                          {hours.map((hourIso) => {
                            const available = row.unrestricted || row.availableHours.includes(hourIso);
                            const fill = available
                              ? row.unrestricted
                                ? 'bg-w2w-red/40'
                                : 'bg-w2w-red'
                              : 'bg-white/5';
                            return (
                              <td key={hourIso} className="p-0.5">
                                {editable ? (
                                  <button
                                    type="button"
                                    aria-pressed={available}
                                    aria-label={`${row.name} ${formatHour(hourIso)}`}
                                    onClick={() => onToggleHour(row, hourIso, hours)}
                                    className={`w-7 h-7 transition-colors hover:bg-w2w-red/70 cursor-pointer ${fill}`}
                                  />
                                ) : (
                                  <div className={`w-7 h-7 ${fill}`}>
                                    <span className="sr-only">{available ? 'Available' : 'Unavailable'}</span>
                                  </div>
                                )}
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
    </>
  );
}
