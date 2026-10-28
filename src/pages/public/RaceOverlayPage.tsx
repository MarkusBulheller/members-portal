import { type CSSProperties, type ReactNode, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  clockReadout,
  formatCountdownLong,
  formatHms,
  formatUntil,
  type FollowView,
  stintTiming,
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

/** One block of the overlay. In the bar layout it is a fixed-width column (so text changes never move
 * its neighbours); in the card layout a full-width row. */
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
      ? { width: px(width), borderLeft: divider }
      : { width: '100%', borderTop: divider };
  return (
    <div
      style={{
        ...style,
        boxSizing: 'border-box',
        flex: 'none',
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
    // `stint` alone (no driver block) still gets a small block so the option never yields an empty overlay.
    if (cells.length === 0 && show('stint')) {
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
  const panelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: options.layout === 'bar' ? 'row' : 'column',
    alignItems: 'stretch',
    width: options.layout === 'card' ? px(560) : undefined,
    maxWidth: '100%',
    background: 'var(--ov-bg)',
    boxShadow: `inset 0 calc(-4px * var(--s)) 0 var(--ov-accent)`,
    clipPath: options.cut ? cut(14) : undefined,
    paddingBottom: px(4),
    boxSizing: 'border-box',
  };

  const message =
    error === 'inactive' ? 'This link is no longer active.' : !view && error === 'failed' ? 'Reconnecting…' : null;

  return (
    <div style={rootStyle}>
      {message ? (
        <div style={{ ...panelStyle, flexDirection: 'row', clipPath: options.cut ? cut(14) : undefined }}>
          <Message>{message}</Message>
        </div>
      ) : view && cells.length > 0 ? (
        <div style={panelStyle}>{cells}</div>
      ) : null}
    </div>
  );
}
