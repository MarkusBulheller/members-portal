import { useRef, useState, type DragEvent } from 'react';
import { ApiError, resolveAssetUrl } from '../lib/api';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** "Drop an image or browse" zone from the catalog-form design. Uploads immediately through the
 * caller's `upload` (admin car/track image endpoints) and hands the stored path back through
 * `onChange`; the parent keeps it in its form state and saves it as `imageUrl` with the rest.
 * The zone is one real button, so Enter/Space open the file picker and it is focusable. */
export default function ImageDropZone({
  imageUrl,
  hint,
  upload,
  onChange,
}: {
  imageUrl: string | undefined;
  hint: string;
  upload: (file: File) => Promise<{ imageUrl: string }>;
  onChange: (imageUrl: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError('Only PNG, JPEG, or WEBP images are allowed.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That image is over 5MB.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { imageUrl: stored } = await upload(file);
      onChange(stored);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload image');
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        disabled={busy}
        aria-label={imageUrl ? 'Replace image: drop an image or browse' : 'Drop an image or browse'}
        className={`cut-sm relative flex h-[150px] w-full cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden border-0 bg-ds-field p-0 text-ds-muted disabled:cursor-default ${
          dragging
            ? 'shadow-[inset_0_-3px_0_var(--color-w2w-red)]'
            : 'shadow-[inset_0_-3px_0_var(--color-ds-control)] hover:shadow-[inset_0_-3px_0_var(--color-ds-control-hover)]'
        }`}
      >
        {imageUrl && (
          <img
            key={imageUrl}
            src={resolveAssetUrl(imageUrl)}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain p-2"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <span
          className={`relative flex flex-col items-center gap-1.5 ${imageUrl ? 'bg-ds-field/85 px-4 py-2' : ''}`}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
          <span className="font-semibold text-[#e4e4e7] [:root[data-theme=light]_&]:text-ds-ink-soft">{busy ? 'Uploading...' : 'Drop an image or browse'}</span>
          <span className="text-xs">{hint}</span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow picking the same file again
          void handleFile(file);
        }}
      />
      {imageUrl && !busy && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="cursor-pointer self-start border-0 bg-transparent p-1 text-xs font-semibold text-ds-muted hover:text-ds-ink"
        >
          Remove image
        </button>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-ds-danger">
          {error}
        </p>
      )}
    </div>
  );
}
