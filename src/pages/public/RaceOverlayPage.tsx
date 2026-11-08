import { type CSSProperties, type ReactNode, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  clockReadout,
  formatCountdownLong,
  formatDrift,
  formatFuel,
  formatHms,
  formatLocalTime,
  formatStopWork,
  formatUntil,
  type FollowView,
  nextStopInfo,
  simTimeOfDay,
  stintTiming,
  upcomingStops,
} from '../../lib/followState';
import { type OverlayOptions, type OverlayPart, parseOverlayOptions } from '../../lib/overlayOptions';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { type FollowConnection, useFollowNow, useFollowState } from '../../lib/useFollowState';

/** `calc(Npx * var(--s))` - every size on the overlay goes through this so `?scale=` scales it all. */
const px = (n: number) => `calc(${n}px * var(--s))`;

const PALETTES: Record<'dark' | 'light', CSSProperties> = {
  dark: {
    '--ov-bg': 'rgba(11, 11, 12, 0.84)',
    '--ov-ink': '#f5f5f5',
    '--ov-muted': '#bcbcc4',
    '--ov-line': 'rgba(255, 255, 255, 0.18)',
    '--ov-accent': 'var(--color-w2w-red-bright)',
    '--ov-shadow': '0 1px 3px rgba(0, 0, 0, 0.6)',
  } as CSSProperties,
  light: {
    '--ov-bg': 'rgba(255, 255, 255, 0.92)',
    '--ov-ink': '#111113',
    '--ov-muted': '#4a4a52',
    '--ov-line': 'rgba(0, 0, 0, 0.16)',
    '--ov-accent': 'var(--color-w2w-red)',
    '--ov-shadow': 'none',
  } as CSSProperties,
};

const cut = (n: number) =>
  `polygon(${px(n)} 0, 100% 0, 100% calc(100% - ${px(n)}), calc(100% - ${px(n)}) 100%, 0 100%, 0 ${px(n)})`;

const labelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: px(10),
  fontSize: px(14),
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  lineHeight: 1.2,
  color: 'var(--ov-muted)',
  whiteSpace: 'nowrap',
};

const ellipsis: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/** One block of the main row. In the bar layout it is a column with a set width (so text changes
 * never move its neighbours) that may shrink when the row would not fit the screen (names are then
 * cut with an ellipsis instead of the whole overlay being cut off); in the card layout a full-width row. */
function Cell({
  layout,
  width,
  first,
  children,
}: {
  layout: OverlayOptions['layout'];
  width: number;
  first: boolean;
  children: ReactNode;
}) {
  const divider = first ? undefined : '1px solid var(--ov-line)';
  const style: CSSProperties =
    layout === 'bar'
      ? { width: px(width), flex: '0 1 auto', borderLeft: divider }
      : { width: '100%', flex: 'none', borderTop: divider };
  return (
    <div
      style={{
        ...style,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: px(4),
        padding: `${px(layout === 'bar' ? 14 : 12)} ${px(24)}`,
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

function StintTag({ number, count }: { number: number; count: number }) {
  return (
    <span
      className="num"
      style={{
        background: 'var(--ov-accent)',
        color: '#fff',
        padding: `${px(1)} ${px(10)}`,
        fontSize: px(14),
        letterSpacing: 0,
        textShadow: 'none',
        clipPath: `polygon(${px(5)} 0, 100% 0, calc(100% - ${px(5)}) 100%, 0 100%)`,
      }}
    >
      {number}/{count}
    </span>
  );
}

function ClockCell(props: { view: FollowView; offsetMs: number; layout: OverlayOptions['layout']; first: boolean; connection: FollowConnection }) {
  const { view, offsetMs, layout, first, connection } = props;
  const nowMs = useFollowNow(offsetMs);
  const c = clockReadout(view, nowMs);
  let label = 'Race clock';
  let value = '--:--:--';
  let sub: string | null = null;
  if (c.phase === 'before') {
    label = 'Green flag in';
    value = formatCountdownLong(c.untilStartMs ?? 0);
  } else if (c.phase === 'live') {
    label = 'Elapsed';
    value = formatHms(c.elapsedMs ?? 0);
    sub = `${formatHms(c.remainingMs ?? 0)} left`;
  } else if (c.phase === 'finished') {
    label = 'Chequered flag';
    value = 'FINISHED';
  }
  return (
    <Cell layout={layout} width={310} first={first}>
      <div style={labelStyle}>
        <span>{label}</span>
        {connection === 'reconnecting' && (
          <span title="Reconnecting…" style={{ width: px(8), height: px(8), background: '#f5b041', flex: 'none' }} />
        )}
        {sub && (
          <span className="num" style={{ marginLeft: 'auto', letterSpacing: 0, color: 'var(--ov-muted)' }}>
            {sub}
          </span>
        )}
      </div>
      <div className="num" style={{ fontSize: px(layout === 'bar' ? 54 : 46), lineHeight: 1.05, minWidth: '8ch', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </Cell>
  );
}

function DriverCell(props: { view: FollowView; layout: OverlayOptions['layout']; first: boolean; showStint: boolean }) {
  const { view, layout, first, showStint } = props;
  const { current } = view;
  let label = 'Driving now';
  let value: string;
  if (current) value = current.driverName;
  else if (view.phase === 'finished') value = 'Race finished';
  else if (view.changeover) {
    label = 'Driver change';
    value = 'Pit stop';
  } else if (view.phase === 'before') value = 'Not started';
  else value = 'Not scheduled';
  return (
    <Cell layout={layout} width={560} first={first}>
      <div style={{ ...labelStyle, color: 'var(--ov-accent)' }}>
        <span>{label}</span>
        {showStint && current && <StintTag number={current.number} count={view.stintCount} />}
      </div>
      <div
        key={`${current?.number ?? 'none'}-${value}`}
        className="ov-fade"
        style={{ ...ellipsis, fontSize: px(layout === 'bar' ? 46 : 40), fontWeight: 800, lineHeight: 1.1, paddingBottom: px(2) }}
      >
        {value}
      </div>
    </Cell>
  );
}

function NextCell(props: { view: FollowView; offsetMs: number; layout: OverlayOptions['layout']; first: boolean }) {
  const { view, offsetMs, layout, first } = props;
  const nowMs = useFollowNow(offsetMs);
  const { next } = view;
  const t = stintTiming(view, nowMs);
  const size = layout === 'bar' ? 34 : 30;
  return (
    <Cell layout={layout} width={470} first={first}>
      <div style={labelStyle}>
        <span>Next</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: px(14), minWidth: 0 }}>
        <div
          key={next?.number ?? 'none'}
          className="ov-fade"
          style={{ ...ellipsis, flex: '1 1 auto', fontSize: px(size), fontWeight: 800, lineHeight: 1.15, paddingBottom: px(2) }}
        >
          {next ? next.driverName : view.phase === 'finished' ? '-' : 'Final stint'}
        </div>
        {next && t.untilNextMs !== null && (
          <div className="num" style={{ flex: 'none', minWidth: '5.2ch', textAlign: 'right', fontSize: px(size), lineHeight: 1.15, color: 'var(--ov-accent)' }}>
            {formatUntil(t.untilNextMs)}
          </div>
        )}
      </div>
    </Cell>
  );
}

/** A compact value tile of the stats row (fuel, sim time, vs plan): equal width, so the row lines up
 * under the main row whatever is switched on. */
function StatTile(props: { label: string; note?: string | null; value: string; color?: string; first: boolean }) {
  const { label, note, value, color, first } = props;
  return (
    <div
      style={{
        flex: `1 1 ${px(150)}`,
        minWidth: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: px(2),
        padding: `${px(10)} ${px(24)}`,
        borderLeft: first ? undefined : '1px solid var(--ov-line)',
      }}
    >
      <div style={{ ...labelStyle, fontSize: px(12), justifyContent: 'space-between' }}>
        <span>{label}</span>
        {note && <span style={{ letterSpacing: 0, textTransform: 'none', fontSize: px(12), color: 'var(--ov-muted)' }}>{note}</span>}
      </div>
      <div className="num" style={{ ...ellipsis, fontSize: px(32), fontWeight: 800, lineHeight: 1.1, color }}>
        {value}
      </div>
    </div>
  );
}

/** Strategy link only: litres for the next stint and what is done at that stop. */
function FuelTile({ view, first }: { view: FollowView; first: boolean }) {
  const next = view.next;
  return (
    <StatTile
      label="Fuel next"
      note={next ? formatStopWork(next.tyres) : null}
      value={(next && formatFuel(next.fuelLiters)) ?? '-'}
      first={first}
    />
  );
}

function SimTimeTile({ view, offsetMs, first }: { view: FollowView; offsetMs: number; first: boolean }) {
  const nowMs = useFollowNow(offsetMs);
  return <StatTile label="Sim time" value={simTimeOfDay(view, nowMs) ?? '--:--'} first={first} />;
}

/** Strategy link only: how far the race runs from the plan (positive = behind). */
function DriftTile({ view, first }: { view: FollowView; first: boolean }) {
  const drift = view.driftSeconds;
  const behind = drift !== null && drift >= 5;
  const ahead = drift !== null && drift <= -5;
  return (
    <StatTile
      label="Vs plan"
      note={drift === null ? null : behind ? 'behind' : ahead ? 'ahead' : 'on plan'}
      value={drift === null ? '-' : formatDrift(drift)}
      color={behind ? '#f5b041' : ahead ? '#4ade80' : undefined}
      first={first}
    />
  );
}

const STOPS_LISTED = 3;

/** The next few stops: when, who gets in, and (strategy link) the fuel and what is done. Side by side
 * in the bar layout, stacked in the card layout. */
function StopsBlock({ view, layout }: { view: FollowView; layout: OverlayOptions['layout'] }) {
  const stops = upcomingStops(view, STOPS_LISTED);
  if (stops.length === 0) return null;
  return (
    <div style={{ borderTop: '1px solid var(--ov-line)', padding: `${px(10)} 0 ${px(6)}`, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ ...labelStyle, fontSize: px(12), padding: `0 ${px(24)} ${px(4)}` }}>Next stops</div>
      <div style={{ display: 'flex', flexDirection: layout === 'bar' ? 'row' : 'column' }}>
        {stops.map((stop, i) => {
          const meta = [formatFuel(stop.fuelLiters), formatStopWork(stop.tyres)].filter(Boolean).join(' · ');
          return (
            <div
              key={stop.number}
              style={{
                flex: layout === 'bar' ? '1 1 0' : 'none',
                minWidth: 0,
                boxSizing: 'border-box',
                padding: `${px(layout === 'bar' ? 2 : 3)} ${px(24)}`,
                borderLeft: layout === 'bar' && i > 0 ? '1px solid var(--ov-line)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: px(12), minWidth: 0 }}>
                <span className="num" style={{ flex: 'none', fontSize: px(20), fontWeight: 800, color: 'var(--ov-accent)' }}>
                  {stop.startMs !== null ? formatLocalTime(stop.startMs) : '--:--'}
                </span>
                <span style={{ ...ellipsis, fontSize: px(22), fontWeight: 700 }}>{stop.driverName}</span>
                {layout === 'card' && meta && (
                  <span className="num" style={{ flex: 'none', marginLeft: 'auto', fontSize: px(16), color: 'var(--ov-muted)' }}>
                    {meta}
                  </span>
                )}
              </div>
              {layout === 'bar' && meta && (
                <div className="num" style={{ ...ellipsis, fontSize: px(15), color: 'var(--ov-muted)' }}>
                  {meta}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A thin full-width row under the cells (progress bars, roster). */
function Strip({ layout, children }: { layout: OverlayOptions['layout']; children: ReactNode }) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--ov-line)',
        padding: `${px(10)} ${px(layout === 'bar' ? 24 : 24)}`,
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

/** Colours the drivers get on the race bar, in order of first appearance. */
const DRIVER_COLORS = ['#e10600', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];
const UNASSIGNED_COLOR = '#6b6b75';

function driverColors(view: FollowView): Map<string, string> {
  const colors = new Map<string, string>();
  for (const stint of view.stints) {
    if (stint.assigned && !colors.has(stint.driverName)) colors.set(stint.driverName, DRIVER_COLORS[colors.size % DRIVER_COLORS.length]);
  }
  return colors;
}

function Bar({ fraction, height, color = 'var(--ov-accent)' }: { fraction: number; height: number; color?: string }) {
  return (
    <div style={{ height: px(height), background: 'var(--ov-line)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10}%`, background: color }} />
    </div>
  );
}

function StintBarStrip(props: { view: FollowView; offsetMs: number; layout: OverlayOptions['layout'] }) {
  const { view, offsetMs, layout } = props;
  const nowMs = useFollowNow(offsetMs);
  const progress = stintTiming(view, nowMs).progress;
  return (
    <Strip layout={layout}>
      <div style={{ ...labelStyle, justifyContent: 'space-between', marginBottom: px(6) }}>
        <span>{view.current ? `Stint ${view.current.number}/${view.stintCount}` : 'Stint'}</span>
        <span className="num" style={{ letterSpacing: 0 }}>{progress === null ? '-' : `${Math.round(progress * 100)}%`}</span>
      </div>
      <Bar fraction={progress ?? 0} height={8} />
    </Strip>
  );
}

/** The race split into its stints, coloured by driver; a marker shows where the race is now. */
function RaceBarStrip(props: { view: FollowView; offsetMs: number; layout: OverlayOptions['layout'] }) {
  const { view, offsetMs, layout } = props;
  const nowMs = useFollowNow(offsetMs);
  const colors = useMemo(() => driverColors(view), [view]);
  const progress = clockReadout(view, nowMs).progress;
  const weights = view.stints.map((s) => (s.startMs !== null && s.endMs !== null ? Math.max(s.endMs - s.startMs, 1) : 1));
  return (
    <Strip layout={layout}>
      <div style={{ position: 'relative', display: 'flex', gap: px(2), height: px(14) }}>
        {view.stints.map((stint, i) => (
          <div
            key={stint.number}
            title={`${stint.number}: ${stint.driverName}`}
            style={{
              flex: `${weights[i]} 1 0`,
              minWidth: 0,
              background: stint.assigned ? (colors.get(stint.driverName) ?? UNASSIGNED_COLOR) : UNASSIGNED_COLOR,
              opacity: stint.status === 'done' ? 0.4 : stint.status === 'live' ? 1 : 0.75,
            }}
          />
        ))}
        {progress !== null && (
          <div
            style={{
              position: 'absolute',
              top: px(-4),
              bottom: px(-4),
              left: `${Math.round(progress * 1000) / 10}%`,
              width: px(3),
              background: 'var(--ov-ink)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
            }}
          />
        )}
      </div>
    </Strip>
  );
}

/** Every driver of the crew: the one in the car, the one up next, and the rest resting. */
function RosterStrip(props: { view: FollowView; layout: OverlayOptions['layout'] }) {
  const { view, layout } = props;
  const colors = useMemo(() => driverColors(view), [view]);
  const names = [...colors.keys()];
  if (names.length === 0) return null;
  return (
    <Strip layout={layout}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${px(6)} ${px(16)}` }}>
        {names.map((name) => {
          const state = view.current?.driverName === name ? 'car' : view.next?.driverName === name ? 'next' : 'rest';
          return (
            <span
              key={name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: px(8),
                fontSize: px(18),
                fontWeight: state === 'rest' ? 600 : 800,
                color: state === 'rest' ? 'var(--ov-muted)' : 'var(--ov-ink)',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: px(10),
                  height: px(10),
                  flex: 'none',
                  background: state === 'rest' ? 'transparent' : colors.get(name),
                  border: `${px(2)} solid ${colors.get(name)}`,
                  boxSizing: 'border-box',
                }}
              />
              {name}
              {state !== 'rest' && (
                <span style={{ fontSize: px(12), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ov-accent)' }}>
                  {state === 'car' ? 'in car' : 'next'}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </Strip>
  );
}

/** Pops up shortly before a stop (and while the car is in the pit), then goes away again. On a
 * strategy link it also says how much fuel goes in and what is done at the stop. */
function PitBanner(props: { view: FollowView; offsetMs: number; alertMinutes: number; panelStyle: CSSProperties }) {
  const { view, offsetMs, alertMinutes, panelStyle } = props;
  const nowMs = useFollowNow(offsetMs);
  const stop = nextStopInfo(view, nowMs);
  if (!stop || (!stop.inPit && stop.untilMs > alertMinutes * 60_000)) return null;
  const fuel = formatFuel(stop.fuelLiters);
  const work = formatStopWork(stop.tyres);
  const when = stop.inPit ? 'IN PIT' : stop.untilMs < 60_000 ? 'PIT NOW' : `PIT IN ${formatUntil(stop.untilMs)}`;
  return (
    <div className="ov-fade" style={{ ...panelStyle, flexDirection: 'row', alignItems: 'center', width: undefined, maxWidth: '100%' }}>
      <div
        className="num"
        style={{ background: 'var(--ov-accent)', color: '#fff', padding: `${px(14)} ${px(24)}`, fontSize: px(34), fontWeight: 800, textShadow: 'none', whiteSpace: 'nowrap' }}
      >
        {when}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: px(18), padding: `${px(12)} ${px(24)}`, minWidth: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: px(34), fontWeight: 800, whiteSpace: 'nowrap' }}>{stop.driverName} in</span>
        {fuel && <span className="num" style={{ fontSize: px(34), fontWeight: 800, color: 'var(--ov-accent)', whiteSpace: 'nowrap' }}>{fuel}</span>}
        {work && <span style={{ fontSize: px(24), fontWeight: 700, color: 'var(--ov-muted)', whiteSpace: 'nowrap' }}>{work}</span>}
      </div>
    </div>
  );
}

function Message({ children }: { children: string }) {
  return (
    <div style={{ padding: `${px(14)} ${px(24)}`, fontSize: px(22), fontWeight: 800, color: 'var(--ov-ink)' }}>{children}</div>
  );
}

/** Body class for this route only: makes html/body transparent (OBS Browser Source), hides scrollbars. */
function useOverlayMode() {
  useEffect(() => {
    document.documentElement.classList.add('overlay-mode');
    document.body.classList.add('overlay-mode');
    return () => {
      document.documentElement.classList.remove('overlay-mode');
      document.body.classList.remove('overlay-mode');
    };
  }, []);
}

/**
 * Transparent, chrome-free overlay for an OBS Browser Source (1920x1080), fed by the same live data
 * as the follow page. Options come from the query string - see lib/overlayOptions.ts:
 * layout=bar|card, scale=0.5..3, theme=dark|light|auto, align=left|right|center, valign=top|bottom,
 * show=clock,driver,next,stint, cut=0|1. Never shows anything but names, stint numbers and times.
 */
export default function RaceOverlayPage() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const queryString = params.toString();
  const options = useMemo(() => parseOverlayOptions(new URLSearchParams(queryString)), [queryString]);
  useOverlayMode();

  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = options.theme === 'auto' ? prefersDark : options.theme === 'dark';
  const { view, connection, error, offsetMs } = useFollowState(token);

  const show = (part: OverlayPart) => options.show.has(part);
  const cells: ReactNode[] = [];
  const tiles: ReactNode[] = [];
  if (view) {
    const first = () => cells.length === 0;
    if (show('clock')) {
      cells.push(<ClockCell key="clock" view={view} offsetMs={offsetMs} layout={options.layout} first={first()} connection={connection} />);
    }
    if (show('driver')) {
      cells.push(<DriverCell key="driver" view={view} layout={options.layout} first={first()} showStint={show('stint')} />);
    }
    if (show('next')) {
      cells.push(<NextCell key="next" view={view} offsetMs={offsetMs} layout={options.layout} first={first()} />);
    }
    // The compact stats row under the main row. Fuel and vs-plan need strategy data, which only a
    // strategy link carries: they are skipped on a public one.
    const showFuel = show('fuel') && view.hasStrategy;
    const showSim = show('simtime') && view.simStartTimeOfDay !== null;
    const showDrift = show('drift') && view.hasStrategy;
    if (showFuel) tiles.push(<FuelTile key="fuel" view={view} first={tiles.length === 0} />);
    if (showSim) tiles.push(<SimTimeTile key="simtime" view={view} offsetMs={offsetMs} first={tiles.length === 0} />);
    if (showDrift) tiles.push(<DriftTile key="drift" view={view} first={tiles.length === 0} />);
    // `stint` alone (no driver block) still gets a small block so the option never yields an empty overlay.
    if (
      cells.length === 0 &&
      tiles.length === 0 &&
      show('stint') &&
      !show('stops') &&
      !show('stintbar') &&
      !show('racebar') &&
      !show('roster')
    ) {
      cells.push(
        <Cell key="stint" layout={options.layout} width={220} first>
          <div style={labelStyle}>Stint</div>
          <div className="num" style={{ fontSize: px(46), lineHeight: 1.05 }}>
            {view.current ? `${view.current.number}/${view.stintCount}` : '-'}
          </div>
        </Cell>,
      );
    }
  }

  const alignItems = { left: 'flex-start', right: 'flex-end', center: 'center' }[options.align];
  const rootStyle: CSSProperties = {
    ...PALETTES[dark ? 'dark' : 'light'],
    ['--s' as string]: options.scale,
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
    padding: px(32),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: options.valign === 'top' ? 'flex-start' : 'flex-end',
    alignItems,
    fontFamily: 'var(--font-body)',
    color: 'var(--ov-ink)',
    textShadow: 'var(--ov-shadow)',
    background: 'transparent',
  };
  // The cells sit in a row (bar) or a column (card); strips (progress bars, roster) go beneath them,
  // inside the same panel.
  const stopsBlock = view && show('stops') ? <StopsBlock key="stops" view={view} layout={options.layout} /> : null;
  const strips: ReactNode[] = [];
  if (view) {
    if (show('stintbar')) strips.push(<StintBarStrip key="stintbar" view={view} offsetMs={offsetMs} layout={options.layout} />);
    if (show('racebar')) strips.push(<RaceBarStrip key="racebar" view={view} offsetMs={offsetMs} layout={options.layout} />);
    if (show('roster')) strips.push(<RosterStrip key="roster" view={view} layout={options.layout} />);
  }
  const hasPanel = cells.length > 0 || tiles.length > 0 || stopsBlock !== null || strips.length > 0;
  const cellsStyle: CSSProperties = {
    display: 'flex',
    flexDirection: options.layout === 'bar' ? 'row' : 'column',
    alignItems: 'stretch',
    width: '100%',
  };
  const panelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    width: options.layout === 'card' ? px(560) : 'fit-content',
    minWidth: options.layout === 'card' ? undefined : px(640),
    maxWidth: '100%',
    background: 'var(--ov-bg)',
    boxShadow: `inset 0 calc(-4px * var(--s)) 0 var(--ov-accent)`,
    clipPath: options.cut ? cut(14) : undefined,
    paddingBottom: px(4),
    boxSizing: 'border-box',
  };

  const message =
    error === 'inactive' ? 'This link is no longer active.' : !view && error === 'failed' ? 'Reconnecting…' : null;

  // The pit banner grows away from the screen edge the overlay is pinned to.
  const banner =
    !message && view && show('pit') ? (
      <PitBanner view={view} offsetMs={offsetMs} alertMinutes={options.alertMinutes} panelStyle={{ ...panelStyle, marginBottom: undefined }} />
    ) : null;
  const main =
    message ? (
      <div style={{ ...panelStyle, flexDirection: 'row', clipPath: options.cut ? cut(14) : undefined }}>
        <Message>{message}</Message>
      </div>
    ) : view && hasPanel ? (
      <div style={panelStyle}>
        {cells.length > 0 && <div style={cellsStyle}>{cells}</div>}
        {tiles.length > 0 && (
          <div style={{ display: 'flex', width: '100%', borderTop: cells.length > 0 ? '1px solid var(--ov-line)' : undefined }}>
            {tiles}
          </div>
        )}
        {stopsBlock}
        {strips}
      </div>
    ) : null;

  return (
    <div style={rootStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems, gap: px(12), maxWidth: '100%' }}>
        {options.valign === 'top' ? (
          <>
            {main}
            {banner}
          </>
        ) : (
          <>
            {banner}
            {main}
          </>
        )}
      </div>
    </div>
  );
}
