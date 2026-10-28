import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Switch from './Switch';
import { useConfirm } from '../context/ConfirmContext';
import { ApiError } from '../lib/api';
import { followLinkApi } from '../lib/api/followLink';
import {
  OVERLAY_SCALE_MAX,
  OVERLAY_SCALE_MIN,
  type OverlayLayout,
  type OverlayTheme,
} from '../lib/overlayOptions';
import type { FollowLinkSettings, FollowNamesMode, UpdateFollowLinkInput } from '../types/follow';

const NAMES_MODES: { value: FollowNamesMode; label: string }[] = [
  { value: 'FULL', label: 'Full names' },
  { value: 'FIRST', label: 'First names' },
  { value: 'INITIALS', label: 'Initials' },
];

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
  options: { value: T; label: string }[];
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
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Admin dialog on the team plan page: turns the team's public live link on/off, shows the follow
 * page and OBS overlay URLs, lets the admin tune the overlay URL, pick how driver names are shown
 * and regenerate the link (which kills the old one immediately). */
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

  async function regenerate() {
    setConfirming(true);
    const ok = await confirm('The old link stops working immediately.', {
      title: 'Regenerate link?',
      confirmLabel: 'Regenerate',
    });
    // Released a tick later so the Escape that dismissed the confirm doesn't also reach onClose.
    setTimeout(() => setConfirming(false), 0);
    if (ok) await update({ regenerate: true });
  }

  const origin = window.location.origin;
  const token = settings?.enabled ? settings.token : null;
  const scale = Number(scaleInput);
  const scaleValid = scaleInput.trim() !== '' && Number.isFinite(scale) && scale >= OVERLAY_SCALE_MIN && scale <= OVERLAY_SCALE_MAX;

  let overlayUrl = '';
  if (token) {
    const query = new URLSearchParams({ layout });
    if (scaleValid && Math.abs(scale - 1) > 1e-9) query.set('scale', String(scale));
    if (theme !== 'dark') query.set('theme', theme);
    overlayUrl = `${origin}/overlay/${token}?${query.toString()}`;
  }

  return (
    <Modal title="Share live view" onClose={() => !confirming && onClose()}>
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

          {token && (
            <>
              <CopyField id="follow-url" label="Follow page" value={`${origin}/follow/${token}`} />

              <div className="flex flex-col gap-3">
                <CopyField id="overlay-url" label="OBS overlay" value={overlayUrl} />
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
                <p className="m-0 text-xs text-ds-muted">
                  In OBS: Sources → + → Browser, paste the overlay URL, width 1920 height 1080.
                </p>
              </div>

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

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-line pt-4">
                <p className="m-0 min-w-0 flex-1 basis-[220px] text-xs leading-relaxed text-ds-muted">
                  Anyone with the link can see who drives when. Fuel, tyres, lap times and settings are never shown.
                </p>
                <button type="button" onClick={() => void regenerate()} disabled={busy} className="btn-danger btn-sm">
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
        </div>
      )}
    </Modal>
  );
}
