import {
  type Dispatch,
  type FocusEvent,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AvailabilityGridRow } from '../../components/HourlyAvailabilityGrid';
import StintTimeline from '../../components/StintTimeline';
import TeamPlanAvailabilityGrid from '../../components/TeamPlanAvailabilityGrid';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { carsApi } from '../../lib/api/cars';
import { driversApi } from '../../lib/api/drivers';
import { eventsApi } from '../../lib/api/events';
import { eventTeamDriverSettingsApi } from '../../lib/api/eventTeamDriverSettings';
import { eventTeamDummyDriversApi } from '../../lib/api/eventTeamDummyDrivers';
import { eventTeamStintsApi } from '../../lib/api/eventTeamStints';
import { eventTeamsApi } from '../../lib/api/eventTeams';
import { iracingSeriesApi } from '../../lib/api/iracingSeries';
import { type DriverColor, getDriverColor, orderedDriverIds } from '../../lib/driverColors';
import { formatClock, formatSecondsAsLapTime, parseLapTimeToSeconds } from '../../lib/eventFormatting';
import { isPageHidden, subscribeToPageActivity } from '../../lib/pageActivity';
import {
  distributeTyres,
  lmuTyreStopSeconds,
  PARTIAL_TYRE_CHANGE_SECONDS_DEFAULT,
  TYRES_AT_START,
  tyresChangedOf,
  tyresUsed,
} from '../../lib/tyres';
import { formatCountdown, formatElapsed, liveClockSubline, outlineClassForDot, racePhase } from '../../lib/teamPlanClock';
import { type LivePlanMessage, useLivePlan } from '../../lib/useLivePlan';
import type { CarDetail } from '../../types/car';
import type { RaceEventDetail } from '../../types/event';
import type { CreateEventTeamInput, EventTeam, EventTeamSettingsInput } from '../../types/eventTeam';
import type { EventTeamDriverSettings } from '../../types/eventTeamDriverSettings';
import type { EventTeamDummyDriver } from '../../types/eventTeamDummyDriver';
import type { EventTeamStint } from '../../types/eventTeamStint';
import type { WeatherForecastPoint } from '../../types/iracingWeatherForecast';

/** One computed row of the stint schedule — everything derived from a stint plus its live inputs
 * (driver pace/fuel, weather, settings). Named so a locked row's snapshot can be cached and
 * replayed verbatim instead of recomputed — see frozenRowsRef. */
interface PlanRow {
  stint: EventTeamStint;
  startMs: number | null;
  startOffsetMinutes: number;
  durationMinutes: number;
  pitBeforeMinutes: number;
  estLaps: number | null;
  weatherPoint: WeatherForecastPoint | null;
  isWetStint: boolean;
  availabilityWarning: boolean | undefined;
}

type SettingType = 'number' | 'laptime' | 'time';

interface SettingField {
  key: keyof EventTeamSettingsInput | 'simStartTimeOfDay';
  label: string;
  unit: string;
  step?: string;
  type: SettingType;
  /** Only shown on Le Mans Ultimate events. */
  lmuOnly?: boolean;
}

const SETTING_FIELDS: SettingField[] = [
  { key: 'raceStartOffsetMinutes', label: 'Practice + quali offset', unit: 'min', step: '1', type: 'number' },
  { key: 'refuelDurationSeconds', label: 'Refuel time', unit: 'sec', step: '1', type: 'number' },
  { key: 'tyreChangeDurationSeconds', label: 'Tyre change', unit: 'sec', step: '1', type: 'number' },
  // Optional (default 5 s) — deliberately not part of readyToGeneratePlan.
  {
    key: 'partialTyreChangeSeconds',
    label: 'Tyre change (up to 2 tyres)',
    unit: 'sec',
    step: '0.1',
    type: 'number',
    lmuOnly: true,
  },
  { key: 'pitstopDrivethroughSeconds', label: 'Pit drive-through', unit: 'sec', step: '1', type: 'number' },
  { key: 'lapTimeDrySeconds', label: 'Lap time (dry)', unit: 'mm:ss.ms', type: 'laptime' },
  { key: 'lapTimeWetSeconds', label: 'Lap time (wet)', unit: 'mm:ss.ms', type: 'laptime' },
  { key: 'fuelUsagePerLapLiters', label: 'Fuel usage / lap', unit: 'L', step: '0.01', type: 'number' },
  { key: 'formationLapFuelLiters', label: 'Formation lap fuel', unit: 'L', step: '0.01', type: 'number' },
  { key: 'fuelTankCapacityLiters', label: 'Fuel tank size', unit: 'L', step: '0.1', type: 'number' },
  { key: 'simStartTimeOfDay', label: 'Sim start time', unit: 'HH:MM', type: 'time' },
];

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Adds minutes to an "HH:MM" in-game clock time, wrapping across midnight — used to project the
 * Sim Time column from EventTeam.simStartTimeOfDay + a stint's offset from race start. */
function addMinutesToTimeOfDay(hhmm: string, minutesToAdd: number): string | null {
  const match = TIME_OF_DAY_PATTERN.exec(hhmm);
  if (!match) return null;
  const base = Number(match[1]) * 60 + Number(match[2]);
  // Round to a whole minute once, up front — rounding `total % 60` on its own can land exactly on
  // 60 (e.g. 599.6 -> "09:60" instead of "10:00").
  const totalRounded = Math.round(base + minutesToAdd);
  const total = ((totalRounded % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** One cached formatter per IANA zone (a team has a handful of drivers, so this stays tiny) —
 * constructing an Intl.DateTimeFormat with a timeZone costs 50-200 µs, and the table used to build
 * one per stint per render. An invalid zone string is cached as null. */
const zoneFormatters = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormatter(timezone: string): Intl.DateTimeFormat | null {
  const cached = zoneFormatters.get(timezone);
  if (cached !== undefined) return cached;
  let formatter: Intl.DateTimeFormat | null;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    });
  } catch {
    formatter = null;
  }
  if (zoneFormatters.size >= 64) zoneFormatters.clear();
  zoneFormatters.set(timezone, formatter);
  return formatter;
}

/** Formats a real timestamp in a driver's own IANA timezone — swallows an invalid zone string
 * rather than throwing, since DriverProfile.timezone isn't validated anywhere yet. */
function formatInTimezone(ms: number, timezone: string): string | null {
  const formatter = zoneFormatter(timezone);
  if (!formatter) return null;
  try {
    const parts = formatter.formatToParts(ms);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    // "13:00 CET" — the time plus the zone abbreviation at that moment (CET/CEST/BST/GMT+2 ...).
    return `${get('hour')}:${get('minute')} ${get('timeZoneName')}`.trim();
  } catch {
    return null;
  }
}

const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const ZONE_FORMATTER = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' });

/** 24-hour "HH:MM" in the viewer's own timezone (the boards' time format) — the shared hand-built
 * formatter, so it never touches Intl. */
function formatClockMs(ms: number): string {
  return formatClock(new Date(ms));
}

/** "Sat 24 Oct" in the viewer's own timezone. */
function formatDayMonth(ms: number): string {
  const parts = DAY_MONTH_FORMATTER.formatToParts(ms);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}

/** The viewer's timezone abbreviation at that moment ("CET", "BST", "GMT+2"). */
function formatZone(ms: number): string {
  return ZONE_FORMATTER.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** setTimeout's maximum delay (about 24.8 days) — longer waits are clamped and simply re-armed. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Stable no-op-update helper: skips the state update when the fresh server response is deep-equal
 * to what is already shown, so an identical refetch (a live notice about a change that did not
 * touch this data, or the polling fallback) doesn't re-render the page or invalidate memos.
 * JSON.stringify is stable here because both sides are parsed API responses with the same key order. */
function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
function setIfChanged<T>(setter: Dispatch<SetStateAction<T>>, next: T): void {
  setter((prev) => (sameJson(prev, next) ? prev : next));
}

/** The forecast point whose time_offset (minutes from session start, same reference frame as a
 * stint's own race-start offset) is closest to the given offset — a stint's midpoint is passed in
 * so a short stint picks the single most representative sample. */
function nearestWeatherPoint(points: WeatherForecastPoint[], offsetMinutes: number): WeatherForecastPoint | null {
  if (points.length === 0) return null;
  return points.reduce((best, p) =>
    Math.abs(p.time_offset - offsetMinutes) < Math.abs(best.time_offset - offsetMinutes) ? p : best,
  );
}

function formatWeatherPoint(p: WeatherForecastPoint): string {
  const temp = Math.round(p.air_temp / 100);
  const rain = Math.round(p.precip_chance / 100);
  return `${temp}°C · ${rain}% rain`;
}

function numOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDecimal(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDuration(totalMinutes: number): string {
  // Round the whole value first, then split — rounding `totalMinutes % 60` on its own can land
  // exactly on 60 (e.g. 119.6 -> "1h 60m" instead of "2h 0m").
  const rounded = Math.round(totalMinutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Minutes-and-seconds display for short, precise durations (a single stint, a pit stop) — the
 * fuel-derived stint length and pit-time settings are rarely whole minutes, so "54.6m" reads
 * worse than "54m 36s". */
function formatMinutesSeconds(totalMinutes: number): string {
  const totalSeconds = Math.round(totalMinutes * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Every on-the-hour bucket (matching lib/eventFormatting's hoursForSlot — i.e. availableHours'
 * own keys) that a [windowStartMs, windowEndMs) span touches. Anchored to the timeslot's own raw
 * startsAt — the same anchor hoursForSlot uses to build availableHours' keys in the first place —
 * NOT to raceStartMs, which additionally shifts by the team's Practice + Quali Offset setting.
 * Using raceStartMs here would offset every bucket away from the ones a driver actually marked,
 * making every stint appear unavailable once that offset is nonzero. E.g. a 09:00–09:47 stint
 * touches only the 09:00 bucket; a driver who marked 09:00 available covers the whole thing. */
function overlappingRaceHours(timeslotStartMs: number, windowStartMs: number, windowEndMs: number): string[] {
  const firstK = Math.floor((windowStartMs - timeslotStartMs) / 3_600_000);
  const hours: string[] = [];
  for (let k = Math.max(firstK, 0); timeslotStartMs + k * 3_600_000 < windowEndMs; k++) {
    hours.push(hourIso(timeslotStartMs + k * 3_600_000));
  }
  return hours;
}

/** toISOString() of an hour bucket, memoised: the cascade asks for the same few hundred instants on
 * every recompute. Bounded so a long session can't grow it without limit. */
const hourIsoCache = new Map<number, string>();
function hourIso(ms: number): string {
  let iso = hourIsoCache.get(ms);
  if (iso === undefined) {
    if (hourIsoCache.size >= 2_000) hourIsoCache.clear();
    iso = new Date(ms).toISOString();
    hourIsoCache.set(ms, iso);
  }
  return iso;
}

/** Sizes a back-to-back run of full-tank stints — used both to seed the stored duration on
 * creation and, by the caller, to decide how many stints are needed at all. The stored value here
 * is only ever a starting point: once rendered, an unassigned stint's duration is always
 * recalculated live from the exact (unrounded) fuel-tank formula, never read back from storage —
 * so this must use that exact `maxStintMinutes` too, not a rounded stand-in, or the count/remainder
 * it computes stops matching what actually ends up on screen. */
function generateStintDurations(raceLengthMinutes: number, maxStintMinutes: number, pitMinutes: number): number[] {
  if (maxStintMinutes <= 0) return [];

  const durations: number[] = [];
  let elapsed = 0;
  while (true) {
    if (durations.length > 0) {
      elapsed += pitMinutes;
      if (elapsed >= raceLengthMinutes) break;
    }
    const remaining = raceLengthMinutes - elapsed;
    if (remaining <= 0) break;
    if (remaining <= maxStintMinutes) {
      durations.push(remaining);
      break;
    }
    durations.push(maxStintMinutes);
    elapsed += maxStintMinutes;
  }
  return durations;
}

// Every driver on the team is capped at 2 stints in a row before someone else takes over.
const MAX_SUCCESSIVE_STINTS = 2;

interface DriverAssignmentProfile {
  startingDriver: boolean;
}

interface AssignmentCandidate {
  userId: string;
  availableHours: string[];
}

/** Driver assignment for a freshly-generated stint schedule: whoever drove the previous stint
 * finishes out a double stint if they're still available and under the cap; otherwise it's
 * whoever's due — the available driver with the fewest total stints so far — same as a real
 * strategist working a whiteboard by "who's up next and free," not a fixed clock. The race opens
 * with a flagged starting driver if one's signed up. The streak cap is the one constraint that's
 * never worth breaking quietly, so it's protected ahead of availability in the relaxation order
 * below — a stint outside someone's marked hours beats pushing anyone past two in a row — and the
 * driver who just finished never gets immediately re-picked, so a tight availability window can't
 * quietly recreate the same violation through the back door. A single, uneven-length stint here
 * and there (whoever happens to be next up when the fuel/lap math doesn't divide evenly) is
 * expected, not a bug. */
function assignDriversToStints(
  durationsMinutes: number[],
  raceStartMs: number,
  timeslotStartMs: number,
  pitMinutes: number,
  candidates: AssignmentCandidate[],
  profiles: Record<string, DriverAssignmentProfile>,
): (string | null)[] {
  if (candidates.length === 0) return durationsMinutes.map(() => null);

  const lastDriveIndex: Record<string, number> = {}; // stint index each driver last drove; -1 = never
  const totalAssigned: Record<string, number> = {};
  for (const c of candidates) {
    lastDriveIndex[c.userId] = -1;
    totalAssigned[c.userId] = 0;
  }
  let streakDriverId: string | null = null;
  let streakLength = 0;

  const assignments: (string | null)[] = [];
  let cursorMs = raceStartMs;

  durationsMinutes.forEach((durationMinutes, index) => {
    const pitBeforeMinutes = index === 0 ? 0 : pitMinutes;
    const stintStartMs = cursorMs + pitBeforeMinutes * 60_000;
    const stintEndMs = stintStartMs + durationMinutes * 60_000;
    const stintHours = overlappingRaceHours(timeslotStartMs, stintStartMs, stintEndMs);

    const isAvailable = (c: AssignmentCandidate) =>
      c.availableHours.length === 0 || stintHours.every((h) => c.availableHours.includes(h));
    const wouldExceedStreak = (userId: string) => streakDriverId === userId && streakLength + 1 > MAX_SUCCESSIVE_STINTS;

    // The streak cap is protected ahead of availability: relax availability first (someone doing
    // a stint outside their marked hours beats a 3rd or 4th stint in a row), and only drop the
    // cap itself if literally nobody clears it, as an absolute last resort.
    let pool = candidates.filter((c) => isAvailable(c) && !wouldExceedStreak(c.userId));
    if (pool.length === 0) pool = candidates.filter((c) => !wouldExceedStreak(c.userId));
    if (pool.length === 0) pool = candidates;

    if (index === 0) {
      const starters = pool.filter((c) => profiles[c.userId]?.startingDriver);
      if (starters.length > 0) pool = starters;
    }

    // Finish an in-progress double stint if the streak driver is still in this pool.
    const continuing =
      streakDriverId !== null && streakLength < MAX_SUCCESSIVE_STINTS
        ? pool.find((c) => c.userId === streakDriverId)
        : undefined;

    // Otherwise, whoever's due: fewest total stints so far wins, so the whole race splits evenly
    // across the roster — rest since last stint only breaks a tie between two equally-loaded
    // drivers.
    const picked =
      continuing ??
      pool.slice().sort((a, b) => {
        const totalDiff = totalAssigned[a.userId] - totalAssigned[b.userId];
        if (totalDiff !== 0) return totalDiff;
        const restA = index - lastDriveIndex[a.userId];
        const restB = index - lastDriveIndex[b.userId];
        return restB - restA;
      })[0];

    assignments.push(picked.userId);
    lastDriveIndex[picked.userId] = index;
    totalAssigned[picked.userId] += 1;
    if (streakDriverId === picked.userId) streakLength += 1;
    else {
      streakDriverId = picked.userId;
      streakLength = 1;
    }

    cursorMs = stintEndMs;
  });

  return assignments;
}

function BreadcrumbChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** How long the "Updated by …" note stays before fading. */
const LIVE_NOTE_VISIBLE_MS = 4_000;
/** Auto-fill stays off this long after the last change by someone else. */
const REMOTE_QUIET_MS = 4_000;

/** Milliseconds until the race clock's displayed text next changes: on the second while it counts
 * down inside the last day or counts up, on the minute ("9d 02:14") further out. */
function nextClockDelay(nowMs: number, raceStartMs: number, raceEndMs: number): number {
  const DAY_MS = 86_400_000;
  if (nowMs < raceStartMs) {
    const remaining = raceStartMs - nowMs;
    return (remaining > DAY_MS ? remaining % 60_000 : remaining % 1_000) + 5;
  }
  const elapsed = nowMs - raceStartMs;
  return Math.min(1_000 - (elapsed % 1_000) + 5, Math.max(raceEndMs - nowMs + 5, 5));
}

/** The header race clock. Ticks on its OWN state so the seconds counter doesn't re-render the whole
 * (large) plan page. It schedules each tick for the moment the displayed text changes, pauses while
 * the tab is hidden (a visible-again event refreshes it), and stops for good once the race is over. */
function RaceClockTile({
  raceStartMs,
  targetEndMs,
  clockRows,
}: {
  raceStartMs: number;
  targetEndMs: number;
  clockRows: { startMs: number | null; durationMinutes: number; driverLabel: string | null }[];
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const t = Date.now();
      setNowMs(t);
      if (t >= targetEndMs || isPageHidden()) return; // finished, or resumed on the next page-activity event
      timer = setTimeout(tick, Math.min(nextClockDelay(t, raceStartMs, targetEndMs), MAX_TIMEOUT_MS));
    };
    tick();
    const unsubscribe = subscribeToPageActivity(tick);
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [raceStartMs, targetEndMs]);
  const phase = racePhase(nowMs, raceStartMs, targetEndMs);
  // These sub-lines only change when the race times do — not every second.
  const startLabel = useMemo(
    () => `${formatDayMonth(raceStartMs)}, ${formatClockMs(raceStartMs)} ${formatZone(raceStartMs)}`,
    [raceStartMs],
  );
  const endLabel = useMemo(
    () => `Race ended ${formatDayMonth(targetEndMs)}, ${formatClockMs(targetEndMs)}`,
    [targetEndMs],
  );
  return (
      <div
        className={`cut flex min-w-[240px] flex-col justify-center gap-0.5 px-[22px] py-3.5 ${
          phase === 'live'
            ? 'bg-w2w-red text-on-accent'
            : 'bg-ds-panel text-ds-ink shadow-[inset_0_-3px_0_var(--color-w2w-red)]'
        }`}
        role="timer"
        aria-label="Race clock"
      >
        <span
          className={`flex items-center gap-2 text-[13px] font-semibold ${phase === 'live' ? 'text-on-accent' : 'text-ds-muted'}`}
        >
          {phase === 'live' && (
            <>
              <style>{'@keyframes w2w-live-pulse{0%,100%{opacity:1}50%{opacity:.35}}'}</style>
              <span
                className="h-2 w-2 -skew-x-[20deg] bg-on-accent"
                style={{ animation: 'w2w-live-pulse 1.4s infinite' }}
                aria-hidden="true"
              />
            </>
          )}
          {phase === 'before' ? 'Green flag in' : phase === 'live' ? 'Live · race time' : 'Chequered flag'}
        </span>
        <span className="num text-[34px] leading-[1.1]">
          {phase === 'before'
            ? formatCountdown(raceStartMs - nowMs)
            : phase === 'live'
              ? formatElapsed(nowMs - raceStartMs)
              : 'Finished'}
        </span>
        <span className="text-xs opacity-80">
          {phase === 'before' ? startLabel : phase === 'live' ? liveClockSubline(clockRows, nowMs) : endLabel}
        </span>
      </div>
  );
}

/** Someone who can be given a stint: a signed-up member, a roster guest or a dummy placeholder. */
interface PlanDriver {
  userId: string;
  availableHours: string[];
  kind: 'member' | 'guest' | 'dummy';
}

interface StintPatch {
  driverUserId?: string | null;
  tyreChange?: boolean;
  tyresChanged?: number;
  wetOverride?: boolean | null;
}

interface StintRowProps {
  row: PlanRow;
  index: number;
  isLast: boolean;
  isActive: boolean;
  isLocked: boolean;
  /** The first stint still to start (and not started by hand) — the one "Start now" belongs to. */
  isNext: boolean;
  color: DriverColor;
  driverLabel: string;
  isAdmin: boolean;
  busy: boolean;
  isLmu: boolean;
  simStartTimeOfDay: string | null;
  driverTimezone: string | null;
  planDrivers: PlanDriver[];
  driverNames: Record<string, string>;
  onStintChange: (stint: EventTeamStint, patch: StintPatch) => void;
  onStartNow: (stint: EventTeamStint) => void;
  onMove: (stint: EventTeamStint, direction: 'up' | 'down') => void;
  onDelete: (stint: EventTeamStint) => void;
  onSelectFocus: () => void;
  onSelectDone: () => void;
}

/** One row of the strategy table. Memoised: with stable props (the page memoises the rows and
 * wraps every handler in useCallback), a clock tick only re-renders the rows whose active/locked
 * flags actually changed instead of the whole table. */
const StintRow = memo(function StintRow({
  row,
  index,
  isLast,
  isActive,
  isLocked,
  isNext,
  color,
  driverLabel,
  isAdmin,
  busy,
  isLmu,
  simStartTimeOfDay,
  driverTimezone,
  planDrivers,
  driverNames,
  onStintChange,
  onStartNow,
  onMove,
  onDelete,
  onSelectFocus,
  onSelectDone,
}: StintRowProps) {
  const { stint, startMs, startOffsetMinutes, durationMinutes, pitBeforeMinutes, estLaps, weatherPoint, isWetStint, availabilityWarning } =
    row;
  const endMs = startMs !== null ? startMs + durationMinutes * 60_000 : null;
  const simStart = simStartTimeOfDay ? addMinutesToTimeOfDay(simStartTimeOfDay, startOffsetMinutes) : null;
  const driverStart = startMs !== null && driverTimezone ? formatInTimezone(startMs, driverTimezone) : null;
  // The board hides the reorder arrows on the live and next rows (those get the
  // LIVE tag / Start now button instead).
  const showReorder = !isActive && !isNext;

  return (
    <tr
      className={`row-hover border-t border-ds-line align-middle ${isActive ? 'bg-w2w-red/[0.12]' : ''} ${isLocked ? 'opacity-[0.55]' : ''}`}
    >
      <td className={`num py-2.5 pl-5 pr-3 text-base ${isActive ? 'shadow-[inset_3px_0_0_var(--color-w2w-red)]' : ''}`}>
        {index + 1}
      </td>
      <td className="py-2.5 px-2">
        {isAdmin ? (
          <div className="relative inline-flex items-center">
            <span className={`absolute left-3 w-2.5 h-2.5 shrink-0 ${color.dot}`} aria-hidden="true" />
            <select
              value={stint.driverUserId ?? ''}
              onFocus={onSelectFocus}
              onBlur={onSelectDone}
              onChange={(e) => {
                onSelectDone();
                onStintChange(stint, { driverUserId: e.target.value || null });
              }}
              disabled={busy || isLocked}
              className="input min-h-9 w-auto min-w-[150px] appearance-none pl-8 pr-8 text-[13px] font-semibold"
            >
              <option value="">Unassigned</option>
              {planDrivers.map((d) => (
                <option key={d.userId} value={d.userId}>
                  {driverNames[d.userId] ?? 'Unknown driver'}
                  {d.kind !== 'member' ? ` (${d.kind})` : ''}
                </option>
              ))}
            </select>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="square"
              className="pointer-events-none absolute right-3 text-ds-dim"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        ) : (
          <span className="cut-sm inline-flex min-h-9 items-center gap-2 bg-ds-field px-3 font-semibold whitespace-nowrap">
            <span className={`w-2.5 h-2.5 shrink-0 ${color.dot}`} aria-hidden="true" />
            {driverLabel}
          </span>
        )}
        {availabilityWarning && <p className="text-ds-warn text-[11px] mt-1">Not marked available at this time</p>}
      </td>
      <td className="py-2.5 px-2 whitespace-nowrap tabular-nums">
        <span className="font-semibold">
          {startMs !== null && endMs !== null ? `${formatClockMs(startMs)} to ${formatClockMs(endMs)}` : '—'}
        </span>{' '}
        <span className="text-ds-muted">({formatMinutesSeconds(durationMinutes)})</span>
      </td>
      <td className="py-2.5 px-2">
        {index === 0 ? (
          <span className="cut-xs inline-flex min-h-8 min-w-[76px] items-center justify-center bg-ds-field px-3 text-xs font-bold uppercase text-ds-muted">
            Start
          </span>
        ) : isLmu ? (
          <div
            className="cut-xs inline-flex gap-0.5 bg-ds-field p-[3px]"
            role="group"
            aria-label="Tyres changed at this stop"
            title={`+${formatMinutesSeconds(pitBeforeMinutes)} pit`}
          >
            {[0, 1, 2, 3, 4].map((count) => {
              const selected = tyresChangedOf(stint) === count;
              return (
                <button
                  key={count}
                  type="button"
                  aria-pressed={selected}
                  aria-label={count === 0 ? 'Keep all tyres' : `Change ${count} ${count === 1 ? 'tyre' : 'tyres'}`}
                  onClick={() => onStintChange(stint, { tyresChanged: count })}
                  disabled={busy || isLocked || !isAdmin}
                  className={`num min-h-7 min-w-6 px-1.5 text-xs disabled:cursor-default ${
                    isAdmin ? 'disabled:opacity-40' : ''
                  } ${
                    selected
                      ? 'bg-ds-control text-w2w-red-ink shadow-[inset_0_-2px_0_var(--color-w2w-red)]'
                      : `bg-transparent text-ds-muted ${isAdmin ? 'hover:text-ds-ink' : ''}`
                  }`}
                >
                  {count}
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            aria-pressed={stint.tyreChange}
            title={`+${formatMinutesSeconds(pitBeforeMinutes)} pit`}
            disabled={busy || isLocked || !isAdmin}
            onClick={() => onStintChange(stint, { tyreChange: !stint.tyreChange })}
            className={`cut-xs inline-flex min-h-8 min-w-[76px] items-center justify-center px-3 text-xs font-bold uppercase disabled:cursor-default ${
              stint.tyreChange
                ? 'bg-ds-control text-w2w-red-ink shadow-[inset_0_-2px_0_var(--color-w2w-red)]'
                : 'bg-ds-field text-ds-muted'
            }`}
          >
            {stint.tyreChange ? 'Change' : 'Keep'}
          </button>
        )}
      </td>
      <td className="py-2.5 px-2 text-ds-ink-soft whitespace-nowrap tabular-nums">{simStart ?? '—'}</td>
      <td className="py-2.5 px-2 text-ds-ink-soft whitespace-nowrap tabular-nums">{driverStart ?? '—'}</td>
      <td className="py-2.5 px-2 whitespace-nowrap">
        <div
          className="cut-xs inline-flex gap-0.5 bg-ds-field p-[3px]"
          role="group"
          aria-label="Wet/dry override"
          title={weatherPoint ? formatWeatherPoint(weatherPoint) : undefined}
        >
          {(
            [
              { label: 'Auto', value: null },
              { label: 'Dry', value: false },
              { label: 'Wet', value: true },
            ] as const
          ).map((opt) => {
            const selected = stint.wetOverride === opt.value;
            const wetLook = selected && (opt.value === true || (opt.value === null && isWetStint));
            return (
              <button
                key={opt.label}
                type="button"
                aria-pressed={selected}
                onClick={() => onStintChange(stint, { wetOverride: opt.value })}
                disabled={busy || isLocked || !isAdmin}
                className={`min-h-7 px-2.5 text-xs font-bold disabled:cursor-default ${
                  isAdmin ? 'disabled:opacity-40' : ''
                } ${
                  selected
                    ? wetLook
                      ? 'bg-[#0c4a6e] text-[#bae6fd] shadow-[inset_0_-2px_0_#38bdf8]'
                      : 'bg-ds-control text-ds-ink shadow-[inset_0_-2px_0_var(--color-w2w-red)]'
                    : `bg-transparent text-ds-muted ${isAdmin ? 'hover:text-ds-ink' : ''}`
                }`}
              >
                {opt.value === null && isWetStint && selected ? 'Auto · wet' : opt.label}
              </button>
            );
          })}
        </div>
      </td>
      <td className="num py-2.5 px-2 text-right text-base">{estLaps ?? '—'}</td>
      <td className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">
        <div className="inline-flex items-center justify-end gap-1">
          {isActive && (
            <span className="slant mr-1 inline-block bg-on-accent px-3.5 py-1 text-[11px] font-extrabold uppercase text-[#111113]">
              Live
            </span>
          )}
          {isAdmin && isNext && !isLocked && (
            <button
              type="button"
              onClick={() => onStartNow(stint)}
              disabled={busy}
              className="btn-primary btn-sm mr-1 min-h-[34px]"
            >
              Start now
            </button>
          )}
          {isAdmin && stint.actualStartAt && !isLocked && (
            <button
              type="button"
              onClick={() => onStartNow(stint)}
              disabled={busy}
              title="Clear the recorded start time"
              className="cut-xs inline-flex h-8 items-center px-2.5 text-[11px] font-extrabold uppercase text-ds-muted hover:bg-ds-control-hover hover:text-ds-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ds-muted"
            >
              Undo start
            </button>
          )}
          {isAdmin && showReorder && (
            <>
              <button
                type="button"
                onClick={() => onMove(stint, 'up')}
                disabled={busy || index === 0 || isLocked}
                className="cut-xs inline-flex h-[34px] w-[34px] items-center justify-center text-ds-muted hover:bg-ds-control-hover disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Move stint up"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
                  <path d="M6 15l6-6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onMove(stint, 'down')}
                disabled={busy || isLast || isLocked}
                className="cut-xs inline-flex h-[34px] w-[34px] items-center justify-center text-ds-muted hover:bg-ds-control-hover disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Move stint down"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onDelete(stint)}
              disabled={busy || isLocked}
              className="cut-xs inline-flex h-[34px] items-center px-2.5 text-[11px] font-extrabold uppercase text-ds-muted hover:bg-ds-control-hover hover:text-ds-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ds-muted"
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

/** The plan inputs that load through separate requests. A past stint is frozen (see frozenRowsRef)
 * only once ALL of these have finished their first load, so a snapshot is never taken from a
 * half-loaded page (no tank size, no driver pace, no forecast ...). */
type LoadSource =
  | 'event'
  | 'team'
  | 'stints'
  | 'driverSettings'
  | 'dummyDrivers'
  | 'drivers'
  | 'weather'
  | 'car'
  // The settings form / fuel-limit field are seeded from team/event by effects, i.e. one render
  // AFTER those arrive — these mark that seeding as done.
  | 'settings'
  | 'fuelLimit';
const ALL_LOAD_SOURCES: readonly LoadSource[] = [
  'event',
  'team',
  'stints',
  'driverSettings',
  'dummyDrivers',
  'drivers',
  'weather',
  'car',
  'settings',
  'fuelLimit',
];

interface CarInfo {
  tankCapacityLiters: number | null;
  fuelUsagePerLapLiters?: string;
  pitstopDrivethroughSeconds?: string;
}
const NO_CAR_INFO: CarInfo = { tankCapacityLiters: null };

interface PlanInputs {
  stints: EventTeamStint[];
  /** Snapshots of locked rows, replayed verbatim (read-only here). */
  frozen: ReadonlyMap<string, PlanRow>;
  raceStartMs: number | null;
  timeslotStartMs: number | null;
  targetEndMs: number | null;
  refuelMinutes: number;
  driveMinutes: number;
  tyreMinutes: number;
  isLmu: boolean;
  tyreSecondsRaw: number | null;
  partialTyreSeconds: number | null;
  weatherPoints: WeatherForecastPoint[];
  driverSettingsByUserId: Record<string, EventTeamDriverSettings>;
  lapTimeDrySeconds: number | null;
  lapTimeWetSeconds: number | null;
  fuelUsagePerLap: number | null;
  tankCapacityLiters: number | null;
  formationLapFuelLiters: number;
  planDriverById: ReadonlyMap<string, PlanDriver>;
}

interface PlanResult {
  /** Every stint's computed row, in order (including any past the one that closes the race). */
  rows: PlanRow[];
  closingIndex: number;
  /** What the table and timeline render: rows up to and including the one that closes the race. */
  displayRows: PlanRow[];
  /** Trailing rows past the close that still have a driver — surfaced separately for an admin. */
  orphanedRows: PlanRow[];
  plannedMinutes: number;
  hasTrailingExcess: boolean;
  lastStintId: string | null;
  lastStintDriverUserId: string | null;
  lastRowStartMs: number | null;
}

/** The whole stint-schedule cascade as a pure function of its inputs (the page memoises it, so it
 * re-runs only when an input changes, never because the clock ticked). */
function computePlan(input: PlanInputs): PlanResult {
  const {
    stints,
    frozen,
    raceStartMs,
    timeslotStartMs,
    targetEndMs,
    refuelMinutes,
    driveMinutes,
    tyreMinutes,
    isLmu,
    tyreSecondsRaw,
    partialTyreSeconds,
    weatherPoints,
    driverSettingsByUserId,
    lapTimeDrySeconds,
    lapTimeWetSeconds,
    fuelUsagePerLap,
    tankCapacityLiters,
    formationLapFuelLiters,
    planDriverById,
  } = input;

  /** Tyre portion of the stop before `stint`, in minutes. iRacing: the all-or-nothing tyreChange
   * toggle -> full tyre time. LMU: per tyre — 0 -> 0, 1-2 -> partial time, 3-4 -> full time. */
  const tyreStopMinutes = (stint: EventTeamStint): number =>
    isLmu
      ? lmuTyreStopSeconds(tyresChangedOf(stint), tyreSecondsRaw ?? 0, partialTyreSeconds) / 60
      : stint.tyreChange
        ? tyreMinutes
        : 0;

  // Absolute-ms cursor rather than a minutes offset: whenever a stint has a recorded actualStartAt
  // (the "Start Now" button), it re-anchors every later stint's derived start to that real moment
  // instead of continuing the theoretical plan — a stint running short or long naturally shifts
  // everything after it.
  let cursorMs = raceStartMs;
  const rows: PlanRow[] = stints.map((stint, index) => {
    const frozenRow = frozen.get(stint.id);
    let baseRow: PlanRow;

    if (frozenRow) {
      // Locked: replay the snapshot verbatim rather than recomputing anything from current
      // settings/driver/weather inputs.
      baseRow = frozenRow;
    } else {
      // No pit stop before the very first stint of the race — every later stint pays whatever pit
      // time its own tyreChange toggle calls for (a "splash and go" skips the tyre-change portion).
      const pitBeforeMinutes = index === 0 ? 0 : refuelMinutes + driveMinutes + tyreStopMinutes(stint);
      const theoreticalStartMs = cursorMs !== null ? cursorMs + pitBeforeMinutes * 60_000 : null;
      const actualStartMs = stint.actualStartAt ? new Date(stint.actualStartAt).getTime() : null;
      const startMs = actualStartMs ?? theoreticalStartMs;
      // Sim Time / weather sampling stay measured from the race's own start, not from wherever the
      // cursor last re-anchored, so they keep meaning "how far into the race are we" throughout.
      const startOffsetMinutes = startMs !== null && raceStartMs !== null ? (startMs - raceStartMs) / 60_000 : 0;

      const storedDurationMinutes = parseDecimal(stint.durationMinutes) ?? 0;

      // Weather is sampled at the stint's start (not its midpoint) — duration itself depends on
      // which pace applies, so the midpoint can't be known until duration is, and start is a
      // reasonable stand-in for "what conditions this stint runs in".
      const weatherPoint = nearestWeatherPoint(weatherPoints, startOffsetMinutes);
      // The stint's own manual override wins when set; otherwise 30%+ rain chance at the stint's
      // start is treated as a wet stint for pace purposes.
      const isWetStint = stint.wetOverride ?? (weatherPoint !== null && weatherPoint.precip_chance >= 3000);

      // A driver's own pace/fuel figures override the team baseline once they're actually
      // assigned — dry vs wet is picked per the stint's own weather, not just always dry.
      const driverSettingsForStint = stint.driverUserId ? driverSettingsByUserId[stint.driverUserId] : undefined;
      const driverLapTimeDry = parseDecimal(driverSettingsForStint?.lapTimeDrySeconds ?? null);
      const driverLapTimeWet = parseDecimal(driverSettingsForStint?.lapTimeWetSeconds ?? null);
      const effectiveLapTime = isWetStint
        ? (driverLapTimeWet ?? lapTimeWetSeconds ?? driverLapTimeDry ?? lapTimeDrySeconds)
        : (driverLapTimeDry ?? lapTimeDrySeconds);

      const driverFuelUsage = parseDecimal(driverSettingsForStint?.fuelUsagePerLapLiters ?? null);
      const effectiveFuelUsage = driverFuelUsage ?? fuelUsagePerLap;
      // The formation lap burns fuel before the race (and this stint's fuel window) even starts —
      // only the first stint pays for it out of its own tank; every later stint begins from a
      // full tank at pit exit, no formation lap involved.
      const usableTankLiters =
        tankCapacityLiters !== null
          ? index === 0
            ? Math.max(0, tankCapacityLiters - formationLapFuelLiters)
            : tankCapacityLiters
          : null;
      const fuelLimitedLaps =
        usableTankLiters !== null && effectiveFuelUsage && effectiveFuelUsage > 0
          ? Math.floor(usableTankLiters / effectiveFuelUsage)
          : null;

      // A stint's length IS a full tank of fuel at this driver's pace — recalculated live from
      // whichever driver is assigned (or the team baseline, unassigned) and whatever the weather
      // is at that point in the race, never a manually stored number. Falls back to the stored
      // value only if fuel/pace data isn't available yet to compute it.
      const fuelTankDurationMinutes =
        fuelLimitedLaps !== null && effectiveLapTime && effectiveLapTime > 0
          ? (fuelLimitedLaps * effectiveLapTime) / 60
          : null;

      // If the NEXT stint has a real "Start Now" recorded, this stint's own real end coincides
      // with it — the driver got out exactly when the next one got in. That's a matter of recorded
      // fact now, not projection, so it overrides the fuel-tank/theoretical duration — but only
      // when that actually produces a stint that still runs forward in time. This stint's own
      // startMs is still a live, recalculated guess (unless it has its own actualStartAt too), so
      // an unrelated upstream change (another driver's fuel setting, say) can push it later than
      // the next stint's already-recorded real start. Forcing the override then would clamp to a
      // zero/negative-length stint and squeeze the whole cascade around it — falling back to the
      // normal live duration instead just leaves this one stint showing its ordinary estimate
      // until its own timing settles back to something consistent with what already happened.
      const nextStint = stints[index + 1];
      const nextActualStartMs = nextStint?.actualStartAt ? new Date(nextStint.actualStartAt).getTime() : null;
      const durationMinutes =
        nextActualStartMs !== null && startMs !== null && nextActualStartMs > startMs
          ? (nextActualStartMs - startMs) / 60_000
          : (fuelTankDurationMinutes ?? storedDurationMinutes);

      const estLaps = effectiveLapTime && effectiveLapTime > 0 ? Math.floor((durationMinutes * 60) / effectiveLapTime) : null;

      const planDriver = stint.driverUserId ? planDriverById.get(stint.driverUserId) : undefined;
      const hours =
        startMs !== null && timeslotStartMs !== null
          ? overlappingRaceHours(timeslotStartMs, startMs, startMs + (durationMinutes || 60) * 60_000)
          : [];
      // Warn only if some hour the stint actually spans is unmarked — a stint fully inside one
      // marked hour (e.g. 09:00–09:47 when only 09:00 is flagged) must not warn.
      const availabilityWarning =
        planDriver &&
        planDriver.availableHours.length > 0 &&
        hours.length > 0 &&
        !hours.every((h) => planDriver.availableHours.includes(h));

      baseRow = {
        stint,
        startMs,
        startOffsetMinutes,
        durationMinutes,
        pitBeforeMinutes,
        estLaps,
        weatherPoint,
        isWetStint,
        availabilityWarning,
      };
    }

    cursorMs = baseRow.startMs !== null ? baseRow.startMs + baseRow.durationMinutes * 60_000 : cursorMs;
    return baseRow;
  });

  // The stint that actually closes the race is whichever one's own natural (untrimmed) span is the
  // FIRST to reach the race's actual end — not necessarily the array's last element. A driver with
  // a long fuel range assigned mid-plan can single-handedly cover the rest of the race; everything
  // still sitting after that point in the array is unconditionally unnecessary, whether or not it's
  // been cleaned up yet. (Trimming only the literal last element, as this used to do, left an
  // assigned stint like that stuck at its full un-trimmed length while trailing filler piled up
  // after it — and once that filler's own start already passed target, isExcess based on the tail
  // alone couldn't fire either, since the tail could be that unrelated assigned stint.)
  const closingIndex =
    targetEndMs !== null
      ? rows.findIndex((r) => r.startMs !== null && r.startMs + r.durationMinutes * 60_000 >= targetEndMs)
      : -1;
  if (closingIndex !== -1 && targetEndMs !== null) {
    const closingRow = rows[closingIndex];
    if (closingRow.startMs !== null) {
      const naturalEndMs = closingRow.startMs + closingRow.durationMinutes * 60_000;
      if (naturalEndMs > targetEndMs) {
        rows[closingIndex] = { ...closingRow, durationMinutes: Math.max(0, (targetEndMs - closingRow.startMs) / 60_000) };
      }
    }
  }

  // What the table and timeline actually render: no stint may ever be shown starting after
  // raceStart + raceLength, full stop — trailing stints past the one that closes the race are cut
  // from the *display* immediately, rather than waiting for the auto-cleanup effect's delete call
  // to round-trip. This applies unconditionally, including a stint that happens to have a real
  // driver assigned — the race physically cannot contain a stint starting after it's already over,
  // so it can't be rendered as an ordinary row implying it will happen. It isn't silently deleted,
  // though: orphanedRows surfaces it separately so an admin can still see and resolve it.
  const trailingExcessRows = closingIndex !== -1 ? rows.slice(closingIndex + 1) : [];
  const displayRows = closingIndex !== -1 ? rows.slice(0, closingIndex + 1) : rows;
  const orphanedRows = trailingExcessRows.filter((r) => r.stint.driverUserId !== null);

  // "Planned" total is measured to whichever stint actually closes the race (see closingIndex
  // above), not blindly to the array's last element — trailing excess past that point shouldn't
  // count toward it, or the shortfall/excess check would never see it as excess at all.
  const effectiveLastRow = closingIndex !== -1 ? rows[closingIndex] : rows.length > 0 ? rows[rows.length - 1] : null;
  const plannedMinutes =
    effectiveLastRow?.startMs !== null && effectiveLastRow?.startMs !== undefined && raceStartMs !== null
      ? (effectiveLastRow.startMs + effectiveLastRow.durationMinutes * 60_000 - raceStartMs) / 60_000
      : 0;

  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
  return {
    rows,
    closingIndex,
    displayRows,
    orphanedRows,
    plannedMinutes,
    // True once the array holds more stints than the schedule actually needs — the closing stint
    // (whichever one first reaches the race's end) plus anything after it, regardless of whether
    // that trailing extra happens to still be sitting past target too.
    hasTrailingExcess: closingIndex !== -1 && closingIndex < rows.length - 1,
    lastStintId: lastRow?.stint.id ?? null,
    lastStintDriverUserId: lastRow?.stint.driverUserId ?? null,
    lastRowStartMs: lastRow?.startMs ?? null,
  };
}

export default function EventTeamPlanPage() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const confirm = useConfirm();
  const [event, setEvent] = useState<RaceEventDetail | null>(null);
  const [team, setTeam] = useState<EventTeam | null>(null);
  const [stints, setStints] = useState<EventTeamStint[]>([]);
  // The team's car, fetched once per car id: supplies the tank size, the per-track fuel/pit
  // defaults and the name shown in the header (so no separate cars-list request is needed).
  const [car, setCar] = useState<CarDetail | null>(null);
  const [realDriverNames, setRealDriverNames] = useState<Record<string, string>>({});
  // Roster entry id -> current display name, so a guest added from the Drivers roster shows the
  // roster's name even if it was renamed after being added.
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [driverTimezones, setDriverTimezones] = useState<Record<string, string | null>>({});
  // Endurance-planning flags from each driver's own profile — feeds handleGenerateFullPlan's
  // driver-assignment pass (successive-stint cap, night-driving avoidance, starting-driver pick).
  const [driverProfiles, setDriverProfiles] = useState<Record<string, DriverAssignmentProfile>>({});
  const [weatherPoints, setWeatherPoints] = useState<WeatherForecastPoint[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  // The event-wide iRacing fuel limit (% of max tank), edited here but stored on the event — every
  // team in the event races the same session, so it isn't a per-team value like the fields above.
  const [fuelLimitInput, setFuelLimitInput] = useState('');
  // LMU's event-wide tyre budget (individual tyres per car): same storage/edit pattern as above.
  const [tyreLimitInput, setTyreLimitInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error` (which reports failed actions once the page has loaded) — this instead
  // guards the initial load itself, so a failed fetch shows a real message rather than leaving
  // the page stuck on "Loading..." forever with no explanation.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'strategy' | 'availability' | 'settings'>('strategy');
  const [driverSettings, setDriverSettings] = useState<EventTeamDriverSettings[]>([]);
  const [dummyDrivers, setDummyDrivers] = useState<EventTeamDummyDriver[]>([]);
  const [newDummyName, setNewDummyName] = useState('');
  // Which plan inputs have finished their first load — see LoadSource. Cleared when the team changes.
  const [loaded, setLoaded] = useState<ReadonlySet<LoadSource>>(() => new Set());
  const markLoaded = useCallback(
    (source: LoadSource) => setLoaded((prev) => (prev.has(source) ? prev : new Set(prev).add(source))),
    [],
  );
  const inputsLoaded = ALL_LOAD_SOURCES.every((source) => loaded.has(source));
  // Drives the "active stint" row highlight and stint locking (past stints, once the next one has
  // actually started, stop being editable). It is NOT a ticking clock: it only moves when a stint
  // start/end or the race start/end is crossed (see nowBounds below), so the page doesn't
  // re-render every few seconds while nothing observable changes.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Guards the auto-fill effect below against re-entering itself — a ref rather than state so
  // setting it doesn't trigger a re-render (which would otherwise cancel the very fill it started).
  const isFillingRef = useRef(false);
  // Snapshot of every row that has ever been locked, keyed by stint id — once a stint locks (the
  // next one has actually started), its computed row is frozen here permanently rather than kept
  // live. Without this, a locked/completed stint would keep recalculating from *current* settings,
  // driver pace/fuel, and weather forever, silently rewriting history (and, for the last stint
  // specifically, could drift off the exact raceStart+raceLength close once it's no longer being
  // freshly trimmed against live inputs on every render). Only filled once every plan input has
  // loaded, pruned of deleted stints, and cleared when the team changes.
  const frozenRowsRef = useRef<Map<string, PlanRow>>(new Map());
  // Circuit breaker for that same effect: counts consecutive automatic add/remove passes and stops
  // acting past a generous cap, in case some combination of settings ever makes add and remove
  // keep undoing each other — a bounded loop with an error beats a silent infinite one.
  const autoAdjustCountRef = useRef(0);
  // Fields the local user has typed into but not saved yet. A live refetch re-seeds the form from
  // the server, and must not overwrite what's being typed — see the seed effects below.
  const dirtySettingsRef = useRef<Set<string>>(new Set());
  const fuelLimitDirtyRef = useRef(false);
  const tyreLimitDirtyRef = useRef(false);
  // A settings/fuel-limit/tyre-limit save is in flight; and a counter bumped whenever editing
  // settles (saved, failed or abandoned) so the auto-fill effect — which holds off while any of
  // those are unsettled — runs again against the final values.
  const settingsSavingRef = useRef(false);
  const [settingsEditTick, setSettingsEditTick] = useState(0);
  // The per-driver pace/fuel inputs are uncontrolled (defaultValue); they're keyed by their saved
  // value so a remote change shows up, except the one being edited, whose key is held constant.
  const [lockedDriverInput, setLockedDriverInput] = useState<{ field: string; key: string } | null>(null);

  // Request tokens: a response is applied only if no newer request of the same kind (or a team
  // change) happened since — a slow, older response can never overwrite a newer one.
  const teamReqRef = useRef(0);
  const stintsReqRef = useRef(0);
  const stintsLatestRef = useRef<Promise<void> | null>(null);
  const eventReqRef = useRef(0);
  const dummyReqRef = useRef(0);
  const settingsReqRef = useRef(0);

  // quiet = a background live refresh: a failure or a vanished team must not blank the whole page.
  const loadTeam = useCallback(
    (quiet = false) => {
      if (!id || !teamId) return;
      const token = ++teamReqRef.current;
      void eventTeamsApi
        .get(id, teamId)
        .then((found) => {
          if (token !== teamReqRef.current) return;
          setIfChanged<EventTeam | null>(setTeam, found);
          markLoaded('team');
        })
        .catch((err: unknown) => {
          if (token !== teamReqRef.current) return;
          if (!quiet) setLoadError(err instanceof ApiError ? err.message : 'Failed to load team');
        });
    },
    [id, teamId, markLoaded],
  );
  // Returns the in-flight fetch (rather than firing-and-forgetting it) so callers that need to
  // know `stints` has actually refreshed — not just that a refetch was kicked off — can await it.
  // If a newer request overtakes this one, the returned promise waits for that one instead, so
  // "awaited" still means "the freshest list has landed".
  const loadStints = useCallback((): Promise<void> => {
    if (!id || !teamId) return Promise.resolve();
    const token = ++stintsReqRef.current;
    const run: Promise<void> = eventTeamStintsApi.list(id, teamId).then((list) => {
      if (token !== stintsReqRef.current) return;
      setIfChanged(setStints, list);
      markLoaded('stints');
    });
    stintsLatestRef.current = run;
    return run.then(() => (stintsLatestRef.current === run ? undefined : (stintsLatestRef.current ?? undefined)));
  }, [id, teamId, markLoaded]);
  const loadDriverSettings = useCallback(() => {
    if (!id || !teamId) return;
    const token = ++settingsReqRef.current;
    void eventTeamDriverSettingsApi
      .list(id, teamId)
      .then((list) => {
        if (token !== settingsReqRef.current) return;
        setIfChanged(setDriverSettings, list);
        markLoaded('driverSettings');
      })
      .catch(() => undefined);
  }, [id, teamId, markLoaded]);
  const loadDummyDrivers = useCallback(() => {
    if (!id || !teamId) return;
    const token = ++dummyReqRef.current;
    void eventTeamDummyDriversApi
      .list(id, teamId)
      .then((list) => {
        if (token !== dummyReqRef.current) return;
        setIfChanged(setDummyDrivers, list);
        markLoaded('dummyDrivers');
      })
      .catch(() => undefined);
  }, [id, teamId, markLoaded]);
  // `initial` = the page's first load, where a failure is reported; later refreshes are silent.
  const refreshEvent = useCallback(
    (initial = false) => {
      if (!id) return;
      const token = ++eventReqRef.current;
      void eventsApi
        .getById(id)
        .then((fresh) => {
          if (token !== eventReqRef.current) return;
          setIfChanged<RaceEventDetail | null>(setEvent, fresh);
          markLoaded('event');
        })
        .catch((err: unknown) => {
          if (token !== eventReqRef.current) return;
          if (initial) setLoadError(err instanceof ApiError ? err.message : 'Failed to load event');
        });
    },
    [id, markLoaded],
  );

  // First load (and reload when the route switches to another team). Resets everything that
  // belonged to the previous team: in-flight responses are invalidated, the frozen-row snapshots
  // are dropped, and the "inputs loaded" set starts over.
  useEffect(() => {
    teamReqRef.current++;
    stintsReqRef.current++;
    eventReqRef.current++;
    dummyReqRef.current++;
    settingsReqRef.current++;
    frozenRowsRef.current.clear();
    autoAdjustCountRef.current = 0;
    setLoaded((prev) => (prev.size === 0 ? prev : new Set()));
    setEvent(null);
    setTeam(null);
    setStints((prev) => (prev.length === 0 ? prev : []));
    setDriverSettings((prev) => (prev.length === 0 ? prev : []));
    setDummyDrivers((prev) => (prev.length === 0 ? prev : []));
    setLoadError(null);

    refreshEvent(true);
    loadTeam();
    loadStints().catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Failed to load stints'));
    loadDriverSettings();
    loadDummyDrivers();
  }, [id, teamId, refreshEvent, loadTeam, loadStints, loadDriverSettings, loadDummyDrivers]);

  useEffect(() => {
    let cancelled = false;
    void driversApi
      .list()
      .then((drivers) => {
        if (cancelled) return;
        setIfChanged(setRealDriverNames, Object.fromEntries(drivers.map((d) => [d.userId, d.iracingName ?? d.displayName])));
        setIfChanged(setProfileNames, Object.fromEntries(drivers.map((d) => [d.id, d.iracingName ?? d.displayName])));
        setIfChanged(setDriverTimezones, Object.fromEntries(drivers.map((d) => [d.userId, d.timezone ?? null])));
        setIfChanged(
          setDriverProfiles,
          Object.fromEntries(drivers.map((d) => [d.userId, { startingDriver: d.startingDriver }])),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load the driver roster');
      })
      // Names, timezones and flags don't feed the schedule maths, so a failed roster must not keep
      // the plan from ever freezing its past stints — the first attempt having finished is enough.
      .finally(() => {
        if (!cancelled) markLoaded('drivers');
      });
    return () => {
      cancelled = true;
    };
  }, [id, teamId, markLoaded]);

  // Weather-per-stint only exists when this event is linked to a specific iRacing series week.
  const eventLoaded = event !== null;
  const fuelLimitPercentSaved = event?.fuelLimitPercent ?? null;
  const iracingSeasonId = event?.iracingSeasonId ?? null;
  const iracingRaceWeekNum = event?.iracingRaceWeekNum ?? null;
  useEffect(() => {
    if (!eventLoaded) return;
    if (iracingSeasonId === null || iracingRaceWeekNum === null) {
      setWeatherPoints((prev) => (prev.length === 0 ? prev : []));
      markLoaded('weather');
      return;
    }
    let cancelled = false;
    void iracingSeriesApi
      .getWeatherForecast(iracingSeasonId, iracingRaceWeekNum)
      .then((points) => {
        if (!cancelled) setIfChanged(setWeatherPoints, points);
      })
      .catch(() => {
        if (!cancelled) setWeatherPoints((prev) => (prev.length === 0 ? prev : []));
      })
      .finally(() => {
        if (!cancelled) markLoaded('weather');
      });
    return () => {
      cancelled = true;
    };
  }, [eventLoaded, iracingSeasonId, iracingRaceWeekNum, markLoaded]);

  // Seed the settings form from the team's saved values whenever they arrive/change — lap times
  // display as mm:ss.ms text, everything else as a plain number.
  useEffect(() => {
    if (!team) return;
    const fresh: Record<string, string> = {
      refuelDurationSeconds: team.refuelDurationSeconds ?? '',
      tyreChangeDurationSeconds: team.tyreChangeDurationSeconds ?? '',
      partialTyreChangeSeconds: team.partialTyreChangeSeconds ?? '',
      pitstopDrivethroughSeconds: team.pitstopDrivethroughSeconds ?? '',
      lapTimeDrySeconds: formatSecondsAsLapTime(parseDecimal(team.lapTimeDrySeconds)),
      lapTimeWetSeconds: formatSecondsAsLapTime(parseDecimal(team.lapTimeWetSeconds)),
      fuelUsagePerLapLiters: team.fuelUsagePerLapLiters ?? '',
      raceStartOffsetMinutes: team.raceStartOffsetMinutes ?? '',
      formationLapFuelLiters: team.formationLapFuelLiters ?? '',
      fuelTankCapacityLiters: team.fuelTankCapacityLiters ?? '',
      simStartTimeOfDay: team.simStartTimeOfDay ?? '',
    };
    // Keep whatever the local user is mid-way through typing; everything else follows the server.
    setSettings((prev) => {
      const dirty = dirtySettingsRef.current;
      if (dirty.size === 0) return fresh;
      const merged = { ...fresh };
      for (const key of dirty) if (key in prev) merged[key] = prev[key];
      return merged;
    });
    markLoaded('settings');
  }, [team, markLoaded]);

  useEffect(() => {
    if (!eventLoaded) return;
    // Being typed — a live refetch must not overwrite it.
    if (!fuelLimitDirtyRef.current) {
      setFuelLimitInput(fuelLimitPercentSaved != null ? String(Number(fuelLimitPercentSaved)) : '');
    }
    markLoaded('fuelLimit');
  }, [eventLoaded, fuelLimitPercentSaved, markLoaded]);

  useEffect(() => {
    if (tyreLimitDirtyRef.current) return; // being typed — a live refetch must not overwrite it
    setTyreLimitInput(event?.tyreLimit != null ? String(event.tyreLimit) : '');
  }, [event?.tyreLimit]);

  // Pull the car (tank size + this car's per-track fuel/pit defaults) from the Cars module — a head
  // start when the team hasn't set its own fuel/pit values yet, not a hard override. Depends on
  // the car id only; the per-track lookup below follows the event's track without a refetch.
  const teamLoaded = team !== null;
  const carId = team?.carId ?? null;
  useEffect(() => {
    if (!teamLoaded) return;
    if (!carId) {
      setCar(null);
      markLoaded('car');
      return;
    }
    let cancelled = false;
    void carsApi
      .getById(carId)
      .then((fetched) => {
        if (!cancelled) setCar(fetched);
      })
      .catch(() => {
        if (!cancelled) setCar(null);
      })
      .finally(() => {
        if (!cancelled) markLoaded('car');
      });
    return () => {
      cancelled = true;
    };
  }, [teamLoaded, carId, markLoaded]);
  const eventTrackId = event?.trackId ?? null;
  const carInfo = useMemo<CarInfo>(() => {
    if (!car) return NO_CAR_INFO;
    const setup = eventTrackId !== null ? (car.trackSetups ?? []).find((s) => s.trackId === eventTrackId) : undefined;
    return {
      tankCapacityLiters: parseDecimal(car.tankCapacityLiters),
      fuelUsagePerLapLiters: setup?.fuelPerLapLiters ?? undefined,
      pitstopDrivethroughSeconds: setup?.pitLaneTimeSeconds ?? undefined,
    };
  }, [car, eventTrackId]);

  const teamMembers = useMemo(
    () => (event?.signups ?? []).filter((s) => s.eventTeamId === teamId && s.status !== 'CANCELLED'),
    [event, teamId],
  );

  // Everyone who can be given a stint on this team: the signed-up members assigned to it, plus any
  // dummy placeholders an admin added. A dummy's own id fills the driver-id slot a member's userId
  // does, so stints, per-driver settings and colours need no special-casing beyond this list.
  const planDrivers = useMemo<PlanDriver[]>(
    () => [
      ...teamMembers.map((s) => ({ userId: s.userId, availableHours: s.availableHours, kind: 'member' as const })),
      ...dummyDrivers.map((d) => ({
        userId: d.id,
        availableHours: d.availableHours,
        kind: d.driverProfileId ? ('guest' as const) : ('dummy' as const),
      })),
    ],
    [teamMembers, dummyDrivers],
  );
  const planDriverById = useMemo(() => new Map(planDrivers.map((d) => [d.userId, d])), [planDrivers]);
  const driverNames = useMemo(
    () => ({
      ...realDriverNames,
      ...Object.fromEntries(
        dummyDrivers.map((d) => [d.id, (d.driverProfileId ? profileNames[d.driverProfileId] : undefined) ?? d.name]),
      ),
    }),
    [realDriverNames, dummyDrivers, profileNames],
  );

  // ---- Live updates -------------------------------------------------------------------------
  // Another user's edits arrive as a small change notice over SSE (see useLivePlan); we then
  // refetch through the same loaders the page already uses — no data travels on the stream, and a
  // refresh never writes anything. Each kind refetches only what it can have changed:
  //   stints  -> the stint list            team    -> the team row (one-team endpoint)
  //   drivers -> signups (event), guest drivers, per-driver pace — NOT the stint rows, which a
  //              signup/availability/pace change doesn't touch (a guest removal also emits 'stints')
  //   event   -> the event (and the team, whose timeslot may have changed)
  const busyRef = useRef(false);
  const lastBusyEndRef = useRef(0);
  useEffect(() => {
    busyRef.current = busy;
    if (!busy) lastBusyEndRef.current = Date.now();
  }, [busy]);
  // A stint's driver <select> that's been focused but not yet changed may have its list open —
  // swapping its options/value under the user would be jarring, so a stint refresh waits for
  // change/blur (pending flag), then runs.
  const stintSelectEngagedRef = useRef(false);
  const stintRefreshPendingRef = useRef(false);
  const handleSelectFocus = useCallback(() => {
    stintSelectEngagedRef.current = true;
  }, []);
  const flushPendingStintRefresh = useCallback(() => {
    stintSelectEngagedRef.current = false;
    if (stintRefreshPendingRef.current) {
      stintRefreshPendingRef.current = false;
      void loadStints().catch(() => undefined);
    }
  }, [loadStints]);
  // Admins' auto-fill effect appends/removes stints when the plan looks short or long. While
  // someone else is mid-way through rewriting the plan it would see a half-written list and
  // fight them, so it is held off until the remote changes have been quiet for a moment.
  const remoteQuietUntilRef = useRef(0);
  const remoteQuietTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [autoFillTick, setAutoFillTick] = useState(0);
  const [liveNote, setLiveNote] = useState<{ text: string; fading: boolean } | null>(null);
  const liveNoteTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      clearTimeout(remoteQuietTimerRef.current);
      liveNoteTimersRef.current.forEach(clearTimeout);
    },
    [],
  );

  const showLiveNote = (text: string) => {
    liveNoteTimersRef.current.forEach(clearTimeout);
    setLiveNote({ text, fading: false });
    liveNoteTimersRef.current = [
      setTimeout(() => setLiveNote((n) => (n ? { ...n, fading: true } : n)), LIVE_NOTE_VISIBLE_MS),
      setTimeout(() => setLiveNote(null), LIVE_NOTE_VISIBLE_MS + 500),
    ];
  };

  const handleLiveChange = (messages: LivePlanMessage[]) => {
    if (!id || !teamId) return;
    // An empty batch is a plain resync (reconnect / long-hidden tab came back / polling fallback).
    const fromOthers = messages.filter((m) => m.byUserId === null || m.byUserId !== user?.id);
    // Our own save already refetches what it changed — skip the echo when it only concerns that.
    const justSavedLocally = busyRef.current || Date.now() - lastBusyEndRef.current < 1_500;
    if (messages.length > 0 && fromOthers.length === 0 && justSavedLocally) return;

    if (fromOthers.length > 0) {
      remoteQuietUntilRef.current = Date.now() + REMOTE_QUIET_MS;
      clearTimeout(remoteQuietTimerRef.current);
      remoteQuietTimerRef.current = setTimeout(() => setAutoFillTick((n) => n + 1), REMOTE_QUIET_MS + 50);
      const by = fromOthers[fromOthers.length - 1].byUserId;
      const name = by ? realDriverNames[by] : undefined;
      showLiveNote(name ? `Updated by ${name}` : 'Plan updated');
    }

    const kinds = new Set(messages.map((m) => m.kind));
    const all = messages.length === 0;
    if (all || kinds.has('stints')) {
      if (stintSelectEngagedRef.current) stintRefreshPendingRef.current = true;
      else void loadStints().catch(() => undefined);
    }
    if (all || kinds.has('team') || kinds.has('event')) loadTeam(true);
    if (all || kinds.has('drivers') || kinds.has('event')) refreshEvent();
    if (all || kinds.has('drivers')) {
      loadDummyDrivers();
      loadDriverSettings();
    }
  };
  const liveConnection = useLivePlan(id, teamId, handleLiveChange);

  /** Per-driver input remount key: the saved value, except while that input has focus. */
  const driverInputKey = (field: string, savedValue: string | null | undefined) =>
    `${field}:${lockedDriverInput?.field === field ? lockedDriverInput.key : (savedValue ?? '')}`;
  const lockDriverInput = (field: string, savedValue: string | null | undefined) =>
    setLockedDriverInput({ field, key: savedValue ?? '' });
  const handleDriverInputBlur = (
    e: FocusEvent<HTMLInputElement>,
    userId: string,
    field: 'lapTimeDrySeconds' | 'lapTimeWetSeconds' | 'fuelUsagePerLapLiters',
  ) => {
    setLockedDriverInput(null);
    // Untouched since it was rendered: nothing to save — and writing it back would overwrite a
    // teammate's newer value with this stale copy.
    if (e.target.value === e.target.defaultValue) return;
    void handleDriverSettingChange(userId, field, e.target.value);
  };

  const chosenTimeslot = useMemo(
    () => event?.timeslots.find((t) => t.id === team?.timeslotId) ?? null,
    [event, team?.timeslotId],
  );

  async function handleSettingBlur(field: SettingField) {
    if (!id || !teamId) return;
    const raw = settings[field.key] ?? '';
    let value: number | string | null;
    if (field.type === 'laptime') {
      if (raw.trim() === '') {
        value = null;
      } else {
        const parsed = parseLapTimeToSeconds(raw);
        if (parsed === null) {
          setError(`${field.label}: use mm:ss.ms format, e.g. 01:34.568`);
          return;
        }
        value = parsed;
      }
    } else if (field.type === 'time') {
      if (raw.trim() === '') {
        value = null;
      } else if (!TIME_OF_DAY_PATTERN.test(raw.trim())) {
        setError(`${field.label}: use HH:MM (24h) format, e.g. 14:00`);
        return;
      } else {
        value = raw.trim();
      }
    } else {
      value = numOrNull(raw);
    }

    settingsSavingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const updated = await eventTeamsApi.update(id, teamId, { [field.key]: value } as Partial<CreateEventTeamInput>);
      dirtySettingsRef.current.delete(field.key); // saved: the server value is authoritative again
      setTeam(updated);
      if (field.type === 'laptime') {
        setSettings((s) => ({ ...s, [field.key]: formatSecondsAsLapTime(value as number | null) }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save setting');
    } finally {
      settingsSavingRef.current = false;
      setBusy(false);
      setSettingsEditTick((n) => n + 1);
    }
  }

  async function handleFuelLimitBlur() {
    if (!id) return;
    const raw = fuelLimitInput.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 1 || value > 100)) {
      setError('Fuel Limit: enter a percentage between 1 and 100, or leave it blank for no limit.');
      return;
    }
    settingsSavingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await eventsApi.update(id, { fuelLimitPercent: value });
      fuelLimitDirtyRef.current = false;
      refreshEvent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save fuel limit');
    } finally {
      settingsSavingRef.current = false;
      setBusy(false);
      setSettingsEditTick((n) => n + 1);
    }
  }

  async function handleTyreLimitBlur() {
    if (!id) return;
    const raw = tyreLimitInput.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 999)) {
      setError('Tyre limit: enter a whole number of tyres between 1 and 999, or leave it blank for no limit.');
      return;
    }
    if (value === (event?.tyreLimit ?? null)) {
      tyreLimitDirtyRef.current = false;
      setSettingsEditTick((n) => n + 1);
      return;
    }
    settingsSavingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await eventsApi.update(id, { tyreLimit: value });
      tyreLimitDirtyRef.current = false;
      refreshEvent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save tyre limit');
    } finally {
      settingsSavingRef.current = false;
      setBusy(false);
      setSettingsEditTick((n) => n + 1);
    }
  }

  async function handleDriverSettingChange(
    userId: string,
    field: 'lapTimeDrySeconds' | 'lapTimeWetSeconds' | 'fuelUsagePerLapLiters',
    raw: string,
  ) {
    if (!id || !teamId) return;
    let value: number | null;
    if (field === 'fuelUsagePerLapLiters') {
      value = numOrNull(raw);
    } else if (raw.trim() === '') {
      value = null;
    } else {
      const parsed = parseLapTimeToSeconds(raw);
      if (parsed === null) {
        setError('Use mm:ss.ms format, e.g. 01:34.568');
        return;
      }
      value = parsed;
    }

    setBusy(true);
    setError(null);
    try {
      await eventTeamDriverSettingsApi.upsert(id, teamId, userId, { [field]: value });
      loadDriverSettings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save driver setting');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddDummy() {
    const name = newDummyName.trim();
    if (!id || !teamId || !name) return;
    setBusy(true);
    setError(null);
    try {
      await eventTeamDummyDriversApi.create(id, teamId, { name });
      setNewDummyName('');
      loadDummyDrivers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add dummy driver');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveDummy(dummy: EventTeamDummyDriver) {
    if (!id || !teamId) return;
    const ok = await confirm(`Remove ${dummy.name}? Any stints assigned to them become unassigned.`, {
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await eventTeamDummyDriversApi.remove(id, teamId, dummy.id);
      loadDummyDrivers();
      void loadStints();
      loadDriverSettings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove dummy driver');
    } finally {
      setBusy(false);
    }
  }

  /** Cell click in the availability grid: a dummy's hours go through the dummy endpoint, a
   * member's through the signup endpoints (admin: any member via the admin edit; a member: only
   * their own row). A dummy with no hours set is "free everywhere", so its first toggle seeds the
   * full slot minus the clicked hour: clicking a lit-up cell turns it off, as it looks like it should. */
  const handleToggleAvailabilityHour = useCallback(
    async (row: AvailabilityGridRow, hourIso: string, slotHours: string[]) => {
      if (!id || !teamId) return;
      const current = row.unrestricted ? slotHours : row.availableHours;
      const next = current.includes(hourIso) ? current.filter((h) => h !== hourIso) : [...current, hourIso];
      setBusy(true);
      setError(null);
      try {
        const dummy = dummyDrivers.find((d) => d.id === row.driverId);
        if (dummy) {
          await eventTeamDummyDriversApi.update(id, teamId, dummy.id, { availableHours: next });
          loadDummyDrivers();
        } else {
          if (isAdmin) await eventsApi.updateSignupDetails(id, row.id, { availableHours: next });
          else await eventsApi.signup(id, { availableHours: next });
          refreshEvent();
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to update availability');
      } finally {
        setBusy(false);
      }
    },
    [id, teamId, dummyDrivers, isAdmin, loadDummyDrivers, refreshEvent],
  );
  const onToggleAvailabilityHour = useCallback(
    (row: AvailabilityGridRow, hourIso: string, slotHours: string[]) =>
      void handleToggleAvailabilityHour(row, hourIso, slotHours),
    [handleToggleAvailabilityHour],
  );
  const canEditAvailabilityRow = useCallback(
    (row: AvailabilityGridRow) => isAdmin || row.driverId === user?.id,
    [isAdmin, user?.id],
  );
  // Admins can edit anyone's hours; a member only their own, and only while the event can still
  // take availability changes (the backend allows PUBLISHED and SIGNUPS_CLOSED).
  const canEditAnyAvailability = isAdmin || event?.status === 'PUBLISHED' || event?.status === 'SIGNUPS_CLOSED';

  const driverSettingsByUserId = useMemo(
    () => Object.fromEntries(driverSettings.map((s) => [s.userId, s])),
    [driverSettings],
  );

  const fuelUsagePerLap = parseDecimal(settings.fuelUsagePerLapLiters ?? null);
  const lapTimeDrySeconds = parseLapTimeToSeconds(settings.lapTimeDrySeconds ?? '');
  const lapTimeWetSeconds = parseLapTimeToSeconds(settings.lapTimeWetSeconds ?? '');
  const refuelSecondsRaw = parseDecimal(settings.refuelDurationSeconds ?? null);
  const tyreSecondsRaw = parseDecimal(settings.tyreChangeDurationSeconds ?? null);
  const driveSecondsRaw = parseDecimal(settings.pitstopDrivethroughSeconds ?? null);
  const raceStartOffsetMinutes = parseDecimal(settings.raceStartOffsetMinutes ?? null) ?? 0;
  const formationLapFuelLiters = parseDecimal(settings.formationLapFuelLiters ?? null) ?? 0;
  // The tank the plan actually works with: the team's own override if one is set, otherwise the
  // car's tank size — then, on an iRacing event with a fuel limit, only that percentage of it.
  const tankOverrideLiters = parseDecimal(settings.fuelTankCapacityLiters ?? null);
  const maxTankLiters = tankOverrideLiters ?? carInfo.tankCapacityLiters;
  const fuelLimitPercent = event?.sim === 'IRACING' ? (numOrNull(fuelLimitInput) ?? 100) : 100;
  const tankCapacityLiters = maxTankLiters !== null ? (maxTankLiters * fuelLimitPercent) / 100 : null;
  const maxStintLaps =
    tankCapacityLiters && fuelUsagePerLap && fuelUsagePerLap > 0
      ? Math.floor(tankCapacityLiters / fuelUsagePerLap)
      : null;
  const isLmu = event?.sim === 'LMU';
  const tyreLimit = isLmu ? (event?.tyreLimit ?? null) : null;
  const maxStintMinutes = maxStintLaps !== null && lapTimeDrySeconds ? (maxStintLaps * lapTimeDrySeconds) / 60 : null;

  // "All values set on top" — every Settings field plus the car's tank size — gates the full-plan
  // generator, since a missing figure would make the generated stint lengths meaningless.
  const readyToGeneratePlan =
    tankCapacityLiters !== null &&
    fuelUsagePerLap !== null &&
    lapTimeDrySeconds !== null &&
    lapTimeWetSeconds !== null &&
    refuelSecondsRaw !== null &&
    tyreSecondsRaw !== null &&
    driveSecondsRaw !== null &&
    maxStintMinutes !== null;

  const refuelMinutes = (refuelSecondsRaw ?? 0) / 60;
  const tyreMinutes = (tyreSecondsRaw ?? 0) / 60;
  // Team's "Tyre change (up to 2 tyres)" value; blank = the 5 s default (LMU only).
  const partialTyreSeconds = parseDecimal(settings.partialTyreChangeSeconds ?? null);
  const driveMinutes = (driveSecondsRaw ?? 0) / 60;
  // The full-pit assumption (refuel + tyre change + drive-through) used to plan how many stints
  // fit — the auto-generator always creates stints with tyreChange defaulted to true, so this
  // constant matches what it'll actually produce. Per-stint math (computePlan) uses the real
  // toggle instead, once stints exist and can be individually skipped.
  const pitMinutes = refuelMinutes + tyreMinutes + driveMinutes;
  const raceLengthMinutes = event?.raceLengthMinutes ?? 0;
  // The timeslot itself is when the session/server opens, not necessarily the green flag — a
  // practice + qualifying block ahead of the race pushes the real start later by however many
  // minutes the team's own settings say.
  const timeslotStartMs = chosenTimeslot ? new Date(chosenTimeslot.startsAt).getTime() : null;
  const raceStartMs = timeslotStartMs !== null ? timeslotStartMs + raceStartOffsetMinutes * 60_000 : null;
  const targetEndMs = raceStartMs !== null ? raceStartMs + raceLengthMinutes * 60_000 : null;

  // The schedule cascade — memoised on its real inputs only. The clock (nowMs) is deliberately not
  // one of them: it never changes a row, only which rows count as active/locked.
  const plan = useMemo(
    () =>
      computePlan({
        stints,
        frozen: frozenRowsRef.current,
        raceStartMs,
        timeslotStartMs,
        targetEndMs,
        refuelMinutes,
        driveMinutes,
        tyreMinutes,
        isLmu,
        tyreSecondsRaw,
        partialTyreSeconds,
        weatherPoints,
        driverSettingsByUserId,
        lapTimeDrySeconds,
        lapTimeWetSeconds,
        fuelUsagePerLap,
        tankCapacityLiters,
        formationLapFuelLiters,
        planDriverById,
      }),
    [
      stints,
      raceStartMs,
      timeslotStartMs,
      targetEndMs,
      refuelMinutes,
      driveMinutes,
      tyreMinutes,
      isLmu,
      tyreSecondsRaw,
      partialTyreSeconds,
      weatherPoints,
      driverSettingsByUserId,
      lapTimeDrySeconds,
      lapTimeWetSeconds,
      fuelUsagePerLap,
      tankCapacityLiters,
      formationLapFuelLiters,
      planDriverById,
    ],
  );
  const {
    rows,
    displayRows,
    orphanedRows,
    plannedMinutes,
    hasTrailingExcess,
    lastStintId,
    lastStintDriverUserId,
    lastRowStartMs,
  } = plan;

  // Freeze any row that just became locked — the same rule the table uses to decide it's no
  // longer editable (the next stint has actually started; the last stint instead once its own end
  // passes). Done as a pass over the now-fully-built `rows` rather than inline in the cascade,
  // since deciding "has the next stint started" needs that next row's already-computed start time.
  // Skips anything already cached and anything without a real start yet (no timeslot chosen,
  // nothing to lock in). Gated on EVERY plan input having finished its first load: freezing from a
  // half-loaded page (no tank size, no driver pace, no forecast, raceLengthMinutes still 0 ...)
  // would permanently store a wrong snapshot — and that snapshot would also drive the start of
  // every later stint. Entries for stints that no longer exist are pruned.
  useEffect(() => {
    const frozen = frozenRowsRef.current;
    if (loaded.has('stints') && frozen.size > 0) {
      const liveIds = new Set(stints.map((s) => s.id));
      for (const stintId of [...frozen.keys()]) if (!liveIds.has(stintId)) frozen.delete(stintId);
    }
    if (!inputsLoaded) return;
    rows.forEach((row, index) => {
      if (frozen.has(row.stint.id) || row.startMs === null) return;
      const rowEndMs = row.startMs + row.durationMinutes * 60_000;
      const nextStartMs = rows[index + 1]?.startMs ?? null;
      const justLocked = index === rows.length - 1 ? nowMs >= rowEndMs : nextStartMs !== null && nowMs >= nextStartMs;
      if (justLocked) frozen.set(row.stint.id, row);
    });
  }, [rows, stints, nowMs, inputsLoaded, loaded]);

  // The instants at which anything time-dependent flips (a stint starts/ends, the race starts/ends)
  // either side of nowMs — a single scan, only recomputed when the plan or nowMs changes.
  const nowBounds = useMemo(() => {
    let prev = -Infinity;
    let next = Infinity;
    const consider = (ms: number) => {
      if (ms <= nowMs) {
        if (ms > prev) prev = ms;
      } else if (ms < next) {
        next = ms;
      }
    };
    if (raceStartMs !== null) consider(raceStartMs);
    if (targetEndMs !== null) consider(targetEndMs);
    for (const row of rows) {
      if (row.startMs === null) continue;
      consider(row.startMs);
      consider(row.startMs + row.durationMinutes * 60_000);
    }
    return { prev, next };
  }, [rows, raceStartMs, targetEndMs, nowMs]);

  // Moves nowMs only when a boundary is crossed: one timeout to the next boundary instead of a
  // fixed 10 s interval. Pauses while the tab is hidden, and a visible/focus event re-evaluates
  // immediately (browsers throttle background timers; the OS clock may also have been changed —
  // hence the "earlier than the last boundary" case).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (isPageHidden()) return;
      const t = Date.now();
      if (t >= nowBounds.next || t < nowBounds.prev) {
        setNowMs(t); // re-runs this effect with the new bounds
        return;
      }
      if (nowBounds.next === Infinity) return;
      timer = setTimeout(sync, Math.min(nowBounds.next - t + 25, MAX_TIMEOUT_MS));
    };
    sync();
    const unsubscribe = subscribeToPageActivity(sync);
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [nowBounds.prev, nowBounds.next, nowMs]);

  // Keeps the plan's total glued to the race's actual end, in both directions:
  //  - short (e.g. a driver with a much shorter fuel range got assigned to what used to be the
  //    last stint) -> append unassigned filler stints, sized at the team baseline, until it reaches
  //    the end again.
  //  - long (e.g. a driver with a longer fuel range assigned mid-plan now single-handedly reaches
  //    the race's end, or per-driver data finished loading after a previous fill already ran) ->
  //    everything past the stint that actually closes the race (closingIndex) is
  //    unconditionally unnecessary. Delete the trailing one each pass — a driver-assigned stint is
  //    never touched — cascading over successive runs until nothing excess is left.
  useEffect(() => {
    // Every branch below calls an admin-only stint endpoint — a member viewing this page
    // read-only must never trigger it (it would just 403-loop on every render).
    if (!isAdmin) return;
    if (!id || !teamId || isFillingRef.current) return;
    // Wait until every plan input has loaded: a half-loaded page (no tank size or driver pace yet)
    // would compute a wrong plan length and write the difference to the database.
    if (!inputsLoaded) return;
    // The settings form holds a value the user is still typing (or a save is in flight): the
    // intermediate values aren't real settings and must not add or delete stints. settingsEditTick
    // re-runs this effect once editing settles.
    if (
      dirtySettingsRef.current.size > 0 ||
      fuelLimitDirtyRef.current ||
      tyreLimitDirtyRef.current ||
      settingsSavingRef.current
    ) {
      return;
    }
    // Someone else is mid-edit (e.g. generating a plan): don't race them with our own fill on a
    // half-written list. A timer bumps autoFillTick once things have been quiet, re-running this.
    if (Date.now() < remoteQuietUntilRef.current) return;
    if (raceStartMs === null || lastStintId === null || lastRowStartMs === null) return;

    const isExcess = hasTrailingExcess && lastStintDriverUserId === null;

    const shortfallMinutes = raceLengthMinutes - plannedMinutes;
    const fillerDurations =
      !isExcess && maxStintMinutes !== null && shortfallMinutes > 0.5
        ? // The new filler stints aren't the race's first stint, so a pit stop is owed before the
          // first one too — generateStintDurations assumes its own first entry needs none.
          generateStintDurations(shortfallMinutes - pitMinutes, maxStintMinutes, pitMinutes)
        : [];
    if (!isExcess && fillerDurations.length === 0) {
      autoAdjustCountRef.current = 0;
      return;
    }

    if (autoAdjustCountRef.current >= 30) {
      setError('The stint plan keeps needing automatic adjustment — please check the settings and stint list.');
      return;
    }
    autoAdjustCountRef.current += 1;

    // busy is deliberately NOT a dependency of this effect: setting it below would otherwise
    // re-trigger this same effect mid-fill, running this invocation's own cleanup and aborting the
    // loop after just one stint. isFillingRef guards re-entrancy instead, without causing a re-run.
    isFillingRef.current = true;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        if (isExcess) {
          await eventTeamStintsApi.remove(id, teamId, lastStintId);
        } else {
          for (const durationMinutes of fillerDurations) {
            await eventTeamStintsApi.create(id, teamId, { durationMinutes });
          }
        }
        // Awaited deliberately: isFillingRef must stay true until `stints` (and everything
        // derived from it — lastStintId, hasTrailingExcess) has actually refreshed, not just
        // until a refetch was kicked off. Clearing it any earlier leaves a window where a stale
        // re-render sees the guard as open and the old, already-deleted stint id as still
        // current — and fires a second remove() against a stint that's already gone, surfacing
        // as "Stint not found".
        await loadStints();
      } catch (err) {
        // A non-ApiError here means something other than a normal API error response — a network
        // failure (fetch itself throwing) or a bug in this effect — and the generic fallback used
        // to swallow which one, making it impossible to tell from the banner alone. Surface the
        // real message so a report of this error actually carries the reason with it.
        setError(
          err instanceof ApiError
            ? err.message
            : `Failed to adjust stint plan: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setBusy(false);
        isFillingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAdmin,
    id,
    teamId,
    inputsLoaded,
    settingsEditTick,
    lastStintId,
    lastStintDriverUserId,
    lastRowStartMs,
    hasTrailingExcess,
    raceStartMs,
    raceLengthMinutes,
    maxStintMinutes,
    pitMinutes,
    plannedMinutes,
    autoFillTick,
  ]);

  const handleAddStint = useCallback(async () => {
    if (!id || !teamId) return;
    setBusy(true);
    setError(null);
    try {
      await eventTeamStintsApi.create(id, teamId, {
        durationMinutes: maxStintMinutes !== null ? Math.round(maxStintMinutes * 10) / 10 : null,
      });
      void loadStints();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add stint');
    } finally {
      setBusy(false);
    }
  }, [id, teamId, maxStintMinutes, loadStints]);

  const handleStintChange = useCallback(
    async (stint: EventTeamStint, patch: StintPatch) => {
      if (!id || !teamId) return;
      setError(null);
      try {
        await eventTeamStintsApi.update(id, teamId, stint.id, patch);
        void loadStints();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to update stint');
      }
    },
    [id, teamId, loadStints],
  );

  const handleMoveStint = useCallback(
    async (stint: EventTeamStint, direction: 'up' | 'down') => {
      if (!id || !teamId) return;
      setBusy(true);
      setError(null);
      try {
        const updated = await eventTeamStintsApi.move(id, teamId, stint.id, direction);
        setIfChanged(setStints, updated);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to reorder stint');
      } finally {
        setBusy(false);
      }
    },
    [id, teamId],
  );

  const handleToggleStartNow = useCallback(
    async (stint: EventTeamStint) => {
      if (!id || !teamId) return;
      setBusy(true);
      setError(null);
      try {
        await eventTeamStintsApi.toggleStartNow(id, teamId, stint.id);
        void loadStints();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to update stint');
      } finally {
        setBusy(false);
      }
    },
    [id, teamId, loadStints],
  );

  const handleDeleteStint = useCallback(
    async (stint: EventTeamStint) => {
      if (!id || !teamId) return;
      if (!(await confirm('Delete this stint? This cannot be undone.', { confirmLabel: 'Delete' }))) return;
      setBusy(true);
      setError(null);
      try {
        await eventTeamStintsApi.remove(id, teamId, stint.id);
        void loadStints();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to delete stint');
      } finally {
        setBusy(false);
      }
    },
    [id, teamId, confirm, loadStints],
  );

  // Void-returning wrappers: the memoised StintRow takes plain callbacks.
  const onStintChange = useCallback((stint: EventTeamStint, patch: StintPatch) => void handleStintChange(stint, patch), [handleStintChange]);
  const onStartNow = useCallback((stint: EventTeamStint) => void handleToggleStartNow(stint), [handleToggleStartNow]);
  const onMoveStint = useCallback(
    (stint: EventTeamStint, direction: 'up' | 'down') => void handleMoveStint(stint, direction),
    [handleMoveStint],
  );
  const onDeleteStint = useCallback((stint: EventTeamStint) => void handleDeleteStint(stint), [handleDeleteStint]);

  // ---- Derived, memoised view models --------------------------------------------------------
  // (all before the early returns below: hooks must run in the same order on every render)
  const timelineStints = useMemo(
    () =>
      displayRows.map(({ stint, startMs, durationMinutes }) => ({
        id: stint.id,
        driverUserId: stint.driverUserId,
        driverLabel: stint.driverUserId ? (driverNames[stint.driverUserId] ?? 'Unknown driver') : null,
        startMs,
        durationMinutes,
      })),
    [displayRows, driverNames],
  );
  // Colours come from the team's whole roster (not the order stints are assigned in), so a driver
  // keeps one colour however the plan is reshuffled — shared by the table, timeline and grid. Kept
  // as a joined key first so the array below keeps its identity while the roster is unchanged.
  const driverColorKey = useMemo(
    () => orderedDriverIds([...planDrivers.map((d) => ({ driverUserId: d.userId })), ...timelineStints]).join('|'),
    [planDrivers, timelineStints],
  );
  const driverColorOrder = useMemo(() => (driverColorKey === '' ? [] : driverColorKey.split('|')), [driverColorKey]);
  const timelineAvailability = useMemo(
    () => planDrivers.map((d) => ({ userId: d.userId, availableHours: d.availableHours })),
    [planDrivers],
  );

  // Header clock tile + summary row, derived from the same displayRows / nowMs the table uses.
  const clockRows = useMemo(
    () =>
      displayRows.map(({ stint, startMs, durationMinutes }) => ({
        startMs,
        durationMinutes,
        driverLabel: stint.driverUserId ? (driverNames[stint.driverUserId] ?? 'Unknown driver') : null,
      })),
    [displayRows, driverNames],
  );
  // The first stint that hasn't started yet (and wasn't already started by hand) is the one the
  // strategist will press "Start now" on next.
  const nextStintIndex = displayRows.findIndex((r) => r.startMs !== null && r.startMs > nowMs && !r.stint.actualStartAt);
  // No wet lap time anywhere (team value) -> rainy stints fall back to the dry pace; nudge to set one.
  const showWetLapNotice = lapTimeWetSeconds === null;
  const tyresUsedTotal = useMemo(
    () => (tyreLimit !== null ? tyresUsed(displayRows.map((r) => r.stint)) : 0),
    [tyreLimit, displayRows],
  );
  const tyresOver = tyreLimit !== null ? Math.max(0, tyresUsedTotal - tyreLimit) : 0;
  const tyresLeft = tyreLimit !== null ? Math.max(0, tyreLimit - tyresUsedTotal) : 0;
  const tyreTone =
    tyreLimit === null ? '' : tyresOver > 0 ? 'text-ds-danger' : tyresUsedTotal >= tyreLimit * 0.9 ? 'text-ds-warn' : '';
  const summaryTiles = useMemo<{ label: string; value: string; className?: string }[]>(
    () => [
      { label: 'Stints', value: String(displayRows.length) },
      { label: 'Pit stops', value: String(Math.max(0, displayRows.length - 1)) },
      { label: 'Est. laps', value: String(displayRows.reduce((sum, r) => sum + (r.estLaps ?? 0), 0)) },
      { label: 'Laps / tank', value: maxStintLaps !== null ? String(maxStintLaps) : '—' },
      { label: 'Chequered flag', value: targetEndMs !== null ? formatClockMs(targetEndMs) : '—' },
      { label: 'Drivers', value: String(planDrivers.length) },
      ...(tyreLimit !== null
        ? [{ label: 'Tyres used', value: `${tyresUsedTotal} / ${tyreLimit}`, className: tyreTone }]
        : []),
    ],
    [displayRows, maxStintLaps, targetEndMs, planDrivers.length, tyreLimit, tyresUsedTotal, tyreTone],
  );

  // The availability tab's grid rows: members who flagged this timeslot plus every guest/dummy,
  // each with their colour outline and planned stint windows.
  const availabilityRows = useMemo(() => {
    if (!chosenTimeslot) return [];
    return [
      ...teamMembers
        .filter((s) => s.timeslots.some((t) => t.id === chosenTimeslot.id))
        .map((s) => ({
          id: s.id,
          driverId: s.userId,
          name: driverNames[s.userId] ?? 'Unknown driver',
          availableHours: s.availableHours,
          unrestricted: false,
        })),
      ...dummyDrivers.map((d) => ({
        id: d.id,
        driverId: d.id,
        name: driverNames[d.id] ?? d.name,
        availableHours: d.availableHours,
        unrestricted: d.availableHours.length === 0,
      })),
    ].map((row) => ({
      ...row,
      outlineClass: outlineClassForDot(getDriverColor(row.driverId, driverColorOrder).dot),
      stints: displayRows.flatMap((r) =>
        r.stint.driverUserId === row.driverId && r.startMs !== null
          ? [{ startMs: r.startMs, endMs: r.startMs + r.durationMinutes * 60_000 }]
          : [],
      ),
    }));
  }, [chosenTimeslot, teamMembers, dummyDrivers, driverNames, driverColorOrder, displayRows]);

  if (loadError) {
    return (
      <p role="alert" className="text-ds-danger text-sm">
        {loadError}
      </p>
    );
  }

  if (!event || !team) {
    return <p className="text-ds-muted text-sm">Loading...</p>;
  }

  async function handleGenerateFullPlan() {
    if (!id || !teamId || maxStintMinutes === null) return;
    const canAssignDrivers = raceStartMs !== null && timeslotStartMs !== null && planDrivers.length > 0;
    const ok = await confirm(
      `Generate a full stint plan for the whole race?${stints.length > 0 ? ' This replaces the current stint list.' : ''}${
        canAssignDrivers
          ? ' Drivers will be assigned automatically based on availability and their profile settings.'
          : ' No drivers will be assigned — this team has no timeslot or no signed-up drivers yet.'
      }`,
      { confirmLabel: 'Generate Plan' },
    );
    if (!ok) return;

    let durations = generateStintDurations(raceLengthMinutes, maxStintMinutes, pitMinutes);
    // The pit time the stint lengths are planned around. Default = full refuel + tyre + drive-through.
    let planPitMinutes = pitMinutes;
    // LMU with a tyre limit: spread the budget over the pit stops so the plan stays within it.
    // Cheaper partial stops (1-2 tyres) shorten the average stop, which can change how many stints
    // fit — so re-plan the lengths with the average stop time implied by the shares (max 3 passes,
    // stopping once the stint count is stable), then derive the final shares from the final count.
    let tyreShares: number[] | null = null;
    if (isLmu && tyreLimit !== null) {
      const stopBaseMinutes = refuelMinutes + driveMinutes;
      for (let pass = 0; pass < 3; pass++) {
        const shares = distributeTyres(tyreLimit, Math.max(0, durations.length - 1));
        const avgTyreMinutes =
          shares.length > 0
            ? shares.reduce((sum, n) => sum + lmuTyreStopSeconds(n, tyreSecondsRaw ?? 0, partialTyreSeconds) / 60, 0) /
              shares.length
            : tyreMinutes;
        planPitMinutes = stopBaseMinutes + avgTyreMinutes;
        const next = generateStintDurations(raceLengthMinutes, maxStintMinutes, planPitMinutes);
        const stable = next.length === durations.length;
        durations = next;
        if (stable) break;
      }
      tyreShares = distributeTyres(tyreLimit, Math.max(0, durations.length - 1));
    }
    const assignments =
      canAssignDrivers && raceStartMs !== null && timeslotStartMs !== null
        ? assignDriversToStints(
            durations,
            raceStartMs,
            timeslotStartMs,
            planPitMinutes,
            planDrivers.map((d) => ({ userId: d.userId, availableHours: d.availableHours })),
            driverProfiles,
          )
        : durations.map(() => null);

    setBusy(true);
    setError(null);
    try {
      for (const stint of stints) {
        await eventTeamStintsApi.remove(id, teamId, stint.id);
      }
      for (let i = 0; i < durations.length; i++) {
        await eventTeamStintsApi.create(id, teamId, {
          durationMinutes: durations[i],
          driverUserId: assignments[i],
          // Stint i (i >= 1) follows pit stop i - 1; the first stint has no stop before it (the
          // car starts on 4 tyres). Without a limit the backend default (full change) applies.
          ...(tyreShares ? { tyresChanged: i === 0 ? TYRES_AT_START : tyreShares[i - 1] } : {}),
        });
      }
      void loadStints();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate stint plan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[13px] text-ds-muted">
        <Link to="/events" className="text-ds-muted hover:text-ds-ink">
          Events
        </Link>
        <BreadcrumbChevron />
        <Link to={`/events/${event.id}`} className="text-ds-muted hover:text-ds-ink">
          {event.title}
        </Link>
        {isAdmin && (
          <>
            <BreadcrumbChevron />
            <Link to={`/events/${event.id}/teams`} className="text-ds-muted hover:text-ds-ink">
              Team building
            </Link>
          </>
        )}
        <BreadcrumbChevron />
        <span className="text-ds-ink">{team.name}</span>
      </nav>

      <header className="flex flex-wrap items-stretch justify-between gap-4">
        <div className="flex min-w-0 flex-col justify-center gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">{team.name}</h1>
            <span
              className={`chip chip-sm ${liveConnection === 'live' ? 'chip-accent' : 'chip-muted'}`}
              title={
                liveConnection === 'live'
                  ? 'Changes by teammates appear here automatically'
                  : 'Live updates are paused — this page refreshes every 15 seconds meanwhile'
              }
            >
              {liveConnection === 'live' ? 'Live' : liveConnection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
            <span
              role="status"
              aria-live="polite"
              className={`text-[13px] text-ds-muted transition-opacity duration-500 motion-reduce:transition-none ${
                liveNote && !liveNote.fading ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {liveNote?.text}
            </span>
          </div>
          <span className="text-sm text-ds-muted">
            Stint and race planning · {event.title}
            {team.carId && car && ` · ${car.name}`}
            {raceStartMs !== null && ` · ${formatDayMonth(raceStartMs)}, ${formatClockMs(raceStartMs)} start`}
          </span>
        </div>
        {!isAdmin && <span className="chip chip-muted self-center">View only</span>}
        {raceStartMs !== null && targetEndMs !== null && (
          <RaceClockTile raceStartMs={raceStartMs} targetEndMs={targetEndMs} clockRows={clockRows} />
        )}
      </header>

      <dl className="m-0 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))' }}>
        {summaryTiles.map((tile) => (
          <div key={tile.label} className="cut flex flex-col gap-0.5 bg-ds-panel px-[18px] py-3.5">
            <dt className="text-[13px] font-semibold text-ds-muted">{tile.label}</dt>
            <dd className={`num m-0 text-[30px] leading-[1.15] ${tile.className ?? ''}`}>{tile.value}</dd>
          </div>
        ))}
      </dl>

      {tyreLimit !== null && tyresOver > 0 && (
        <p className="cut-sm flex items-center gap-2.5 bg-ds-warn/10 px-4 py-3 text-[13px] text-ds-warn shadow-[inset_3px_0_0_var(--color-ds-warn)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" className="shrink-0" aria-hidden="true">
            <path d="M12 3l9.5 17h-19zM12 10v4M12 17v.5" />
          </svg>
          Over the tyre limit by {tyresOver} {tyresOver === 1 ? 'tyre' : 'tyres'}
        </p>
      )}
      {tyreLimit !== null && tyresOver === 0 && (
        <p className="text-[13px] text-ds-muted">
          {tyresLeft} {tyresLeft === 1 ? 'tyre' : 'tyres'} left
        </p>
      )}

      {!chosenTimeslot && (
        <p className="cut-sm flex items-center gap-2.5 bg-ds-warn/10 px-4 py-3 text-[13px] text-ds-warn shadow-[inset_3px_0_0_var(--color-ds-warn)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" className="shrink-0" aria-hidden="true">
            <path d="M12 3l9.5 17h-19zM12 10v4M12 17v.5" />
          </svg>
          <span>
            This team hasn't chosen a timeslot yet
            {isAdmin ? (
              <>
                {' '}
                — pick one on the{' '}
                <Link to={`/events/${event.id}/teams`} className="underline">
                  Team building
                </Link>{' '}
                page.
              </>
            ) : (
              '.'
            )}{' '}
            Stint start times can't be computed without it.
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="cut-sm bg-ds-danger/10 px-4 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]">
          {error}
        </p>
      )}

      <div role="tablist" aria-label="Plan sections" className="flex flex-wrap gap-1 border-b border-ds-line">
        {(
          [
            { key: 'strategy', label: 'Strategy', badge: displayRows.length },
            { key: 'availability', label: 'Driver availability', badge: null },
            { key: 'settings', label: 'Settings', warn: !readyToGeneratePlan },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px flex min-h-[46px] items-center gap-2.5 border-b-[3px] px-4 text-sm font-extrabold uppercase transition-colors ${
              activeTab === tab.key
                ? 'border-w2w-red text-ds-ink'
                : 'border-transparent text-ds-muted hover:text-ds-ink'
            }`}
          >
            {tab.label}
            {'badge' in tab && tab.badge !== null && (
              <span className="slant num bg-ds-line px-2.5 py-0.5 text-[11px] text-ds-ink-soft">{tab.badge}</span>
            )}
            {'warn' in tab && tab.warn && <span className="h-2 w-2 rotate-45 bg-ds-warn" aria-label="Incomplete" />}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <div className="flex flex-col gap-5">
      {showWetLapNotice && (
        <p className="cut-sm flex items-center gap-2.5 bg-ds-warn/10 px-4 py-3 text-[13px] text-[color-mix(in_srgb,var(--color-ds-warn),var(--color-ds-ink)_25%)] shadow-[inset_3px_0_0_var(--color-ds-warn)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" className="shrink-0" aria-hidden="true">
            <path d="M12 3l9.5 17h-19zM12 10v4M12 17v.5" />
          </svg>
          Add a wet lap time so stints in the rain get a realistic lap estimate.
        </p>
      )}
      <section aria-labelledby="cfg-title" className="cut bg-ds-panel px-6 py-[22px] flex flex-col gap-[18px]">
      <h2 id="cfg-title" className="h2">
        Race settings
      </h2>
      <div className="grid gap-x-4 gap-y-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
        {SETTING_FIELDS.filter((field) => !field.lmuOnly || isLmu).map((field) => {
          const placeholder =
            field.key === 'fuelUsagePerLapLiters' || field.key === 'pitstopDrivethroughSeconds'
              ? carInfo[field.key]
              : field.key === 'partialTyreChangeSeconds'
                ? `${PARTIAL_TYRE_CHANGE_SECONDS_DEFAULT} (default)`
                : field.key === 'fuelTankCapacityLiters'
                ? carInfo.tankCapacityLiters !== null
                  ? `${carInfo.tankCapacityLiters} (car default)`
                  : undefined
                : undefined;
          return (
            <label key={field.key} className="flex flex-col gap-1.5">
              <span className="lbl">
                {field.label} <span className="font-medium text-ds-dim">({field.unit})</span>
              </span>
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                step={field.step}
                min={field.type === 'number' ? 0 : undefined}
                placeholder={
                  field.type === 'laptime'
                    ? field.key === 'lapTimeWetSeconds'
                      ? '01:28.000'
                      : '01:18.900'
                    : field.type === 'time'
                      ? '10:00'
                      : placeholder
                }
                value={settings[field.key] ?? ''}
                onChange={(e) => {
                  dirtySettingsRef.current.add(field.key);
                  setSettings({ ...settings, [field.key]: e.target.value });
                }}
                onBlur={() => void handleSettingBlur(field)}
                disabled={busy || !isAdmin}
                className={`input min-h-11 px-3.5 tabular-nums ${field.key === 'lapTimeWetSeconds' && showWetLapNotice ? '[&:not(:focus)]:shadow-[inset_0_-2px_0_var(--color-ds-warn)]' : ''}`}
              />
            </label>
          );
        })}
        {event.sim === 'IRACING' && (
          <label className="flex flex-col gap-1.5">
            <span className="lbl">
              Fuel limit <span className="font-medium text-ds-dim">(% of tank)</span>
            </span>
            <input
              type="number"
              min={1}
              max={100}
              step="0.1"
              placeholder="No limit"
              value={fuelLimitInput}
              onChange={(e) => {
                fuelLimitDirtyRef.current = true;
                setFuelLimitInput(e.target.value);
              }}
              onBlur={() => void handleFuelLimitBlur()}
              disabled={busy || !isAdmin}
              className="input min-h-11 px-3.5 tabular-nums"
            />
          </label>
        )}
        {isLmu && (
          <label className="flex flex-col gap-1.5">
            <span className="lbl">
              Tyre limit <span className="font-medium text-ds-dim">(tyres per car)</span>
            </span>
            <input
              type="number"
              min={1}
              max={999}
              step={1}
              placeholder="No limit"
              value={tyreLimitInput}
              onChange={(e) => {
                tyreLimitDirtyRef.current = true;
                setTyreLimitInput(e.target.value);
              }}
              onBlur={() => void handleTyreLimitBlur()}
              disabled={busy || !isAdmin}
              className="input min-h-11 px-3.5 tabular-nums"
            />
          </label>
        )}
      </div>
      {tankCapacityLiters !== null && (
        <p className="text-ds-muted text-[13px]">
          Tank {Math.round(tankCapacityLiters * 10) / 10} L
          {fuelLimitPercent < 100 && ` (${fuelLimitPercent}% fuel limit of ${maxTankLiters} L)`}
          {tankOverrideLiters !== null && ' · tank size overridden'}
          {maxStintLaps !== null && ` · ${maxStintLaps} laps per tank`}
          {maxStintMinutes !== null &&
            ` · about ${maxStintMinutes < 60 ? `${Math.round(maxStintMinutes)} min` : formatDuration(maxStintMinutes)} per tank`}
        </p>
      )}
      </section>

      <section aria-labelledby="pd-title" className="cut bg-ds-panel pt-[22px] pb-1.5 flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-6">
        <h2 id="pd-title" className="h2">
          Per-driver pace &amp; fuel
        </h2>
        <span className="text-[13px] text-ds-muted">Leave blank to use the team values above.</span>
      </div>
      {planDrivers.length === 0 ? (
        <p className="px-6 pb-4 text-ds-muted text-[13px]">No drivers assigned to this team yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase text-ds-dim">
                <th className="py-1.5 pl-6 pr-2">Driver</th>
                <th className="py-1.5 px-2">Lap time (dry)</th>
                <th className="py-1.5 px-2">Lap time (wet)</th>
                <th className="py-1.5 pl-2 pr-6">Fuel / lap</th>
              </tr>
            </thead>
            <tbody>
              {planDrivers.map((s) => {
                const ds = driverSettingsByUserId[s.userId];
                const color = getDriverColor(s.userId, driverColorOrder);
                return (
                  <tr key={s.userId} className="row-hover border-t border-ds-line">
                    <td className="py-2.5 pl-6 pr-2 font-bold">
                      <span className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 shrink-0 ${color.dot}`} aria-hidden="true" />
                        {driverNames[s.userId] ?? 'Unknown driver'}
                        {s.kind !== 'member' && <span className="chip chip-muted chip-sm">{s.kind}</span>}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        key={driverInputKey(`${s.userId}:dry`, ds?.lapTimeDrySeconds)}
                        type="text"
                        defaultValue={formatSecondsAsLapTime(parseDecimal(ds?.lapTimeDrySeconds ?? null))}
                        placeholder={settings.lapTimeDrySeconds || '01:18.900'}
                        onFocus={() => lockDriverInput(`${s.userId}:dry`, ds?.lapTimeDrySeconds)}
                        onBlur={(e) => handleDriverInputBlur(e, s.userId, 'lapTimeDrySeconds')}
                        disabled={!isAdmin}
                        aria-label={`${driverNames[s.userId] ?? 'Driver'} dry lap time`}
                        className="input min-h-10 w-[140px] tabular-nums"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        key={driverInputKey(`${s.userId}:wet`, ds?.lapTimeWetSeconds)}
                        type="text"
                        defaultValue={formatSecondsAsLapTime(parseDecimal(ds?.lapTimeWetSeconds ?? null))}
                        placeholder="Team value"
                        onFocus={() => lockDriverInput(`${s.userId}:wet`, ds?.lapTimeWetSeconds)}
                        onBlur={(e) => handleDriverInputBlur(e, s.userId, 'lapTimeWetSeconds')}
                        disabled={!isAdmin}
                        aria-label={`${driverNames[s.userId] ?? 'Driver'} wet lap time`}
                        className="input min-h-10 w-[140px] tabular-nums"
                      />
                    </td>
                    <td className="py-2.5 pl-2 pr-6">
                      <input
                        key={driverInputKey(`${s.userId}:fuel`, ds?.fuelUsagePerLapLiters)}
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={ds?.fuelUsagePerLapLiters ?? ''}
                        placeholder={settings.fuelUsagePerLapLiters || '2.85'}
                        onFocus={() => lockDriverInput(`${s.userId}:fuel`, ds?.fuelUsagePerLapLiters)}
                        onBlur={(e) => handleDriverInputBlur(e, s.userId, 'fuelUsagePerLapLiters')}
                        disabled={!isAdmin}
                        aria-label={`${driverNames[s.userId] ?? 'Driver'} fuel per lap`}
                        className="input min-h-10 w-[110px] tabular-nums"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </section>

      {(isAdmin || dummyDrivers.length > 0) && (
        <section aria-labelledby="gd-title" className="cut bg-ds-panel px-6 py-[22px] flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <h2 id="gd-title" className="h2">
              Guest drivers
            </h2>
            <span className="text-[13px] text-ds-muted">
              Placeholders or roster guests without a portal account. They can take stints like anyone else.
            </span>
          </div>
          {isAdmin && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAddDummy();
              }}
              className="flex flex-wrap gap-2"
            >
              <label htmlFor="dummy-driver-name" className="sr-only">
                Guest driver name
              </label>
              <input
                id="dummy-driver-name"
                type="text"
                placeholder="Guest driver name"
                maxLength={60}
                value={newDummyName}
                onChange={(e) => setNewDummyName(e.target.value)}
                className="input min-h-11 max-w-[360px] flex-[1_1_240px] px-3.5"
              />
              <button type="submit" disabled={busy || newDummyName.trim() === ''} className="btn-secondary px-5">
                Add guest
              </button>
            </form>
          )}
          {dummyDrivers.length > 0 ? (
            <ul>
              {dummyDrivers.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-t border-ds-line py-2 text-[13px] font-semibold first:border-t-0">
                  <span>{driverNames[d.id] ?? d.name}</span>
                  {d.driverProfileId && <span className="chip chip-muted chip-sm">guest</span>}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveDummy(d)}
                      disabled={busy}
                      className="ml-auto text-ds-muted hover:text-ds-danger text-[11px] font-extrabold uppercase disabled:opacity-40"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ds-dim">No guest drivers on this crew.</p>
          )}
        </section>
      )}
        </div>
      )}

      {activeTab === 'availability' && (
        <section aria-labelledby="av-title" className="cut bg-ds-panel px-6 py-[22px] flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="av-title" className="h2">
              Driver availability
            </h2>
            <span className="text-[13px] text-ds-muted">
              Hours each driver flagged at signup, with their planned stints outlined. A stint outside a driver's hours
              is flagged.
              {canEditAnyAvailability &&
                (isAdmin
                  ? " Click a cell to change a driver's availability."
                  : ' Click a cell in your own row to change your availability.')}
            </span>
          </div>
      {planDrivers.length === 0 ? (
        <p className="text-ds-muted text-[13px]">No drivers assigned to this team yet.</p>
      ) : !chosenTimeslot ? (
        <p className="text-ds-muted text-[13px]">Pick this team's timeslot to see hourly availability.</p>
      ) : (
        <>
          <TeamPlanAvailabilityGrid
            slot={chosenTimeslot}
            raceLengthMinutes={event.raceLengthMinutes}
            rows={availabilityRows}
            onToggleHour={canEditAnyAvailability ? onToggleAvailabilityHour : undefined}
            canEditRow={canEditAvailabilityRow}
            emptyLabel="No one on this team flagged this start time."
          />
        </>
      )}
        </section>
      )}

      {activeTab === 'strategy' && (
        <div className="flex flex-col gap-5">
      <StintTimeline
        stints={timelineStints}
        raceStartMs={raceStartMs}
        raceLengthMinutes={raceLengthMinutes}
        nowMs={nowMs}
        weatherPoints={weatherPoints}
        driverAvailability={timelineAvailability}
        driverColorIds={driverColorOrder}
      />

      <section aria-labelledby="st-title" className="cut bg-ds-panel pt-5 pb-1.5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5">
          <h2 id="st-title" className="h2">
            Strategy
          </h2>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleAddStint()} disabled={busy} className="btn-secondary px-5">
                + Add stint
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateFullPlan()}
                disabled={busy || !readyToGeneratePlan}
                className="btn-primary"
              >
                Generate full stint plan
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 text-[13px] text-ds-muted">
          <p>
            Planned: {formatDuration(plannedMinutes)} of {formatDuration(raceLengthMinutes)} race length
            {plannedMinutes < raceLengthMinutes - 1 && <span className="text-ds-warn"> — short</span>}
            {plannedMinutes > raceLengthMinutes + 1 && <span className="text-ds-danger"> — over</span>}
          </p>
          {isAdmin && !readyToGeneratePlan && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="text-ds-dim hover:text-ds-ink-soft text-[11px] underline"
            >
              Fill in every Settings field first.
            </button>
          )}
        </div>

      {orphanedRows.length > 0 && (
        <div className="cut-sm mx-5 bg-ds-warn/10 shadow-[inset_3px_0_0_var(--color-ds-warn)] px-4 py-3 text-[13px]">
          <p className="text-ds-warn font-bold mb-2">
            {orphanedRows.length === 1 ? "This stint doesn't fit" : "These stints don't fit"} within the race —
            reassign or remove
          </p>
          <div className="space-y-1.5">
            {orphanedRows.map(({ stint, durationMinutes }) => (
              <div key={stint.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ds-ink-soft">
                  {stint.driverUserId ? (driverNames[stint.driverUserId] ?? 'Unknown driver') : 'Unassigned'} —{' '}
                  {formatMinutesSeconds(durationMinutes)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDeleteStint(stint)}
                  disabled={busy}
                  hidden={!isAdmin}
                  className="text-ds-muted hover:text-ds-danger text-[11px] font-extrabold uppercase disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase text-ds-dim">
              <th className="py-1.5 pl-5 pr-3 w-[52px]">#</th>
              <th className="py-1.5 px-2">Driver</th>
              <th className="py-1.5 px-2">Time</th>
              <th className={`py-1.5 px-2 ${isLmu ? 'w-[150px]' : 'w-[100px]'}`}>Tyres</th>
              <th className="py-1.5 px-2 w-20">Sim time</th>
              <th className="py-1.5 px-2 w-28">Driver time</th>
              <th className="py-1.5 px-2 w-[204px]">Weather</th>
              <th className="py-1.5 px-2 w-[76px] text-right">Est. laps</th>
              <th className="py-1.5 pl-3 pr-5 w-[132px]">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr className="border-t border-ds-line">
                <td colSpan={9} className="py-4 px-5 text-ds-muted text-[13px]">
                  No stints planned yet.
                </td>
              </tr>
            ) : (
              displayRows.map((row, index) => {
                const { stint, startMs } = row;
                const endMs = startMs !== null ? startMs + row.durationMinutes * 60_000 : null;
                const isActive = startMs !== null && endMs !== null && nowMs >= startMs && nowMs < endMs;
                // Locked once the *next* stint has actually started, not merely once this one's own
                // time has passed — the gap in between is the pit stop itself, where a last-minute
                // change (a different driver taking over, say) still needs to stay possible. The
                // last stint instead locks once its own end passes, since there's no "next" to wait on.
                // Based on displayRows (what's actually shown), not the full rows array — the last
                // *visible* stint should lock via its own end even if hidden, about-to-be-deleted
                // excess still technically follows it in the underlying data.
                const isLast = index === displayRows.length - 1;
                const nextStartMs = displayRows[index + 1]?.startMs ?? null;
                const isLocked = isLast ? endMs !== null && nowMs >= endMs : nextStartMs !== null && nowMs >= nextStartMs;
                return (
                  <StintRow
                    key={stint.id}
                    row={row}
                    index={index}
                    isLast={isLast}
                    isActive={isActive}
                    isLocked={isLocked}
                    isNext={index === nextStintIndex}
                    color={getDriverColor(stint.driverUserId, driverColorOrder)}
                    driverLabel={stint.driverUserId ? (driverNames[stint.driverUserId] ?? 'Unknown driver') : 'Unassigned'}
                    isAdmin={isAdmin}
                    busy={busy}
                    isLmu={isLmu}
                    simStartTimeOfDay={team.simStartTimeOfDay}
                    driverTimezone={stint.driverUserId ? (driverTimezones[stint.driverUserId] ?? null) : null}
                    planDrivers={planDrivers}
                    driverNames={driverNames}
                    onStintChange={onStintChange}
                    onStartNow={onStartNow}
                    onMove={onMoveStint}
                    onDelete={onDeleteStint}
                    onSelectFocus={handleSelectFocus}
                    onSelectDone={flushPendingStintRefresh}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </section>
        </div>
      )}
    </div>
  );
}
