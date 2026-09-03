import { useRef, useState } from 'react';
import { ApiError, resolveAssetUrl } from '../lib/api';

/** Self-contained avatar picker: shows the current image (or initials, matching NavSidebar's
 * fallback style) and a hidden file input triggered by a "Change"/"Add Photo" button, plus a
 * "Remove" button once one's set. Upload/remove are handed off to the caller (self vs admin route
 * differ) — this component only owns the file-picker UI and its own busy/error state. */
export default function AvatarUpload({
  avatarUrl,
  displayName,
  onUpload,
  onRemove,
}: {
  avatarUrl: string | null;
  displayName: string;
  onUpload: (file: File) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
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
    <div className="flex items-center gap-4">
      {avatarUrl ? (
        <img
          src={resolveAssetUrl(avatarUrl)}
          alt=""
          className="h-20 w-20 rounded-full object-cover bg-black/30 shrink-0"
        />
      ) : (
        <div className="h-20 w-20 rounded-full bg-w2w-charcoal-light flex items-center justify-center font-heading text-xl text-white/60 shrink-0">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
          >
            {busy ? 'Uploading...' : avatarUrl ? 'Change Photo' : 'Add Photo'}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              className="px-4 py-2 text-white/65 hover:text-w2w-red disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-white/40 text-[11px] mt-1.5">PNG, JPEG, or WEBP — up to 3MB.</p>
        {error && (
          <p role="alert" className="text-w2w-red text-xs mt-1">
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
