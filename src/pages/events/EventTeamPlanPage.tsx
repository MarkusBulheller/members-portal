import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import HourlyAvailabilityGrid from '../../components/HourlyAvailabilityGrid';
import StintTimeline from '../../components/StintTimeline';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { carsApi } from '../../lib/api/cars';
import { driversApi } from '../../lib/api/drivers';
import { eventsApi } from '../../lib/api/events';
import { eventTeamDriverSettingsApi } from '../../lib/api/eventTeamDriverSettings';
import { eventTeamStintsApi } from '../../lib/api/eventTeamStints';
import { eventTeamsApi } from '../../lib/api/eventTeams';
import { iracingSeriesApi } from '../../lib/api/iracingSeries';
import { formatSecondsAsLapTime, parseLapTimeToSeconds } from '../../lib/eventFormatting';
import { getDriverColor, orderedDriverIds } from '../../lib/driverColors';
import type { Car } from '../../types/car';
import type { RaceEventDetail } from '../../types/event';
import type { CreateEventTeamInput, EventTeam, EventTeamSettingsInput } from '../../types/eventTeam';
import type { EventTeamDriverSettings } from '../../types/eventTeamDriverSettings';
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
}

const SETTING_FIELDS: SettingField[] = [
  { key: 'raceStartOffsetMinutes', label: 'Practice + Quali Offset', unit: 'min', step: '1', type: 'number' },
  { key: 'refuelDurationSeconds', label: 'Refuel Time', unit: 'sec', step: '1', type: 'number' },
  { key: 'tyreChangeDurationSeconds', label: 'Tyre Change Duration', unit: 'sec', step: '1', type: 'number' },
  { key: 'pitstopDrivethroughSeconds', label: 'Pitstop Drive-Through', unit: 'sec', step: '1', type: 'number' },
  { key: 'lapTimeDrySeconds', label: 'Lap Time (Dry)', unit: 'mm:ss.ms', type: 'laptime' },
  { key: 'lapTimeWetSeconds', label: 'Lap Time (Wet)', unit: 'mm:ss.ms', type: 'laptime' },
  { key: 'fuelUsagePerLapLiters', label: 'Fuel Usage / Lap', unit: 'L', step: '0.01', type: 'number' },
  { key: 'formationLapFuelLiters', label: 'Formation Lap Fuel', unit: 'L', step: '0.01', type: 'number' },
  { key: 'simStartTimeOfDay', label: 'Sim Start Time', unit: 'HH:MM', type: 'time' },
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

/** Formats a real timestamp in a driver's own IANA timezone — swallows an invalid zone string
 * rather than throwing, since DriverProfile.timezone isn't validated anywhere yet. */
function formatInTimezone(ms: number, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(ms);
  } catch {
    return null;
  }
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
    hours.push(new Date(timeslotStartMs + k * 3_600_000).toISOString());
  }
  return hours;
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

export default function EventTeamPlanPage() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const confirm = useConfirm();
  const [event, setEvent] = useState<RaceEventDetail | null>(null);
  const [team, setTeam] = useState<EventTeam | null>(null);
  const [stints, setStints] = useState<EventTeamStint[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [driverTimezones, setDriverTimezones] = useState<Record<string, string | null>>({});
  // Endurance-planning flags from each driver's own profile — feeds handleGenerateFullPlan's
  // driver-assignment pass (successive-stint cap, night-driving avoidance, starting-driver pick).
  const [driverProfiles, setDriverProfiles] = useState<Record<string, DriverAssignmentProfile>>({});
  const [weatherPoints, setWeatherPoints] = useState<WeatherForecastPoint[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [carInfo, setCarInfo] = useState<{
    tankCapacityLiters: number | null;
    fuelUsagePerLapLiters?: string;
    pitstopDrivethroughSeconds?: string;
  }>({ tankCapacityLiters: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error` (which reports failed actions once the page has loaded) — this instead
  // guards the initial load itself, so a failed fetch shows a real message rather than leaving
  // the page stuck on "Loading..." forever with no explanation.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'strategy' | 'availability' | 'settings'>('strategy');
  const [driverSettings, setDriverSettings] = useState<EventTeamDriverSettings[]>([]);
  // Drives both the "active stint" row highlight below and stint locking (past stints, once the
  // next one has actually started, stop being editable) — same refresh strategy as StintTimeline's
  // own live marker: a 1s interval, plus a forced read on tab/window focus since browsers throttle
  // background-tab timers.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1_000);
    const refreshNow = () => setNowMs(Date.now());
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', refreshNow);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', refreshNow);
    };
  }, []);
  // Guards the auto-fill effect below against re-entering itself — a ref rather than state so
  // setting it doesn't trigger a re-render (which would otherwise cancel the very fill it started).
  const isFillingRef = useRef(false);
  // Snapshot of every row that has ever been locked, keyed by stint id — once a stint locks (the
  // next one has actually started), its computed row is frozen here permanently rather than kept
  // live. Without this, a locked/completed stint would keep recalculating from *current* settings,
  // driver pace/fuel, and weather forever, silently rewriting history (and, for the last stint
  // specifically, could drift off the exact raceStart+raceLength close once it's no longer being
  // freshly trimmed against live inputs on every render).
  const frozenRowsRef = useRef<Map<string, PlanRow>>(new Map());
  // Circuit breaker for that same effect: counts consecutive automatic add/remove passes and stops
  // acting past a generous cap, in case some combination of settings ever makes add and remove
  // keep undoing each other — a bounded loop with an error beats a silent infinite one.
  const autoAdjustCountRef = useRef(0);

  const loadTeam = () => {
    if (!id) return;
    void eventTeamsApi
      .list(id)
      .then((teams) => setTeam(teams.find((t) => t.id === teamId) ?? null))
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load team'));
  };
  // Returns the in-flight fetch (rather than firing-and-forgetting it) so callers that need to
  // know `stints` has actually refreshed — not just that a refetch was kicked off — can await it.
  const loadStints = () => {
    if (!id || !teamId) return Promise.resolve();
    return eventTeamStintsApi.list(id, teamId).then(setStints);
  };
  const loadDriverSettings = () => {
    if (id && teamId) void eventTeamDriverSettingsApi.list(id, teamId).then(setDriverSettings);
  };

  useEffect(() => {
    if (!id) return;
    void eventsApi
      .getById(id)
      .then(setEvent)
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load event'));
  }, [id]);
  useEffect(loadTeam, [id, teamId]);
  useEffect(() => {
    void loadStints();
  }, [id, teamId]);
  useEffect(loadDriverSettings, [id, teamId]);
  useEffect(() => {
    void driversApi.list().then((drivers) => {
      setDriverNames(Object.fromEntries(drivers.map((d) => [d.userId, d.iracingName ?? d.displayName])));
      setDriverTimezones(Object.fromEntries(drivers.map((d) => [d.userId, d.timezone ?? null])));
      setDriverProfiles(
        Object.fromEntries(
          drivers.map((d) => [
            d.userId,
            { startingDriver: d.startingDriver },
          ]),
        ),
      );
    });
    void carsApi.list().then(setCars);
  }, []);

  // Weather-per-stint only exists when this event is linked to a specific iRacing series week.
  useEffect(() => {
    if (event?.iracingSeasonId == null || event?.iracingRaceWeekNum == null) {
      setWeatherPoints([]);
      return;
    }
    void iracingSeriesApi
      .getWeatherForecast(event.iracingSeasonId, event.iracingRaceWeekNum)
      .then(setWeatherPoints)
      .catch(() => setWeatherPoints([]));
  }, [event?.iracingSeasonId, event?.iracingRaceWeekNum]);

  // Seed the settings form from the team's saved values whenever they arrive/change — lap times
  // display as mm:ss.ms text, everything else as a plain number.
  useEffect(() => {
    if (!team) return;
    setSettings({
      refuelDurationSeconds: team.refuelDurationSeconds ?? '',
      tyreChangeDurationSeconds: team.tyreChangeDurationSeconds ?? '',
      pitstopDrivethroughSeconds: team.pitstopDrivethroughSeconds ?? '',
      lapTimeDrySeconds: formatSecondsAsLapTime(parseDecimal(team.lapTimeDrySeconds)),
      lapTimeWetSeconds: formatSecondsAsLapTime(parseDecimal(team.lapTimeWetSeconds)),
      fuelUsagePerLapLiters: team.fuelUsagePerLapLiters ?? '',
      raceStartOffsetMinutes: team.raceStartOffsetMinutes ?? '',
      formationLapFuelLiters: team.formationLapFuelLiters ?? '',
      simStartTimeOfDay: team.simStartTimeOfDay ?? '',
    });
  }, [team]);

  // Pull the tank size + this car's per-track fuel/pit defaults from the Cars module, when the
  // team hasn't set its own fuel/pit values yet — a head start, not a hard override.
  useEffect(() => {
    if (!team?.carId) {
      setCarInfo({ tankCapacityLiters: null });
      return;
    }
    void carsApi.getById(team.carId).then((car) => {
      const setup = event ? car.trackSetups.find((s) => s.trackId === event.trackId) : undefined;
      setCarInfo({
        tankCapacityLiters: parseDecimal(car.tankCapacityLiters),
        fuelUsagePerLapLiters: setup?.fuelPerLapLiters ?? undefined,
        pitstopDrivethroughSeconds: setup?.pitLaneTimeSeconds ?? undefined,
      });
    });
  }, [team?.carId, event]);

  const teamMembers = useMemo(
    () => (event?.signups ?? []).filter((s) => s.eventTeamId === teamId && s.status !== 'CANCELLED'),
    [event, teamId],
  );

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

    setBusy(true);
    setError(null);
    try {
      const updated = await eventTeamsApi.update(id, teamId, { [field.key]: value } as Partial<CreateEventTeamInput>);
      setTeam(updated);
      if (field.type === 'laptime') {
        setSettings((s) => ({ ...s, [field.key]: formatSecondsAsLapTime(value as number | null) }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save setting');
    } finally {
      setBusy(false);
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

  const driverSettingsByUserId = Object.fromEntries(driverSettings.map((s) => [s.userId, s]));

  const fuelUsagePerLap = parseDecimal(settings.fuelUsagePerLapLiters ?? null);
  const lapTimeDrySeconds = parseLapTimeToSeconds(settings.lapTimeDrySeconds ?? '');
  const lapTimeWetSeconds = parseLapTimeToSeconds(settings.lapTimeWetSeconds ?? '');
  const refuelSecondsRaw = parseDecimal(settings.refuelDurationSeconds ?? null);
  const tyreSecondsRaw = parseDecimal(settings.tyreChangeDurationSeconds ?? null);
  const driveSecondsRaw = parseDecimal(settings.pitstopDrivethroughSeconds ?? null);
  const raceStartOffsetMinutes = parseDecimal(settings.raceStartOffsetMinutes ?? null) ?? 0;
  const formationLapFuelLiters = parseDecimal(settings.formationLapFuelLiters ?? null) ?? 0;
  const maxStintLaps =
    carInfo.tankCapacityLiters && fuelUsagePerLap && fuelUsagePerLap > 0
      ? Math.floor(carInfo.tankCapacityLiters / fuelUsagePerLap)
      : null;
  const maxStintMinutes = maxStintLaps !== null && lapTimeDrySeconds ? (maxStintLaps * lapTimeDrySeconds) / 60 : null;

  // "All values set on top" — every Settings field plus the car's tank size — gates the full-plan
  // generator, since a missing figure would make the generated stint lengths meaningless.
  const readyToGeneratePlan =
    carInfo.tankCapacityLiters !== null &&
    fuelUsagePerLap !== null &&
    lapTimeDrySeconds !== null &&
    lapTimeWetSeconds !== null &&
    refuelSecondsRaw !== null &&
    tyreSecondsRaw !== null &&
    driveSecondsRaw !== null &&
    maxStintMinutes !== null;

  const refuelMinutes = (refuelSecondsRaw ?? 0) / 60;
  const tyreMinutes = (tyreSecondsRaw ?? 0) / 60;
  const driveMinutes = (driveSecondsRaw ?? 0) / 60;
  // The full-pit assumption (refuel + tyre change + drive-through) used to plan how many stints
  // fit — the auto-generator always creates stints with tyreChange defaulted to true, so this
  // constant matches what it'll actually produce. Per-stint math below uses the real toggle
  // instead, once stints exist and can be individually skipped.
  const pitMinutes = refuelMinutes + tyreMinutes + driveMinutes;
  const raceLengthMinutes = event?.raceLengthMinutes ?? 0;
  // The timeslot itself is when the session/server opens, not necessarily the green flag — a
  // practice + qualifying block ahead of the race pushes the real start later by however many
  // minutes the team's own settings say.
  const timeslotStartMs = chosenTimeslot ? new Date(chosenTimeslot.startsAt).getTime() : null;
  const raceStartMs = timeslotStartMs !== null ? timeslotStartMs + raceStartOffsetMinutes * 60_000 : null;

  // Absolute-ms cursor rather than a minutes offset: whenever a stint has a recorded actualStartAt
  // (the "Start Now" button), it re-anchors every later stint's derived start to that real moment
  // instead of continuing the theoretical plan — a stint running short or long naturally shifts
  // everything after it.
  let cursorMs = raceStartMs;
  const rows: PlanRow[] = stints.map((stint, index) => {
    const frozen = frozenRowsRef.current.get(stint.id);
    let baseRow: PlanRow;

    if (frozen) {
      // Locked: replay the snapshot verbatim rather than recomputing anything from current
      // settings/driver/weather inputs.
      baseRow = frozen;
    } else {
      // No pit stop before the very first stint of the race — every later stint pays whatever pit
      // time its own tyreChange toggle calls for (a "splash and go" skips the tyre-change portion).
      const pitBeforeMinutes = index === 0 ? 0 : refuelMinutes + driveMinutes + (stint.tyreChange ? tyreMinutes : 0);
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
        carInfo.tankCapacityLiters !== null
          ? index === 0
            ? Math.max(0, carInfo.tankCapacityLiters - formationLapFuelLiters)
            : carInfo.tankCapacityLiters
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

      const signup = teamMembers.find((s) => s.userId === stint.driverUserId);
      const hours =
        startMs !== null && timeslotStartMs !== null
          ? overlappingRaceHours(timeslotStartMs, startMs, startMs + (durationMinutes || 60) * 60_000)
          : [];
      // Warn only if some hour the stint actually spans is unmarked — a stint fully inside one
      // marked hour (e.g. 09:00–09:47 when only 09:00 is flagged) must not warn.
      const availabilityWarning =
        signup && signup.availableHours.length > 0 && hours.length > 0 && !hours.every((h) => signup.availableHours.includes(h));

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
  const targetEndMs = raceStartMs !== null ? raceStartMs + raceLengthMinutes * 60_000 : null;
  const closingIndex =
    targetEndMs !== null
      ? rows.findIndex((r) => r.startMs !== null && r.startMs + r.durationMinutes * 60_000 >= targetEndMs)
      : -1;
  if (closingIndex !== -1) {
    const closingRow = rows[closingIndex];
    if (closingRow.startMs !== null) {
      const naturalEndMs = closingRow.startMs + closingRow.durationMinutes * 60_000;
      if (naturalEndMs > targetEndMs!) {
        rows[closingIndex] = { ...closingRow, durationMinutes: Math.max(0, (targetEndMs! - closingRow.startMs) / 60_000) };
      }
    }
  }

  // What the table and timeline actually render: no stint may ever be shown starting after
  // raceStart + raceLength, full stop — trailing stints past the one that closes the race are cut
  // from the *display* immediately, rather than waiting for the auto-cleanup effect's delete call
  // to round-trip. This applies unconditionally, including a stint that happens to have a real
  // driver assigned — the race physically cannot contain a stint starting after it's already over,
  // so it can't be rendered as an ordinary row implying it will happen. It isn't silently deleted,
  // though: orphanedRows (below) surfaces it separately so an admin can still see and resolve it.
  const trailingExcessRows = closingIndex !== -1 ? rows.slice(closingIndex + 1) : [];
  const displayRows = closingIndex !== -1 ? rows.slice(0, closingIndex + 1) : rows;
  const orphanedRows = trailingExcessRows.filter((r) => r.stint.driverUserId !== null);

  // Freeze any row that just became locked — the same rule the table uses to decide it's no
  // longer editable (the next stint has actually started; the last stint instead once its own end
  // passes). Done as a pass over the now-fully-built `rows` rather than inline above, since
  // deciding "has the next stint started" needs that next row's already-computed start time.
  // Skips anything already cached (nothing to do — it was replayed from the snapshot above, not
  // recomputed) and anything without a real start yet (no timeslot chosen, nothing to lock in).
  // Gated on `event` being loaded for real: raceLengthMinutes falls back to 0 before that (see
  // above), which would make every stint look like it's overrunning the race and risk permanently
  // freezing a bogus snapshot from that transient state.
  if (event) {
    rows.forEach((row, index) => {
      if (frozenRowsRef.current.has(row.stint.id) || row.startMs === null) return;
      const rowEndMs = row.startMs + row.durationMinutes * 60_000;
      const nextStartMs = rows[index + 1]?.startMs ?? null;
      const justLocked = index === rows.length - 1 ? nowMs >= rowEndMs : nextStartMs !== null && nowMs >= nextStartMs;
      if (justLocked) frozenRowsRef.current.set(row.stint.id, row);
    });
  }

  // "Planned" total is measured to whichever stint actually closes the race (see closingIndex
  // above), not blindly to the array's last element — trailing excess past that point shouldn't
  // count toward it, or the shortfall/excess check below would never see it as excess at all.
  const effectiveLastRow = closingIndex !== -1 ? rows[closingIndex] : rows.length > 0 ? rows[rows.length - 1] : null;
  const plannedMinutes =
    effectiveLastRow?.startMs !== null && effectiveLastRow?.startMs !== undefined && raceStartMs !== null
      ? (effectiveLastRow.startMs + effectiveLastRow.durationMinutes * 60_000 - raceStartMs) / 60_000
      : 0;

  // Primitives pulled out of `rows` (a fresh array/object every render) so the effect below can
  // depend on values that only actually change when the schedule does — depending on `rows` itself
  // would re-run the effect, and re-derive its "is there anything to do" check, on every render.
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
  const lastStintId = lastRow?.stint.id ?? null;
  const lastStintDriverUserId = lastRow?.stint.driverUserId ?? null;
  const lastRowStartMs = lastRow?.startMs ?? null;
  // True once the array holds more stints than the schedule actually needs — the closing stint
  // (whichever one first reaches the race's end) plus anything after it, regardless of whether
  // that trailing extra happens to still be sitting past target too.
  const hasTrailingExcess = closingIndex !== -1 && closingIndex < rows.length - 1;

  // Keeps the plan's total glued to the race's actual end, in both directions:
  //  - short (e.g. a driver with a much shorter fuel range got assigned to what used to be the
  //    last stint) -> append unassigned filler stints, sized at the team baseline, until it reaches
  //    the end again.
  //  - long (e.g. a driver with a longer fuel range assigned mid-plan now single-handedly reaches
  //    the race's end, or per-driver data finished loading after a previous fill already ran) ->
  //    everything past the stint that actually closes the race (closingIndex above) is
  //    unconditionally unnecessary. Delete the trailing one each pass — a driver-assigned stint is
  //    never touched — cascading over successive runs until nothing excess is left.
  useEffect(() => {
    // Every branch below calls an admin-only stint endpoint — a member viewing this page
    // read-only must never trigger it (it would just 403-loop on every render).
    if (!isAdmin) return;
    if (!id || !teamId || isFillingRef.current) return;
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
        // re-render (the live clock ticks every second) sees the guard as open and the old,
        // already-deleted stint id as still current — and fires a second remove() against a
        // stint that's already gone, surfacing as "Stint not found".
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
    lastStintId,
    lastStintDriverUserId,
    lastRowStartMs,
    hasTrailingExcess,
    raceStartMs,
    raceLengthMinutes,
    maxStintMinutes,
    pitMinutes,
    plannedMinutes,
  ]);

  async function handleAddStint() {
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
  }

  async function handleStintChange(
    stint: EventTeamStint,
    patch: { driverUserId?: string | null; tyreChange?: boolean; wetOverride?: boolean | null },
  ) {
    if (!id || !teamId) return;
    setError(null);
    try {
      await eventTeamStintsApi.update(id, teamId, stint.id, patch);
      void loadStints();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update stint');
    }
  }

  async function handleMoveStint(stint: EventTeamStint, direction: 'up' | 'down') {
    if (!id || !teamId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await eventTeamStintsApi.move(id, teamId, stint.id, direction);
      setStints(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reorder stint');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStartNow(stint: EventTeamStint) {
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
  }

  async function handleDeleteStint(stint: EventTeamStint) {
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
  }

  if (loadError) {
    return (
      <p role="alert" className="text-w2w-red text-sm">
        {loadError}
      </p>
    );
  }

  if (!event || !team) {
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  async function handleGenerateFullPlan() {
    if (!id || !teamId || maxStintMinutes === null) return;
    const canAssignDrivers = raceStartMs !== null && timeslotStartMs !== null && teamMembers.length > 0;
    const ok = await confirm(
      `Generate a full stint plan for the whole race?${stints.length > 0 ? ' This replaces the current stint list.' : ''}${
        canAssignDrivers
          ? ' Drivers will be assigned automatically based on availability and their profile settings.'
          : ' No drivers will be assigned — this team has no timeslot or no signed-up drivers yet.'
      }`,
      { confirmLabel: 'Generate Plan' },
    );
    if (!ok) return;

    const durations = generateStintDurations(raceLengthMinutes, maxStintMinutes, pitMinutes);
    const assignments =
      canAssignDrivers && raceStartMs !== null && timeslotStartMs !== null
        ? assignDriversToStints(
            durations,
            raceStartMs,
            timeslotStartMs,
            pitMinutes,
            teamMembers.map((s) => ({ userId: s.userId, availableHours: s.availableHours })),
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
        await eventTeamStintsApi.create(id, teamId, { durationMinutes: durations[i], driverUserId: assignments[i] });
      }
      void loadStints();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate stint plan');
    } finally {
      setBusy(false);
    }
  }

  const timelineStints = displayRows.map(({ stint, startMs, durationMinutes }) => ({
    id: stint.id,
    driverUserId: stint.driverUserId,
    driverLabel: stint.driverUserId ? (driverNames[stint.driverUserId] ?? 'Unknown driver') : null,
    startMs,
    durationMinutes,
  }));
  const driverColorOrder = orderedDriverIds(timelineStints);
  const driverAvailability = Object.fromEntries(teamMembers.map((s) => [s.userId, s.availableHours]));

  return (
    <div>
      <Link
        to={isAdmin ? `/events/${event.id}/teams` : `/events/${event.id}`}
        className="text-xs text-white/65 hover:text-white"
      >
        ← Back to {isAdmin ? 'team building' : 'event'}
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Stint &amp; Race Planning</p>
          <h1 className="font-display font-black text-2xl uppercase text-w2w-white">{team.name}</h1>
          <p className="text-white/65 text-sm mt-1">
            {event.title}
            {team.carId && cars.find((c) => c.id === team.carId) && ` · ${cars.find((c) => c.id === team.carId)?.name}`}
          </p>
        </div>
        {!isAdmin && (
          <span className="shrink-0 px-2.5 py-1 text-[11px] font-heading uppercase tracking-wide bg-white/5 text-white/50">
            View only
          </span>
        )}
      </div>

      {!chosenTimeslot && (
        <p className="mt-4 text-amber-400 text-xs bg-amber-400/10 border border-amber-400/30 px-3 py-2">
          This team hasn't chosen a timeslot yet
          {isAdmin ? (
            <>
              {' '}
              — pick one on the{' '}
              <Link to={`/events/${event.id}/teams`} className="underline">
                Team Building
              </Link>{' '}
              page.
            </>
          ) : (
            '.'
          )}{' '}
          Stint start times can't be computed without it.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-w2w-red text-sm">
          {error}
        </p>
      )}

      <div className="mt-8 flex gap-1 border-b border-white/10">
        {(
          [
            { key: 'strategy', label: 'Strategy', badge: displayRows.length },
            { key: 'availability', label: 'Driver Availability', badge: null },
            { key: 'settings', label: 'Settings', warn: !readyToGeneratePlan },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 -mb-px border-b-2 font-heading text-xs uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key ? 'border-w2w-red text-white' : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            {tab.label}
            {'badge' in tab && tab.badge !== null && (
              <span className="px-1.5 py-0.5 text-[10px] bg-white/10 text-white/65 rounded">{tab.badge}</span>
            )}
            {'warn' in tab && tab.warn && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label="Incomplete" />}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <div className="mt-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {SETTING_FIELDS.map((field) => {
          const placeholder =
            field.key === 'fuelUsagePerLapLiters' || field.key === 'pitstopDrivethroughSeconds'
              ? carInfo[field.key]
              : undefined;
          return (
            <label key={field.key} className="flex flex-col gap-1.5">
              <span className="font-heading text-[11px] tracking-[0.15em] uppercase text-white/65">
                {field.label} <span className="text-white/70 normal-case tracking-normal">({field.unit})</span>
              </span>
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                step={field.step}
                min={field.type === 'number' ? 0 : undefined}
                placeholder={field.type === 'laptime' ? '01:34.568' : field.type === 'time' ? '14:00' : placeholder}
                value={settings[field.key] ?? ''}
                onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                onBlur={() => void handleSettingBlur(field)}
                disabled={busy || !isAdmin}
                className="input"
              />
            </label>
          );
        })}
      </div>
      {carInfo.tankCapacityLiters !== null && (
        <p className="text-white/65 text-xs mt-3">
          Tank: {carInfo.tankCapacityLiters}L
          {maxStintLaps !== null && ` · ${maxStintLaps} laps/tank`}
          {maxStintMinutes !== null && ` · ~${formatDuration(maxStintMinutes)}/tank`}
        </p>
      )}

      <p className="mt-8 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase mb-3">
        Per-Driver Pace &amp; Fuel
      </p>
      {teamMembers.length === 0 ? (
        <p className="text-white/65 text-sm">No drivers assigned to this team yet.</p>
      ) : (
        <div className="overflow-x-auto border border-white/10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Driver</th>
                <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Lap Time (Dry)</th>
                <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Lap Time (Wet)</th>
                <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Fuel Usage / Lap</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((s) => {
                const ds = driverSettingsByUserId[s.userId];
                return (
                  <tr key={s.userId} className="border-b border-white/5">
                    <td className="py-1.5 px-3 text-white/80">{driverNames[s.userId] ?? 'Unknown driver'}</td>
                    <td className="py-1.5 px-3">
                      <input
                        type="text"
                        defaultValue={formatSecondsAsLapTime(parseDecimal(ds?.lapTimeDrySeconds ?? null))}
                        placeholder={settings.lapTimeDrySeconds || '01:34.568'}
                        onBlur={(e) => void handleDriverSettingChange(s.userId, 'lapTimeDrySeconds', e.target.value)}
                        disabled={!isAdmin}
                        className="input py-1 text-xs w-28"
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        type="text"
                        defaultValue={formatSecondsAsLapTime(parseDecimal(ds?.lapTimeWetSeconds ?? null))}
                        placeholder={settings.lapTimeWetSeconds || '01:34.568'}
                        onBlur={(e) => void handleDriverSettingChange(s.userId, 'lapTimeWetSeconds', e.target.value)}
                        disabled={!isAdmin}
                        className="input py-1 text-xs w-28"
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={ds?.fuelUsagePerLapLiters ?? ''}
                        placeholder={settings.fuelUsagePerLapLiters || undefined}
                        onBlur={(e) => void handleDriverSettingChange(s.userId, 'fuelUsagePerLapLiters', e.target.value)}
                        disabled={!isAdmin}
                        className="input py-1 text-xs w-24"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-white/70 text-[11px] mt-2">Blank fields fall back to the team baseline above.</p>
        </div>
      )}

      {activeTab === 'availability' && (
        <div className="mt-6">
      {teamMembers.length === 0 ? (
        <p className="text-white/65 text-sm">No drivers assigned to this team yet.</p>
      ) : !chosenTimeslot ? (
        <p className="text-white/65 text-sm">Pick this team's timeslot to see hourly availability.</p>
      ) : (
        <HourlyAvailabilityGrid
          timeslots={[chosenTimeslot]}
          raceLengthMinutes={event.raceLengthMinutes}
          signups={teamMembers}
          driverNames={driverNames}
          emptyLabel="No one on this team flagged this start time."
        />
      )}
        </div>
      )}

      {activeTab === 'strategy' && (
        <div className="mt-6">
      <StintTimeline
        stints={timelineStints}
        raceStartMs={raceStartMs}
        raceLengthMinutes={raceLengthMinutes}
        driverAvailability={driverAvailability}
        weatherPoints={weatherPoints}
      />

      <div className="flex items-start justify-between gap-3 flex-wrap mt-4 mb-3">
        <p className="text-white/65 text-xs">
          Planned: {formatDuration(plannedMinutes)} of {formatDuration(raceLengthMinutes)} race length
          {plannedMinutes < raceLengthMinutes - 1 && <span className="text-amber-400"> — short</span>}
          {plannedMinutes > raceLengthMinutes + 1 && <span className="text-w2w-red"> — over</span>}
        </p>
        <div className="flex flex-col items-end gap-1">
          {isAdmin && (
          <button
            type="button"
            onClick={() => void handleGenerateFullPlan()}
            disabled={busy || !readyToGeneratePlan}
            className="shrink-0 px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-40 font-heading text-xs uppercase tracking-wide transition-colors"
          >
            Generate Full Stint Plan
          </button>
          )}
          {isAdmin && !readyToGeneratePlan && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="text-white/40 hover:text-white/65 text-[11px] text-right underline"
            >
              Fill in every Settings field first.
            </button>
          )}
        </div>
      </div>

      {orphanedRows.length > 0 && (
        <div className="mb-3 border border-amber-400/40 bg-amber-400/10 px-4 py-3">
          <p className="text-amber-400 text-xs font-heading uppercase tracking-wide mb-2">
            {orphanedRows.length === 1 ? "This stint doesn't fit" : "These stints don't fit"} within the race —
            reassign or remove
          </p>
          <div className="space-y-1.5">
            {orphanedRows.map(({ stint, durationMinutes }) => (
              <div key={stint.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-white/80">
                  {stint.driverUserId ? (driverNames[stint.driverUserId] ?? 'Unknown driver') : 'Unassigned'} —{' '}
                  {formatMinutesSeconds(durationMinutes)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDeleteStint(stint)}
                  disabled={busy}
                  hidden={!isAdmin}
                  className="text-white/65 hover:text-w2w-red font-heading uppercase tracking-wide disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">#</th>
              <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Driver</th>
              <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Time</th>
              <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Tyres</th>
              <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Sim Time</th>
              <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Driver Time</th>
              <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Weather</th>
              <th className="py-2 px-3 font-heading text-[11px] tracking-[0.15em] text-white/65 uppercase">Est. Laps</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-4 px-3 text-white/65 text-sm">
                  No stints planned yet.
                </td>
              </tr>
            ) : (
              displayRows.map(
                (
                  {
                    stint,
                    startMs,
                    startOffsetMinutes,
                    durationMinutes,
                    pitBeforeMinutes,
                    estLaps,
                    weatherPoint,
                    isWetStint,
                    availabilityWarning,
                  },
                  index,
                ) => {
                const endMs = startMs !== null ? startMs + durationMinutes * 60_000 : null;
                const color = getDriverColor(stint.driverUserId, driverColorOrder);
                const isActive = startMs !== null && endMs !== null && nowMs >= startMs && nowMs < endMs;
                // Locked once the *next* stint has actually started, not merely once this one's own
                // time has passed — the gap in between is the pit stop itself, where a last-minute
                // change (a different driver taking over, say) still needs to stay possible. The
                // last stint instead locks once its own end passes, since there's no "next" to wait on.
                // Based on displayRows (what's actually shown), not the full rows array — the last
                // *visible* stint should lock via its own end even if hidden, about-to-be-deleted
                // excess still technically follows it in the underlying data.
                const nextStartMs = displayRows[index + 1]?.startMs ?? null;
                const isLocked =
                  index === displayRows.length - 1
                    ? endMs !== null && nowMs >= endMs
                    : nextStartMs !== null && nowMs >= nextStartMs;

                const simStart = team.simStartTimeOfDay ? addMinutesToTimeOfDay(team.simStartTimeOfDay, startOffsetMinutes) : null;
                const simEnd = team.simStartTimeOfDay
                  ? addMinutesToTimeOfDay(team.simStartTimeOfDay, startOffsetMinutes + durationMinutes)
                  : null;

                const driverTimezone = stint.driverUserId ? driverTimezones[stint.driverUserId] : null;
                const driverStart = startMs !== null && driverTimezone ? formatInTimezone(startMs, driverTimezone) : null;
                const driverEnd = endMs !== null && driverTimezone ? formatInTimezone(endMs, driverTimezone) : null;

                return (
                <tr
                  key={stint.id}
                  className={`border-b border-white/5 ${isActive ? 'bg-w2w-red/10' : ''} ${isLocked ? 'opacity-60' : ''}`}
                >
                  <td className="py-1.5 px-3 text-white/50">
                    {index + 1}
                    {isActive && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-w2w-red text-[9px] font-heading font-bold uppercase tracking-wide align-middle">
                        <span className="w-1.5 h-1.5 rounded-full bg-w2w-red" aria-hidden="true" />
                        Live
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} aria-hidden="true" />
                      {isAdmin ? (
                        <select
                          value={stint.driverUserId ?? ''}
                          onChange={(e) => void handleStintChange(stint, { driverUserId: e.target.value || null })}
                          disabled={busy || isLocked}
                          className="input py-1 text-xs w-36 disabled:opacity-60"
                        >
                          <option value="">Unassigned</option>
                          {teamMembers.map((s) => (
                            <option key={s.userId} value={s.userId}>
                              {driverNames[s.userId] ?? 'Unknown driver'}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-white/80 text-xs">
                          {stint.driverUserId ? (driverNames[stint.driverUserId] ?? 'Unknown driver') : 'Unassigned'}
                        </span>
                      )}
                    </div>
                    {availabilityWarning && (
                      <p className="text-amber-400 text-[11px] mt-1">Not marked available at this time</p>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-white/70 whitespace-nowrap">
                    <p>
                      {startMs !== null && endMs !== null
                        ? `${new Date(startMs).toLocaleString(undefined, {
                            weekday: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          })} → ${new Date(endMs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
                        : '—'}
                    </p>
                    <p className="text-white/40 text-[11px] mt-0.5">{formatMinutesSeconds(durationMinutes)}</p>
                    {isLocked ? (
                      <p className="mt-1 text-white/30 text-[11px] font-heading uppercase tracking-wide">🔒 Locked</p>
                    ) : stint.actualStartAt && isAdmin ? (
                      <button
                        type="button"
                        onClick={() => void handleToggleStartNow(stint)}
                        disabled={busy}
                        className="mt-1 flex items-center gap-1 text-emerald-400 text-[11px] hover:text-emerald-300 disabled:opacity-40"
                        title="Click to clear"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                        Started{' '}
                        {new Date(stint.actualStartAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </button>
                    ) : stint.actualStartAt ? (
                      <p className="mt-1 flex items-center gap-1 text-emerald-400 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                        Started{' '}
                        {new Date(stint.actualStartAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    ) : !isAdmin ? null : (
                      <button
                        type="button"
                        onClick={() => void handleToggleStartNow(stint)}
                        disabled={busy}
                        className="mt-1 text-w2w-red hover:text-w2w-red-bright text-[11px] font-heading uppercase tracking-wide disabled:opacity-40"
                      >
                        ▶ Start Now
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 px-3">
                    {index === 0 ? (
                      <span className="text-white/30 text-[11px]">—</span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-[11px] text-white/65 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stint.tyreChange}
                          disabled={busy || isLocked || !isAdmin}
                          onChange={(e) => void handleStintChange(stint, { tyreChange: e.target.checked })}
                        />
                        Change
                      </label>
                    )}
                    <p className="text-white/40 text-[10px] mt-0.5">+{formatMinutesSeconds(pitBeforeMinutes)} pit</p>
                  </td>
                  <td className="py-1.5 px-3 text-white/65 whitespace-nowrap">
                    {simStart && simEnd ? `${simStart} → ${simEnd}` : '—'}
                  </td>
                  <td className="py-1.5 px-3 text-white/65 whitespace-nowrap">
                    {driverStart && driverEnd ? `${driverStart} → ${driverEnd}` : '—'}
                  </td>
                  <td className="py-1.5 px-3 text-white/65 whitespace-nowrap">
                    <p className={isWetStint ? 'text-sky-400' : ''}>
                      {weatherPoint ? formatWeatherPoint(weatherPoint) : '—'} {isWetStint ? '· Wet' : '· Dry'}
                    </p>
                    {isAdmin && (
                      <div className="flex items-center gap-1 mt-1" role="group" aria-label="Wet/dry override">
                        {(
                          [
                            { label: 'Auto', value: null },
                            { label: 'Dry', value: false },
                            { label: 'Wet', value: true },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => void handleStintChange(stint, { wetOverride: opt.value })}
                            disabled={busy || isLocked}
                            className={`px-1.5 py-0.5 text-[10px] font-heading uppercase tracking-wide border transition-colors disabled:opacity-40 ${
                              stint.wetOverride === opt.value
                                ? 'border-w2w-red text-white bg-w2w-red/15'
                                : 'border-white/15 text-white/50 hover:text-white hover:border-white/30'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-white/65">{estLaps ?? '—'}</td>
                  <td className="py-1.5 px-3">
                    {isAdmin && (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => void handleMoveStint(stint, 'up')}
                          disabled={busy || index === 0 || isLocked}
                          className="text-white/65 hover:text-white text-xs disabled:opacity-30"
                          aria-label="Move stint up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMoveStint(stint, 'down')}
                          disabled={busy || index === displayRows.length - 1 || isLocked}
                          className="text-white/65 hover:text-white text-xs disabled:opacity-30"
                          aria-label="Move stint down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteStint(stint)}
                          disabled={busy || isLocked}
                          className="text-white/65 hover:text-w2w-red text-[11px] font-heading uppercase tracking-wide transition-colors disabled:opacity-40 ml-1"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {isAdmin && (
        <button
          type="button"
          onClick={() => void handleAddStint()}
          disabled={busy}
          className="mt-3 px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
        >
          + Add Stint
        </button>
      )}
        </div>
      )}
    </div>
  );
}
