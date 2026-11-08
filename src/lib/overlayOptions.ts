/** Query options of the OBS overlay (`/overlay/:token?layout=bar&scale=1.5&...`). Every option is
 * optional; anything missing or invalid quietly falls back to its default, so a typo in a URL pasted
 * into OBS never produces a blank source. */

export type OverlayLayout = 'bar' | 'card';
export type OverlayTheme = 'dark' | 'light' | 'auto';
export type OverlayAlign = 'left' | 'right' | 'center';
export type OverlayValign = 'top' | 'bottom';
/** Every block of the overlay. Each is switched on or off with `show=` (comma separated). The ones
 * marked "strategy" only appear on a strategy link — they need fuel/tyre data, which the public
 * link never carries; on a public link they are quietly skipped. */
export type OverlayPart =
  | 'clock' // race clock
  | 'driver' // who is driving now
  | 'next' // who is next, and in how long
  | 'stint' // the stint number tag
  | 'pit' // pop-up banner shortly before a stop (fuel and tyres too on a strategy link)
  | 'fuel' // strategy: litres for the next stint
  | 'stops' // the next few stops: time and driver (strategy link: fuel and tyres too)
  | 'stintbar' // progress through the current stint
  | 'racebar' // the race split into stints, coloured by driver
  | 'roster' // the drivers: in the car, up next, resting
  | 'simtime' // in-game time of day
  | 'drift'; // strategy: how far the race runs from the plan

/** All parts, in the order they are drawn. */
export const OVERLAY_PARTS: readonly OverlayPart[] = [
  'clock',
  'driver',
  'next',
  'stint',
  'fuel',
  'simtime',
  'drift',
  'stops',
  'stintbar',
  'racebar',
  'roster',
  'pit',
];
/** What shows without a `show=` option: the original four, so existing overlay URLs look the same. */
export const OVERLAY_DEFAULT_PARTS: readonly OverlayPart[] = ['clock', 'driver', 'next', 'stint'];
/** Parts that only exist on a strategy link. (`stops` and `pit` work on both: on a public link they
 * show times and drivers, a strategy link adds fuel and tyres.) */
export const OVERLAY_STRATEGY_PARTS: ReadonlySet<OverlayPart> = new Set(['fuel', 'drift']);
export const OVERLAY_SCALE_MIN = 0.5;
export const OVERLAY_SCALE_MAX = 3;
/** The pit banner appears this many minutes before a stop unless `alert=` says otherwise. */
export const OVERLAY_ALERT_DEFAULT_MINUTES = 15;
export const OVERLAY_ALERT_MIN_MINUTES = 1;
export const OVERLAY_ALERT_MAX_MINUTES = 120;

export interface OverlayOptions {
  layout: OverlayLayout;
  scale: number;
  theme: OverlayTheme;
  align: OverlayAlign;
  valign: OverlayValign;
  show: ReadonlySet<OverlayPart>;
  /** Minutes before a stop that the pit banner appears. */
  alertMinutes: number;
  cut: boolean;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  const v = value?.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
}

function parseAlertMinutes(value: string | null): number {
  const n = Number(value);
  if (value === null || value.trim() === '' || !Number.isFinite(n)) return OVERLAY_ALERT_DEFAULT_MINUTES;
  return Math.min(OVERLAY_ALERT_MAX_MINUTES, Math.max(OVERLAY_ALERT_MIN_MINUTES, Math.round(n)));
}

export function parseOverlayOptions(params: URLSearchParams): OverlayOptions {
  const rawScale = Number(params.get('scale'));
  const scale =
    params.get('scale') !== null && params.get('scale') !== '' && Number.isFinite(rawScale)
      ? Math.min(OVERLAY_SCALE_MAX, Math.max(OVERLAY_SCALE_MIN, rawScale))
      : 1;

  const parts = (params.get('show') ?? '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is OverlayPart => (OVERLAY_PARTS as readonly string[]).includes(p));

  return {
    layout: oneOf(params.get('layout'), ['bar', 'card'] as const, 'bar'),
    scale,
    theme: oneOf(params.get('theme'), ['dark', 'light', 'auto'] as const, 'dark'),
    align: oneOf(params.get('align'), ['left', 'right', 'center'] as const, 'left'),
    valign: oneOf(params.get('valign'), ['top', 'bottom'] as const, 'bottom'),
    show: new Set(parts.length > 0 ? parts : OVERLAY_DEFAULT_PARTS),
    alertMinutes: parseAlertMinutes(params.get('alert')),
    cut: params.get('cut') !== '0',
  };
}
