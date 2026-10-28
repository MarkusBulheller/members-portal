import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** One stint row of the printed sheet. Everything is already formatted by the plan page (clock
 * times in the viewer's zone, 24 h), so this component never recomputes the fuel/stint cascade. */
export interface PitWallStint {
  number: number;
  /** null = unassigned (printed as a dash). */
  driverName: string | null;
  /** "HH:MM" — null when the plan has no race start yet. */
  startClock: string | null;
  endClock: string | null;
  /** In-game clock at the start of the stint — null without a sim start time. */
  simTime: string | null;
  /** "54m 36s". */
  duration: string;
  estLaps: number | null;
  /** What happens in the stop BEFORE this stint ("Fuel + tyres"); null for the first stint (race start). */
  pitLabel: string | null;
  /** Total stop time, "1:12" (m:ss); null when unknown. */
  pitTotal: string | null;
  /** iRacing: "Start" / "Change" / "Keep". LMU: "Start" or the number of tyres changed ("0"-"4"). */
  tyres: string;
  /** "Dry" or "Wet" (the effective value, manual override or forecast). */
  weather: string;
  /** Forecast detail under the weather ("18°C · 40% rain") when there is one. */
  weatherNote: string | null;
}

export interface PitWallDriverStint {
  number: number;
  /** Start of that stint on the driver's own clock, "14:00 CET"; null without a timezone. */
  localStart: string | null;
}

export interface PitWallDriver {
  name: string;
  /** IANA zone name, null when the driver has none on file. */
  timezone: string | null;
  stints: PitWallDriverStint[];
}

export interface PitWallSheetProps {
  /** Show the sheet on screen too. Only for the visual test harness; the app never sets it. */
  forceVisible?: boolean;
  eventTitle: string;
  trackName: string | null;
  /** "iRacing" / "Le Mans Ultimate". */
  simLabel: string;
  carClasses: string[];
  /** "Sat 24 Oct 2026". */
  eventDate: string | null;
  teamName: string;
  carName: string | null;
  /** Race start in the viewer's zone: "Sat 24 Oct", "14:00", "CEST". */
  raceStart: { date: string; clock: string; zone: string } | null;
  /** Chequered-flag clock, "20:00". */
  raceEndClock: string | null;
  /** "6h 0m". */
  raceLength: string;
  /** In-game clock at the green flag, "HH:MM". */
  simStartClock: string | null;
  isLmu: boolean;
  tankLiters: number | null;
  fuelPerLapLiters: number | null;
  lapsPerTank: number | null;
  /** iRacing fuel limit, % of the max tank; null = none. */
  fuelLimitPercent: number | null;
  /** LMU tyre budget; null = none. */
  tyreLimit: number | null;
  tyresUsed: number | null;
  refuelSeconds: number | null;
  tyreSeconds: number | null;
  /** LMU 1-2 tyre stop time. */
  partialTyreSeconds: number | null;
  driveThroughSeconds: number | null;
  stintCount: number;
  pitStopCount: number;
  estLaps: number;
  stints: PitWallStint[];
  drivers: PitWallDriver[];
}

const DASH = '—';

function fmtNumber(value: number | null, unit: string, maxDecimals = 2): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  const text = Number(value.toFixed(maxDecimals)).toString();
  return unit ? `${text} ${unit}` : text;
}

function fmtSeconds(value: number | null): string {
  return fmtNumber(value, 's', 1);
}

/** "Printed Sat 24 Oct 2026, 13:05" — hand-built so it never depends on the locale. */
function formatPrinted(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  return `${day}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Hard-coded black/white on purpose: the sheet is a paper document and must not follow the app's
// dark/light theme or accent tokens (the theme remaps even `white`).
const INK = 'text-[#000]';
const RULE = 'border-[#8a8a8a]';
const TH = `border-b border-t ${RULE} bg-[#e6e6e6] px-1.5 py-[1.2mm] text-left text-[8.5pt] font-bold uppercase tracking-[0.03em] ${INK}`;
const TD = `border-b ${RULE} px-1.5 align-middle`;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 pr-4">
      <div className="text-[8pt] font-bold uppercase tracking-[0.04em] text-[#444]">{label}</div>
      <div className="text-[11pt] font-bold leading-tight">{value}</div>
    </div>
  );
}

function KeyNumber({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`min-w-0 flex-1 basis-[20mm] border-l ${RULE} px-2 py-[1.2mm] first:border-l-0`}>
      <div className="text-[7.5pt] font-bold uppercase tracking-[0.04em] text-[#444]">{label}</div>
      <div className="text-[11pt] font-bold leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-[7.5pt] leading-tight text-[#444]">{sub}</div>}
    </div>
  );
}

/** A4-landscape printable pit-wall sheet for a team's stint plan. Always in the DOM but `hidden`
 * on screen; `print:block` (plus the print rules in index.css that hide the app shell) makes it the
 * only thing a print shows, so window.print() and the browser's own Ctrl+P both produce it. It is
 * a plain black-on-white paper document — completed/locked/live stints are deliberately unstyled. */
export default function PitWallSheet(props: PitWallSheetProps) {
  const {
    forceVisible = false,
    eventTitle,
    trackName,
    simLabel,
    carClasses,
    eventDate,
    teamName,
    carName,
    raceStart,
    raceEndClock,
    raceLength,
    simStartClock,
    isLmu,
    tankLiters,
    fuelPerLapLiters,
    lapsPerTank,
    fuelLimitPercent,
    tyreLimit,
    tyresUsed,
    refuelSeconds,
    tyreSeconds,
    partialTyreSeconds,
    driveThroughSeconds,
    stintCount,
    pitStopCount,
    estLaps,
    stints,
    drivers,
  } = props;

  // "Printed <time>" is refreshed right before the print layout is taken, so a page left open for
  // hours still prints the moment of printing. Display-only state: nothing else is touched.
  const [printedAt, setPrintedAt] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => flushSync(() => setPrintedAt(new Date()));
    window.addEventListener('beforeprint', refresh);
    return () => window.removeEventListener('beforeprint', refresh);
  }, []);

  const hasSimClock = stints.some((s) => s.simTime !== null);
  const classText = carClasses.length > 0 ? carClasses.join(' / ') : null;
  const subtitle = [trackName, [simLabel, classText].filter(Boolean).join(' · '), eventDate].filter(Boolean);
  const columnCount = hasSimClock ? 12 : 11;

  return (
    <section
      aria-label="Pit-wall sheet"
      className={`pitwall bg-[#fff] ${INK} ${forceVisible ? 'block' : 'hidden print:block'}`}
      style={{
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: '10pt',
        lineHeight: 1.3,
        fontStyle: 'normal',
      }}
    >
      {/* Header band */}
      <header className={`border-b-2 border-[#000] pb-[2mm]`}>
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 className="m-0 text-[17pt] font-extrabold leading-tight">{eventTitle}</h1>
            <p className="m-0 text-[10pt] text-[#222]">{subtitle.join('  ·  ')}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[8pt] font-bold uppercase tracking-[0.06em] text-[#444]">Pit-wall sheet</div>
            <div className="text-[14pt] font-extrabold leading-tight">{teamName}</div>
            {carName && <div className="text-[10pt] text-[#222]">{carName}</div>}
          </div>
        </div>
        <div className="mt-[2.5mm] flex flex-wrap gap-y-2">
          <Field
            label="Race start"
            value={raceStart ? `${raceStart.date} · ${raceStart.clock} ${raceStart.zone}`.trim() : DASH}
          />
          <Field label="Chequered flag" value={raceEndClock ?? DASH} />
          <Field label="Race length" value={raceLength} />
          {simStartClock && <Field label="Sim clock at start" value={simStartClock} />}
        </div>
      </header>

      {/* Key numbers */}
      <div className={`mt-[2.5mm] flex flex-wrap border ${RULE}`} style={{ breakInside: 'avoid' }}>
        <KeyNumber label="Tank" value={fmtNumber(tankLiters, 'L', 1)} />
        <KeyNumber label="Fuel / lap" value={fmtNumber(fuelPerLapLiters, 'L')} />
        <KeyNumber label="Laps / tank" value={lapsPerTank !== null ? String(lapsPerTank) : DASH} />
        <KeyNumber label="Stints" value={String(stintCount)} />
        <KeyNumber label="Pit stops" value={String(pitStopCount)} />
        <KeyNumber label="Est. laps" value={String(estLaps)} />
        {!isLmu && fuelLimitPercent !== null && <KeyNumber label="Fuel limit" value={fmtNumber(fuelLimitPercent, '%', 1)} />}
        {isLmu && tyreLimit !== null && (
          <KeyNumber label="Tyres used" value={`${tyresUsed ?? 0} / ${tyreLimit}`} sub="tyre limit" />
        )}
        <KeyNumber label="Refuel" value={fmtSeconds(refuelSeconds)} />
        <KeyNumber
          label={isLmu ? 'Tyres (4 / 1-2)' : 'Tyres'}
          value={isLmu ? `${fmtSeconds(tyreSeconds)} / ${fmtSeconds(partialTyreSeconds)}` : fmtSeconds(tyreSeconds)}
        />
        <KeyNumber label="Drive-thru" value={fmtSeconds(driveThroughSeconds)} />
      </div>

      {/* Stint table */}
      <div className="mt-[3mm]">
        {raceStart && (
          <p className="m-0 mb-[1mm] text-[8pt] text-[#444]">
            Clock times are {raceStart.zone || 'local time'}.
            {hasSimClock && ' Sim time is the in-game clock at the start of the stint.'}
          </p>
        )}
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '9mm' }} />
            <col style={{ width: hasSimClock ? '36mm' : '40mm' }} />
            <col style={{ width: '15mm' }} />
            <col style={{ width: '15mm' }} />
            {hasSimClock && <col style={{ width: '15mm' }} />}
            <col style={{ width: '17mm' }} />
            <col style={{ width: '12mm' }} />
            <col style={{ width: '36mm' }} />
            <col style={{ width: '16mm' }} />
            <col style={{ width: '25mm' }} />
            <col style={{ width: '12mm' }} />
            <col />
          </colgroup>
          <thead style={{ display: 'table-header-group', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
            <tr style={{ breakInside: 'avoid' }}>
              <th className={`${TH} text-center`}>#</th>
              <th className={TH}>Driver</th>
              <th className={TH}>Start</th>
              <th className={TH}>End</th>
              {hasSimClock && <th className={TH}>Sim</th>}
              <th className={TH}>Duration</th>
              <th className={`${TH} text-right pr-2.5`}>Laps</th>
              <th className={TH}>Pit stop (before)</th>
              <th className={TH}>Tyres</th>
              <th className={TH}>Weather</th>
              <th className={`${TH} text-center`}>Done</th>
              <th className={TH}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {stints.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className={`${TD} py-4`}>
                  No stints planned yet.
                </td>
              </tr>
            ) : (
              stints.map((stint) => (
                <tr key={stint.number} style={{ breakInside: 'avoid', pageBreakInside: 'avoid', height: '9mm' }}>
                  <td className={`${TD} text-center text-[12pt] font-extrabold tabular-nums`}>{stint.number}</td>
                  <td className={`${TD} font-bold`} style={{ overflowWrap: 'anywhere' }}>
                    {stint.driverName ?? DASH}
                  </td>
                  <td className={`${TD} font-semibold tabular-nums`}>{stint.startClock ?? DASH}</td>
                  <td className={`${TD} font-semibold tabular-nums`}>{stint.endClock ?? DASH}</td>
                  {hasSimClock && <td className={`${TD} tabular-nums`}>{stint.simTime ?? DASH}</td>}
                  <td className={`${TD} tabular-nums`}>{stint.duration}</td>
                  <td className={`${TD} pr-2.5 text-right tabular-nums`}>{stint.estLaps ?? DASH}</td>
                  <td className={`${TD} text-[9pt]`}>
                    {stint.pitLabel === null ? (
                      <span className="text-[#444]">Race start</span>
                    ) : (
                      <>
                        {stint.pitLabel}
                        {stint.pitTotal && <span className="font-bold tabular-nums"> {stint.pitTotal}</span>}
                      </>
                    )}
                  </td>
                  <td className={`${TD} font-semibold`}>{stint.tyres}</td>
                  <td className={TD}>
                    <div className="font-semibold leading-tight">{stint.weather}</div>
                    {stint.weatherNote && <div className="text-[7.5pt] leading-tight text-[#444]">{stint.weatherNote}</div>}
                  </td>
                  <td className={`${TD} text-center`}>
                    <span className="inline-block h-[5.5mm] w-[5.5mm] border-[1.5px] border-[#000] align-middle" aria-hidden="true" />
                  </td>
                  <td className={TD} />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Drivers */}
      {drivers.length > 0 && (
        <div className="mt-[5mm]">
          <h2 className="m-0 mb-[1.5mm] text-[11pt] font-extrabold uppercase tracking-[0.04em]" style={{ breakAfter: 'avoid' }}>
            Drivers
          </h2>
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '48mm' }} />
              <col style={{ width: '42mm' }} />
              <col />
            </colgroup>
            <thead style={{ display: 'table-header-group', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              <tr style={{ breakInside: 'avoid' }}>
                <th className={TH}>Driver</th>
                <th className={TH}>Time zone</th>
                <th className={TH}>Stints (# · start on their own clock)</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver, index) => (
                // Two drivers can share a name (e.g. unnamed guests), so the position disambiguates.
                <tr key={`${index}:${driver.name}:${driver.timezone ?? ''}`} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <td className={`${TD} py-[1.2mm] font-bold`} style={{ overflowWrap: 'anywhere' }}>
                    {driver.name}
                  </td>
                  <td className={`${TD} py-[1.2mm]`} style={{ overflowWrap: 'anywhere' }}>
                    {driver.timezone ?? DASH}
                  </td>
                  <td className={`${TD} py-[1.2mm]`}>
                    {driver.stints.length === 0 ? (
                      DASH
                    ) : (
                      <span className="flex flex-wrap gap-x-4 gap-y-0.5">
                        {driver.stints.map((s) => (
                          <span key={s.number} className="whitespace-nowrap tabular-nums">
                            <span className="font-bold">#{s.number}</span> {s.localStart ?? DASH}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-[5mm] border-t border-[#8a8a8a] pt-[1.5mm] text-[8pt] text-[#444]" style={{ breakInside: 'avoid' }}>
        Printed {formatPrinted(printedAt)} · Plan as of last edit · {eventTitle} · {teamName}
      </footer>
    </section>
  );
}
