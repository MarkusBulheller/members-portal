/** Query options of the OBS overlay (`/overlay/:token?layout=bar&scale=1.5&...`). Every option is
 * optional; anything missing or invalid quietly falls back to its default, so a typo in a URL pasted
 * into OBS never produces a blank source. */

export type OverlayLayout = 'bar' | 'card';
export type OverlayTheme = 'dark' | 'light' | 'auto';
export type OverlayAlign = 'left' | 'right' | 'center';
export type OverlayValign = 'top' | 'bottom';
export type OverlayPart = 'clock' | 'driver' | 'next' | 'stint';

export const OVERLAY_PARTS: readonly OverlayPart[] = ['clock', 'driver', 'next', 'stint'];
export const OVERLAY_SCALE_MIN = 0.5;
export const OVERLAY_SCALE_MAX = 3;

export interface OverlayOptions {
  layout: OverlayLayout;
  scale: number;
  theme: OverlayTheme;
  align: OverlayAlign;
  valign: OverlayValign;
  show: ReadonlySet<OverlayPart>;
  cut: boolean;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  const v = value?.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
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
    show: new Set(parts.length > 0 ? parts : OVERLAY_PARTS),
    cut: params.get('cut') !== '0',
  };
}
