import { memo, useMemo } from 'react';
import { formatHour, formatSlot, hoursForSlot } from '../lib/eventFormatting';
import { isDrivingInHour } from '../lib/teamPlanClock';
import type { EventTimeslot } from '../types/event';

/** One driver row of the team plan's availability grid: the hours they flagged plus the stints
 * planned for them, so the grid can outline hours they drive and flag the ones outside their hours. */
export interface PlanAvailabilityRow {
  /** Stable key — the signup id, or the guest/dummy driver's id. */
  id: string;
  /** userId for a member, the dummy's own id for a guest — matches EventTeamStint.driverUserId. */
  driverId: string;
  name: string;
  availableHours: string[];
  /** No hours set means "free for any hour" (guests/placeholders). */
  unrestricted?: boolean;
  /** Tailwind `text-*` class whose colour outlines this driver's stints (matches their timeline colour). */
  outlineClass: string;
  /** Planned stints of this driver, as absolute ms windows. */
  stints: { startMs: number; endMs: number }[];
}

/** Team plan flavour of HourlyAvailabilityGrid (same cells, same click-to-toggle), plus the board's
 * stint marks: an outline where the driver has a stint, amber where that stint falls outside the
 * hours they flagged, and a three-item legend. Kept separate from the shared grid, which has no
 * overlay API. */
function TeamPlanAvailabilityGrid({
  slot,
  raceLengthMinutes,
  rows,
  onToggleHour,
  canEditRow,
  emptyLabel = 'No one flagged this start time.',
}: {
  slot: EventTimeslot;
  raceLengthMinutes: number;
  rows: PlanAvailabilityRow[];
  onToggleHour?: (row: PlanAvailabilityRow, hourIso: string, slotHours: string[]) => void;
  canEditRow?: (row: PlanAvailabilityRow) => boolean;
  emptyLabel?: string;
}) {
  // Per-hour ISO keys, start instants and labels are built once per slot (not per cell per render).
  const hours = useMemo(() => hoursForSlot(slot.startsAt, raceLengthMinutes), [slot.startsAt, raceLengthMinutes]);
  const hourStarts = useMemo(() => hours.map((iso) => Date.parse(iso)), [hours]);
  const hourLabels = useMemo(() => hours.map((iso) => formatHour(iso)), [hours]);

  // Everything a cell needs, computed once per rows/hours change.
  const gridRows = useMemo(
    () =>
      rows.map((row) => {
        const marked = new Set(row.availableHours);
        const cells = hours.map((hourIso, h) => {
          const available = row.unrestricted === true || marked.has(hourIso);
          const driving = isDrivingInHour(row.stints, hourStarts[h]);
          // Same rule as the plan table's "Not marked available" warning: a driver who flagged
          // no hours at all isn't treated as having a conflict.
          const conflict = driving && !available && row.availableHours.length > 0;
          const fill = conflict
            ? 'bg-ds-warn'
            : available
              ? row.unrestricted
                ? 'bg-[#2f3a52]/50'
                : 'bg-[#2f3a52]'
              : 'bg-ds-field';
          const outline = driving && !conflict ? `shadow-[inset_0_0_0_2px_currentColor] ${row.outlineClass}` : '';
          const state = `${available ? 'available' : 'not available'}${
            conflict ? ', stint outside their hours' : driving ? ', driving a stint' : ''
          }`;
          return { hourIso, available, fill, outline, state, label: hourLabels[h] };
        });
        return { row, cells };
      }),
    [rows, hours, hourStarts, hourLabels],
  );

  if (rows.length === 0) {
    return <p className="m-0 text-xs text-ds-muted">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">
            Hourly stint availability for the {formatSlot(slot.startsAt)} start option, with planned stints marked
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 min-w-[130px] bg-ds-panel px-3 py-2 text-left text-[11px] font-bold uppercase text-ds-dim"
              >
                <span className="sr-only">Driver</span>
              </th>
              {hours.map((hourIso, h) => (
                <th
                  key={hourIso}
                  scope="col"
                  className="whitespace-nowrap px-1 py-2 text-center text-[11px] font-bold tabular-nums text-ds-dim"
                >
                  {hourLabels[h]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gridRows.map(({ row, cells }) => {
              const editable = onToggleHour !== undefined && (canEditRow?.(row) ?? true);
              return (
                <tr key={row.id}>
                  <th
                    scope="row"
                    className="sticky left-0 min-w-[130px] whitespace-nowrap bg-ds-panel px-3 py-1.5 text-left text-[13px] font-bold text-ds-ink"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 bg-current ${row.outlineClass}`} aria-hidden="true" />
                      {row.name}
                    </span>
                    {row.unrestricted && <span className="block pl-[18px] text-[10px] font-normal text-ds-dim">Any hour</span>}
                  </th>
                  {cells.map(({ hourIso, available, fill, outline, state, label }) => (
                    <td key={hourIso} className="p-0.5">
                      {editable ? (
                        <button
                          type="button"
                          aria-pressed={available}
                          aria-label={`${row.name} ${label}, ${state}`}
                          title={`${row.name} · ${label} · ${state}`}
                          onClick={() => onToggleHour(row, hourIso, hours)}
                          className={`block h-[34px] w-full min-w-9 cursor-pointer border-0 p-0 transition-colors hover:brightness-125 ${fill} ${outline}`}
                        />
                      ) : (
                        <div title={`${row.name} · ${label} · ${state}`} className={`h-[34px] w-full min-w-9 ${fill} ${outline}`}>
                          <span className="sr-only">{state}</span>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-4 p-0 text-xs text-ds-muted">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 bg-[#2f3a52]" aria-hidden="true" />
          Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 shadow-[inset_0_0_0_2px_var(--color-ds-ink)]" aria-hidden="true" />
          Driving a stint
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 bg-ds-warn" aria-hidden="true" />
          Stint outside their hours
        </li>
      </ul>
    </div>
  );
}

export default memo(TeamPlanAvailabilityGrid);
