import { useRef, useState } from 'react';
import { ApiError, resolveAssetUrl } from '../lib/api';
import { initials } from '../lib/initials';

/** Self-contained avatar picker: shows the current image (or initials, matching NavSidebar's
 * fallback style) and a hidden file input triggered by a "Change"/"Add Photo" button, plus a
 * "Remove" button once one's set, and (when `onUseDiscord` is given) a "Use Discord avatar" button. Upload/remove are handed off to the caller (self vs admin route
 * differ) — this component only owns the file-picker UI and its own busy/error state. */
export default function AvatarUpload({
  avatarUrl,
  displayName,
  onUpload,
  onRemove,
  onUseDiscord,
}: {
  avatarUrl: string | null;
  displayName: string;
  onUpload: (file: File) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  /** Own-profile only: copy the member's Discord avatar into the profile photo. */
  onUseDiscord?: () => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload avatar');
    } finally {
      setBusy(false);
    }
  }

  async function handleUseDiscord() {
    if (!onUseDiscord) return;
    setBusy(true);
    setError(null);
    try {
      await onUseDiscord();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to use your Discord avatar');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await onRemove();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove avatar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-[18px]">
      {avatarUrl ? (
        <img
          src={resolveAssetUrl(avatarUrl)}
          alt=""
          width={80}
          height={80}
          decoding="async"
          className="cut-xs h-20 w-20 shrink-0 bg-ds-field object-cover"
        />
      ) : (
        <div className="cut-xs flex h-20 w-20 shrink-0 items-center justify-center bg-w2w-red text-[30px] font-black italic text-on-accent">
          {initials(displayName)}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn-secondary min-h-10 px-[18px] text-[13px]"
          >
            {busy ? 'Uploading...' : avatarUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {onUseDiscord && (
            <button
              type="button"
              onClick={() => void handleUseDiscord()}
              disabled={busy}
              className="cut-sm min-h-10 cursor-pointer border-0 bg-transparent px-3 text-[13px] font-bold uppercase text-ds-muted hover:text-ds-ink disabled:opacity-50"
            >
              Use Discord avatar
            </button>
          )}
          {avatarUrl && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              className="cut-sm min-h-10 cursor-pointer border-0 bg-transparent px-3 text-[13px] font-bold uppercase text-ds-muted hover:text-ds-ink disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <span className="text-xs text-ds-dim">PNG, JPEG, or WEBP — up to 3MB.</span>
        {error && (
          <p role="alert" className="m-0 text-xs text-ds-danger">
            {error}
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
      />
    </div>
  );
}
