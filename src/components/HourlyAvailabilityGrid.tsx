import { memo, useMemo } from 'react';
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

interface GridProps {
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
  /** Render just this one timeslot (the caller supplies its own tabs, so the per-slot heading is
   * dropped). Omitted = every timeslot, stacked, each with its heading. */
  activeSlotId?: string;
  /** Adds a "Drivers available" row under the grid: how many rows are free in each hour, in the
   * warn colour when fewer than two. */
  showTotals?: boolean;
  /** The viewer's own row: emphasised, brighter cells, and suffixed "(you)". Matches `driverId`. */
  highlightDriverId?: string;
  /** The Team building board's denser grid: 26px cells, 130px name column, 680px minimum width. */
  compact?: boolean;
  /** Paints a row's available cells in this CSS colour (e.g. its team's colour) instead of the
   * accent. Return undefined to keep the default fill. Not applied to unrestricted rows. */
  rowColor?: (row: AvailabilityGridRow) => string | undefined;
  /** Leaves out rows with no available hour in the shown timeslot (unrestricted rows stay). */
  hideEmptyRows?: boolean;
}

const NO_ROWS: AvailabilityGridRow[] = [];

/** A row plus its available hours as a Set, so each cell is an O(1) lookup instead of an
 * Array.includes scan. */
interface RowData {
  row: AvailabilityGridRow;
  selected: ReadonlySet<string>;
}

interface LayoutProps {
  labelColWidth: string;
  labelPad: string;
  cellHeight: string;
  compact: boolean;
}

const selectedSets = new WeakMap<string[], ReadonlySet<string>>();

/** The Set form of an availableHours array, built once per array identity. */
function selectedSetFor(hours: string[]): ReadonlySet<string> {
  let set = selectedSets.get(hours);
  if (!set) {
    set = new Set(hours);
    selectedSets.set(hours, set);
  }
  return set;
}

interface AvailabilityRowProps {
  data: RowData;
  hours: string[];
  hourLabels: string[];
  layout: LayoutProps;
  isMine: boolean;
  onToggleHour: GridProps['onToggleHour'];
  canEditRow: GridProps['canEditRow'];
  rowColor: GridProps['rowColor'];
}

/** Rows are rebuilt (new objects) whenever the signups array changes; compare by content so only
 * rows that actually changed re-render (e.g. just the viewer's row while they edit a draft). */
function rowPropsEqual(a: AvailabilityRowProps, b: AvailabilityRowProps): boolean {
  const ra = a.data.row;
  const rb = b.data.row;
  return (
    ra.id === rb.id &&
    ra.name === rb.name &&
    ra.driverId === rb.driverId &&
    ra.unrestricted === rb.unrestricted &&
    ra.availableHours === rb.availableHours &&
    a.hours === b.hours &&
    a.hourLabels === b.hourLabels &&
    a.layout === b.layout &&
    a.isMine === b.isMine &&
    a.onToggleHour === b.onToggleHour &&
    a.canEditRow === b.canEditRow &&
    a.rowColor === b.rowColor
  );
}

const AvailabilityRow = memo(function AvailabilityRow({
  data,
  hours,
  hourLabels,
  layout,
  isMine,
  onToggleHour,
  canEditRow,
  rowColor,
}: AvailabilityRowProps) {
  const { row, selected } = data;
  const { labelColWidth, labelPad, cellHeight, compact } = layout;
  const editable = onToggleHour !== undefined && (canEditRow?.(row) ?? true);
  // One colour lookup per row (it doesn't depend on the hour).
  const rowFill = !row.unrestricted ? rowColor?.(row) : undefined;
  return (
    <tr>
      <th
        scope="row"
        className={`sticky left-0 ${labelColWidth} ${
          compact ? 'overflow-hidden text-ellipsis' : ''
        } whitespace-nowrap bg-ds-panel ${labelPad} py-1.5 text-left text-[13px] ${
          isMine ? 'font-bold text-ds-ink' : 'font-medium text-ds-ink-soft'
        }`}
      >
        {row.name}
        {isMine ? ' (you)' : ''}
        {row.unrestricted && <span className="block text-[10px] font-normal text-ds-dim">Any hour</span>}
      </th>
      {hours.map((hourIso, i) => {
        const available = row.unrestricted || selected.has(hourIso);
        const customColor = available ? rowFill : undefined;
        const fill = available
          ? row.unrestricted
            ? 'bg-w2w-red/40'
            : customColor
              ? ''
              : isMine
                ? 'bg-w2w-red-bright'
                : 'bg-w2w-red'
          : 'bg-ds-field';
        const hoverFill = customColor ? 'hover:opacity-80' : 'hover:bg-w2w-red/70';
        const cellStyle = customColor ? { backgroundColor: customColor } : undefined;
        return (
          <td key={hourIso} className="p-0.5">
            {editable ? (
              <button
                type="button"
                aria-pressed={available}
                aria-label={`${row.name} ${hourLabels[i]}`}
                onClick={() => onToggleHour(row, hourIso, hours)}
                className={`block ${cellHeight} w-full min-w-9 cursor-pointer border-0 p-0 transition-colors ${hoverFill} ${fill}`}
                style={cellStyle}
              />
            ) : (
              <div className={`${cellHeight} w-full min-w-9 ${fill}`} style={cellStyle}>
                <span className="sr-only">{available ? 'Available' : 'Unavailable'}</span>
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}, rowPropsEqual);

interface SlotGridProps {
  slot: EventTimeslot;
  raceLengthMinutes: number;
  signups: EventSignup[];
  driverNames: Record<string, string>;
  extraRows: AvailabilityGridRow[];
  onToggleHour: GridProps['onToggleHour'];
  canEditRow: GridProps['canEditRow'];
  emptyLabel: string;
  activeSlotId: string | undefined;
  showTotals: boolean;
  highlightDriverId: string | undefined;
  rowColor: GridProps['rowColor'];
  hideEmptyRows: boolean;
  layout: LayoutProps;
}

function SlotGrid({
  slot,
  raceLengthMinutes,
  signups,
  driverNames,
  extraRows,
  onToggleHour,
  canEditRow,
  emptyLabel,
  activeSlotId,
  showTotals,
  highlightDriverId,
  rowColor,
  hideEmptyRows,
  layout,
}: SlotGridProps) {
  const { labelColWidth, labelPad } = layout;
  const hours = useMemo(() => hoursForSlot(slot.startsAt, raceLengthMinutes), [slot.startsAt, raceLengthMinutes]);
  const hourLabels = useMemo(() => hours.map(formatHour), [hours]);
  const slotTitle = useMemo(() => formatSlot(slot.startsAt), [slot.startsAt]);

  const rowData = useMemo<RowData[]>(() => {
    const hourSet = new Set(hours);
    const signupRows: AvailabilityGridRow[] = signups
      .filter((s) => s.timeslots.some((t) => t.id === slot.id))
      .map((s) => ({
        id: s.id,
        driverId: s.userId,
        name: driverNames[s.userId] ?? 'Unknown driver',
        availableHours: s.availableHours,
      }));
    const all: RowData[] = [...signupRows, ...extraRows].map((row) => ({
      row,
      selected: selectedSetFor(row.availableHours),
    }));
    return hideEmptyRows
      ? all.filter(({ row }) => row.unrestricted || row.availableHours.some((h) => hourSet.has(h)))
      : all;
  }, [signups, slot.id, driverNames, extraRows, hours, hideEmptyRows]);

  // Drivers free in each hour (one pass over rows x hours).
  const totals = useMemo(() => {
    if (!showTotals) return null;
    return hours.map((hourIso) =>
      rowData.reduce((n, { row, selected }) => n + (row.unrestricted || selected.has(hourIso) ? 1 : 0), 0),
    );
  }, [showTotals, hours, rowData]);

  return (
    <div className={activeSlotId ? undefined : 'mb-6'}>
      {!activeSlotId && <h3 className="m-0 mb-2 text-[13px] font-bold text-ds-ink-soft">{slotTitle}</h3>}
      {rowData.length === 0 ? (
        <p className="m-0 text-xs text-ds-muted">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full border-collapse text-sm ${layout.compact ? 'min-w-[680px]' : ''}`}>
            <caption className="sr-only">Hourly stint availability for the {slotTitle} start option</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`sticky left-0 ${labelColWidth} bg-ds-panel ${labelPad} py-2 text-left text-[11px] font-bold uppercase text-ds-dim`}
                >
                  <span className="sr-only">Driver</span>
                </th>
                {hours.map((hourIso, i) => (
                  <th
                    key={hourIso}
                    scope="col"
                    className="whitespace-nowrap px-1 py-2 text-center text-[11px] font-bold tabular-nums text-ds-dim"
                  >
                    {hourLabels[i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowData.map((data) => (
                <AvailabilityRow
                  key={data.row.id}
                  data={data}
                  hours={hours}
                  hourLabels={hourLabels}
                  layout={layout}
                  isMine={highlightDriverId !== undefined && data.row.driverId === highlightDriverId}
                  onToggleHour={onToggleHour}
                  canEditRow={canEditRow}
                  rowColor={rowColor}
                />
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className={`sticky left-0 ${labelColWidth} whitespace-nowrap border-t border-ds-line bg-ds-panel px-3 pb-1 pt-2.5 text-left text-xs font-semibold text-ds-muted`}
                  >
                    Drivers available
                  </th>
                  {hours.map((hourIso, i) => (
                    <td
                      key={hourIso}
                      className={`num border-t border-ds-line px-1 pb-1 pt-2.5 text-center text-[17px] ${
                        totals[i] < 2 ? 'text-ds-warn' : 'text-ds-ink'
                      }`}
                    >
                      {totals[i]}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

/** Per-timeslot hourly stint-availability grid — the same table EventDetailPage shows, reused
 * wherever the roster's availability is needed: the full roster on EventTeamBuildingPage, or one
 * team's own drivers on EventTeamPlanPage. Read-only by default; pass `onToggleHour` (and
 * optionally `canEditRow` to limit it to some rows) to make cells clickable. Memoised, with
 * per-slot rows, hours, labels and totals derived once per input change. */
function HourlyAvailabilityGrid({
  timeslots,
  raceLengthMinutes,
  signups,
  driverNames,
  extraRows = NO_ROWS,
  onToggleHour,
  canEditRow,
  emptyLabel = 'No one flagged this start time.',
  activeSlotId,
  showTotals = false,
  highlightDriverId,
  compact = false,
  rowColor,
  hideEmptyRows = false,
}: GridProps) {
  const layout = useMemo<LayoutProps>(
    () => ({
      labelColWidth: compact ? 'w-[130px] min-w-[130px] max-w-[130px]' : 'min-w-[150px]',
      // Compact (board) label cells have no left padding, just a small gap to the first cell.
      labelPad: compact ? 'pl-0 pr-2' : 'px-3',
      cellHeight: compact ? 'h-[26px]' : 'h-[30px]',
      compact,
    }),
    [compact],
  );
  const visibleSlots = activeSlotId ? timeslots.filter((slot) => slot.id === activeSlotId) : timeslots;
  return (
    <>
      {visibleSlots.map((slot) => (
        <SlotGrid
          key={slot.id}
          slot={slot}
          raceLengthMinutes={raceLengthMinutes}
          signups={signups}
          driverNames={driverNames}
          extraRows={extraRows}
          onToggleHour={onToggleHour}
          canEditRow={canEditRow}
          emptyLabel={emptyLabel}
          activeSlotId={activeSlotId}
          showTotals={showTotals}
          highlightDriverId={highlightDriverId}
          rowColor={rowColor}
          hideEmptyRows={hideEmptyRows}
          layout={layout}
        />
      ))}
    </>
  );
}

export default memo(HourlyAvailabilityGrid);
