import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Switch from './Switch';
import { useConfirm } from '../context/ConfirmContext';
import { ApiError } from '../lib/api';
import { followLinkApi } from '../lib/api/followLink';
import {
  OVERLAY_ALERT_DEFAULT_MINUTES,
  OVERLAY_ALERT_MAX_MINUTES,
  OVERLAY_ALERT_MIN_MINUTES,
  OVERLAY_DEFAULT_PARTS,
  OVERLAY_PARTS,
  OVERLAY_SCALE_MAX,
  OVERLAY_SCALE_MIN,
  OVERLAY_STRATEGY_PARTS,
  type OverlayLayout,
  type OverlayPart,
  type OverlayTheme,
} from '../lib/overlayOptions';
import type { FollowLinkSettings, FollowNamesMode, UpdateFollowLinkInput } from '../types/follow';

const NAMES_MODES: { value: FollowNamesMode; label: string }[] = [
  { value: 'FULL', label: 'Full names' },
  { value: 'FIRST', label: 'First names' },
  { value: 'INITIALS', label: 'Initials' },
];

/** What each overlay block is called in the dialog, and what it shows. */
const PART_INFO: Record<OverlayPart, { label: string; hint: string }> = {
  clock: { label: 'Race clock', hint: 'Elapsed time and time left' },
  driver: { label: 'Driving now', hint: 'The driver on track' },
  stint: { label: 'Stint number', hint: 'The 3/12 tag next to the driver' },
  next: { label: 'Next driver', hint: 'Who is next and in how long' },
  pit: { label: 'Pit banner', hint: 'Pops up shortly before a stop (with fuel and tyres on a strategy link)' },
  fuel: { label: 'Fuel', hint: 'Litres for the next stint' },
  stops: { label: 'Next stops', hint: 'The next three stops (with fuel and tyres on a strategy link)' },
  stintbar: { label: 'Stint progress', hint: 'A bar for how far through this stint' },
  racebar: { label: 'Race bar', hint: 'The race split into stints, coloured by driver' },
  roster: { label: 'Drivers', hint: 'In the car, up next, resting' },
  simtime: { label: 'Sim time', hint: 'In-game time of day (needs the sim start time)' },
  drift: { label: 'Vs plan', hint: 'Time lost so far against the original plan (saved when the race starts)' },
};

/** Read-only URL field with a Copy button. */
function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (insecure origin / permissions): select the text so Ctrl+C works.
      inputRef.current?.select();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="lbl">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="input min-w-0 flex-1 text-[13px]"
        />
        <button type="button" onClick={() => void copy()} className="btn-secondary btn-sm !min-h-[42px] min-w-[84px]">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="seg seg-field self-start">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type LinkKind = 'public' | 'strategy';

/** The overlay is drawn for a 1920x1080 browser source. */
const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;
/** The preview waits this long after the last option change before reloading. */
const PREVIEW_DEBOUNCE_MS = 400;

/** The real overlay in a scaled-down frame, on a stand-in for a stream picture, so the options can be
 * judged without going to OBS. It loads the same page OBS would (and shows the live race). */
function OverlayPreview({ url }: { url: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [shownUrl, setShownUrl] = useState(url);

  useEffect(() => {
    const timer = setTimeout(() => setShownUrl(url), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [url]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // Sticks to the top of the dialog so it stays in view while the options below are changed.
    <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-1.5 bg-ds-panel px-1 pb-2 pt-1">
      <span className="lbl">Preview</span>
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: `${OVERLAY_WIDTH} / ${OVERLAY_HEIGHT}`,
          // No taller than 38% of the window, so a short window still has room for the options.
          maxWidth: `calc(38vh * ${OVERLAY_WIDTH} / ${OVERLAY_HEIGHT})`,
          background: 'linear-gradient(135deg, #2a2d36 0%, #14161b 55%, #0a0b0e 100%)',
        }}
      >
        {width > 0 && (
          <iframe
            key={shownUrl}
            src={shownUrl}
            title="Overlay preview"
            tabIndex={-1}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: OVERLAY_WIDTH,
              height: OVERLAY_HEIGHT,
              border: 0,
              transform: `scale(${width / OVERLAY_WIDTH})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
              background: 'transparent',
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Admin dialog on the team plan page: turns the team's live links on/off — the public one (who
 * drives when) and the private strategy one (adds fuel and tyres) — shows the follow page, builds
 * the OBS overlay URL (which blocks to show, layout, scale ...), picks how driver names are shown
 * and regenerates a link (which kills the old one immediately). */
export default function ShareLiveViewModal({
  eventId,
  teamId,
  onClose,
}: {
  eventId: string;
  teamId: string;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [settings, setSettings] = useState<FollowLinkSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The confirm dialog stacks on top of this one; Escape (a document-level listener in both) must
  // only dismiss the confirm, not also close this dialog underneath.
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [layout, setLayout] = useState<OverlayLayout>('bar');
  const [theme, setTheme] = useState<OverlayTheme>('dark');
  const [scaleInput, setScaleInput] = useState('1');
  const [linkKind, setLinkKind] = useState<LinkKind>('public');
  const [parts, setParts] = useState<ReadonlySet<OverlayPart>>(new Set(OVERLAY_DEFAULT_PARTS));
  const [alertInput, setAlertInput] = useState(String(OVERLAY_ALERT_DEFAULT_MINUTES));

  useEffect(() => {
    let cancelled = false;
    followLinkApi
      .get(eventId, teamId)
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Couldn't load the live link settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, teamId]);

  async function update(input: UpdateFollowLinkInput) {
    setBusy(true);
    setActionError(null);
    try {
      setSettings(await followLinkApi.update(eventId, teamId, input));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong - please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(kind: LinkKind) {
    setConfirming(true);
    const ok = await confirm('The old link stops working immediately.', {
      title: kind === 'strategy' ? 'Regenerate strategy link?' : 'Regenerate link?',
      confirmLabel: 'Regenerate',
    });
    // Released a tick later so the Escape that dismissed the confirm doesn't also reach onClose.
    setTimeout(() => setConfirming(false), 0);
    if (ok) await update(kind === 'strategy' ? { regenerateStrategy: true } : { regenerate: true });
  }

  function togglePart(part: OverlayPart, on: boolean) {
    setParts((current) => {
      const next = new Set(current);
      if (on) next.add(part);
      else next.delete(part);
      return next;
    });
  }

  const origin = window.location.origin;
  const publicToken = settings?.enabled ? settings.token : null;
  const strategyToken = settings?.strategy.enabled ? settings.strategy.token : null;
  // The overlay URL uses the chosen link; a link that is switched off can't be chosen.
  const overlayKind: LinkKind = linkKind === 'strategy' && strategyToken ? 'strategy' : publicToken ? 'public' : 'strategy';
  const overlayToken = overlayKind === 'strategy' ? strategyToken : publicToken;
  const scale = Number(scaleInput);
  const scaleValid = scaleInput.trim() !== '' && Number.isFinite(scale) && scale >= OVERLAY_SCALE_MIN && scale <= OVERLAY_SCALE_MAX;
  const alertMinutes = Number(alertInput);
  const alertValid =
    alertInput.trim() !== '' &&
    Number.isInteger(alertMinutes) &&
    alertMinutes >= OVERLAY_ALERT_MIN_MINUTES &&
    alertMinutes <= OVERLAY_ALERT_MAX_MINUTES;

  let overlayUrl = '';
  if (overlayToken) {
    const query = new URLSearchParams({ layout });
    if (scaleValid && Math.abs(scale - 1) > 1e-9) query.set('scale', String(scale));
    if (theme !== 'dark') query.set('theme', theme);
    const chosen = OVERLAY_PARTS.filter((part) => parts.has(part));
    const isDefault =
      chosen.length === OVERLAY_DEFAULT_PARTS.length && OVERLAY_DEFAULT_PARTS.every((part) => parts.has(part));
    if (!isDefault && chosen.length > 0) query.set('show', chosen.join(','));
    if (parts.has('pit') && alertValid && alertMinutes !== OVERLAY_ALERT_DEFAULT_MINUTES) query.set('alert', String(alertMinutes));
    overlayUrl = `${origin}/overlay/${overlayToken}?${query.toString()}`;
  }
  // The pit banner only shows shortly before a stop; the preview widens that window so you can see
  // it (the real overlay still uses the minutes you set).
  let previewUrl = overlayUrl;
  if (overlayUrl && parts.has('pit')) {
    const widened = new URL(overlayUrl);
    widened.searchParams.set('alert', String(OVERLAY_ALERT_MAX_MINUTES));
    previewUrl = widened.toString();
  }
  const onPublicLink = overlayKind === 'public';
  const strategyPartsChosen = OVERLAY_PARTS.filter((part) => OVERLAY_STRATEGY_PARTS.has(part) && parts.has(part));

  return (
    <Modal title="Share live view" wide onClose={() => !confirming && onClose()}>
      {loadError ? (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {loadError}
        </p>
      ) : !settings ? (
        <p role="status" className="m-0 text-sm text-ds-muted">
          Loading...
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-bold">Public live link</span>
              <span className="text-[13px] text-ds-muted">A page and an OBS overlay anyone with the link can open.</span>
            </div>
            <Switch
              label="Public live link"
              checked={settings.enabled}
              disabled={busy}
              onChange={(next) => void update({ enabled: next })}
            />
          </div>

          {actionError && (
            <p role="alert" className="m-0 text-[13px] text-ds-danger">
              {actionError}
            </p>
          )}

          {publicToken && (
            <>
              <CopyField id="follow-url" label="Follow page" value={`${origin}/follow/${publicToken}`} />

              <div className="flex flex-col gap-1.5">
                <span className="lbl">Driver names</span>
                <Segmented
                  label="Driver names"
                  value={settings.namesMode}
                  options={NAMES_MODES}
                  disabled={busy}
                  onChange={(next) => {
                    if (next !== settings.namesMode) void update({ namesMode: next });
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 min-w-0 flex-1 basis-[220px] text-xs leading-relaxed text-ds-muted">
                  Anyone with this link can see who drives when. Fuel, tyres, lap times and settings are never shown.
                </p>
                <button type="button" onClick={() => void regenerate('public')} disabled={busy} className="btn-danger btn-sm">
                  Regenerate link
                </button>
              </div>
            </>
          )}

          {!settings.enabled && (
            <p className="m-0 text-xs leading-relaxed text-ds-muted">
              Turn the link on to get a follow page and an OBS overlay for this team. Anyone with the link can see who
              drives when. Fuel, tyres, lap times and settings are never shown.
            </p>
          )}

          <div className="flex flex-col gap-3 border-t border-ds-line pt-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] font-bold">Private strategy link</span>
                <span className="text-[13px] text-ds-muted">
                  For your own stream or pit screen: the same overlay, plus fuel and tyres.
                </span>
              </div>
              <Switch
                label="Private strategy link"
                checked={settings.strategy.enabled}
                disabled={busy}
                onChange={(next) => void update({ strategyEnabled: next })}
              />
            </div>
            {strategyToken ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 min-w-0 flex-1 basis-[220px] text-xs leading-relaxed text-ds-warn">
                  Do not share this link: anyone with it sees your fuel and tyre strategy. Use it only in OBS or on a
                  screen of your own. The plan page has to be open for fuel and tyres to update.
                </p>
                <button type="button" onClick={() => void regenerate('strategy')} disabled={busy} className="btn-danger btn-sm">
                  Regenerate strategy link
                </button>
              </div>
            ) : (
              <p className="m-0 text-xs leading-relaxed text-ds-muted">
                Off. When on, it gives you a second link that works like the public one but also shows fuel, tyres and how
                the race runs against the plan. The public link never shows them.
              </p>
            )}
          </div>

          {overlayToken && (
            <div className="flex flex-col gap-3 border-t border-ds-line pt-5">
              <span className="text-[15px] font-bold">OBS overlay</span>
              {publicToken && strategyToken && (
                <div className="flex flex-col gap-1.5">
                  <span className="lbl">Link</span>
                  <Segmented
                    label="Overlay link"
                    value={overlayKind}
                    onChange={setLinkKind}
                    options={[
                      { value: 'public', label: 'Public' },
                      { value: 'strategy', label: 'Strategy' },
                    ]}
                  />
                </div>
              )}
              <CopyField id="overlay-url" label="Overlay URL" value={overlayUrl} />
              <OverlayPreview url={previewUrl} />
              {parts.has('pit') && (
                <p className="m-0 -mt-1 text-xs text-ds-muted">
                  The preview shows the pit banner whenever a stop is within {OVERLAY_ALERT_MAX_MINUTES} minutes. On stream it
                  appears {alertValid ? alertMinutes : OVERLAY_ALERT_DEFAULT_MINUTES} minutes before a stop.
                </p>
              )}
              <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
                <legend className="sr-only">Overlay options</legend>
                <span aria-hidden="true" className="lbl">Overlay options</span>
                <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="lbl">Layout</span>
                    <Segmented
                      label="Overlay layout"
                      value={layout}
                      onChange={setLayout}
                      options={[
                        { value: 'bar', label: 'Bar' },
                        { value: 'card', label: 'Card' },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="lbl">Theme</span>
                    <Segmented
                      label="Overlay theme"
                      value={theme}
                      onChange={setTheme}
                      options={[
                        { value: 'dark', label: 'Dark' },
                        { value: 'light', label: 'Light' },
                        { value: 'auto', label: 'Auto' },
                      ]}
                    />
                  </div>
                  <div className="flex w-[96px] flex-col gap-1.5">
                    <label htmlFor="overlay-scale" className="lbl">
                      Scale
                    </label>
                    <input
                      id="overlay-scale"
                      type="number"
                      inputMode="decimal"
                      min={OVERLAY_SCALE_MIN}
                      max={OVERLAY_SCALE_MAX}
                      step={0.1}
                      value={scaleInput}
                      aria-invalid={!scaleValid}
                      onChange={(e) => setScaleInput(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
                {!scaleValid && (
                  <span className="text-xs text-ds-warn">
                    Scale must be between {OVERLAY_SCALE_MIN} and {OVERLAY_SCALE_MAX}.
                  </span>
                )}
              </fieldset>

              <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
                <legend className="sr-only">What the overlay shows</legend>
                <span aria-hidden="true" className="lbl">What to show</span>
                <div className="grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
                  {OVERLAY_PARTS.map((part) => {
                    const strategyOnly = OVERLAY_STRATEGY_PARTS.has(part);
                    const unavailable = strategyOnly && onPublicLink;
                    return (
                      <label
                        key={part}
                        title={PART_INFO[part].hint}
                        className={`flex items-start gap-2 text-[13px] ${unavailable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={parts.has(part)}
                          disabled={unavailable}
                          onChange={(e) => togglePart(part, e.target.checked)}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-semibold text-ds-ink">{PART_INFO[part].label}</span>
                          <span className="text-xs text-ds-muted">{unavailable ? 'Strategy link only' : PART_INFO[part].hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {parts.has('pit') && (
                  <div className="flex w-[180px] flex-col gap-1.5">
                    <label htmlFor="overlay-alert" className="lbl">
                      Pit banner (minutes before)
                    </label>
                    <input
                      id="overlay-alert"
                      type="number"
                      inputMode="numeric"
                      min={OVERLAY_ALERT_MIN_MINUTES}
                      max={OVERLAY_ALERT_MAX_MINUTES}
                      step={1}
                      value={alertInput}
                      aria-invalid={!alertValid}
                      onChange={(e) => setAlertInput(e.target.value)}
                      className="input"
                    />
                  </div>
                )}
                {!alertValid && parts.has('pit') && (
                  <span className="text-xs text-ds-warn">
                    Minutes must be a whole number from {OVERLAY_ALERT_MIN_MINUTES} to {OVERLAY_ALERT_MAX_MINUTES}.
                  </span>
                )}
                {onPublicLink && strategyPartsChosen.length > 0 && (
                  <span className="text-xs text-ds-warn">Fuel and vs-plan need the strategy link; the public link skips them.</span>
                )}
              </fieldset>
              <p className="m-0 text-xs text-ds-muted">
                In OBS: Sources → + → Browser, paste the overlay URL, width 1920 height 1080.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
