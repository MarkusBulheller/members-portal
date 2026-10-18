import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ImageDropZone from '../../components/ImageDropZone';
import { TRACK_CATEGORIES, trackCategoryLabel } from '../../lib/trackCategory';
import { tracksApi } from '../../lib/api/tracks';
import { iracingTracksApi } from '../../lib/api/iracingTracks';
import { beginIracingTrackSync } from '../../lib/iracing';
import type { CreateTrackInput } from '../../types/track';
import type { IracingTrack } from '../../types/iracingTrack';

const EMPTY: CreateTrackInput = {
  name: '',
  category: '',
  imageUrl: undefined,
};

function catalogName(track: IracingTrack): string {
  return track.configName ? `${track.trackName} - ${track.configName}` : track.trackName;
}

export default function TrackFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justSynced = searchParams.get('synced');
  const [form, setForm] = useState<CreateTrackInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<IracingTrack[] | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  // Lower-cased names of tracks already in the library (retired ones included), so the picker can
  // tag and lock catalog entries that were added before.
  const [libraryNames, setLibraryNames] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    tracksApi
      .getById(id)
      .then((track) => {
        if (cancelled) return;
        setForm({
          name: track.name,
          category: track.category,
          location: track.location ?? undefined,
          notes: track.notes ?? undefined,
          imageUrl: track.imageUrl ?? undefined,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the track.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    iracingTracksApi
      .list()
      .then((loaded) => {
        if (!cancelled) setCatalog(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCatalog([]);
          setError(err instanceof Error ? err.message : 'Failed to load the iRacing track catalog.');
        }
      });
    tracksApi
      .list(true)
      .then((tracks) => {
        if (!cancelled) setLibraryNames(new Set(tracks.map((t) => t.name.toLowerCase())));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  function handleSync() {
    setSyncing(true);
    beginIracingTrackSync().catch((err: unknown) => {
      setSyncing(false);
      setError(err instanceof Error ? `Could not start iRacing sync: ${err.message}` : 'Could not start iRacing sync.');
    });
  }

  function pickTrack(track: IracingTrack) {
    setForm({
      ...form,
      name: catalogName(track),
      category: track.category ?? form.category,
      location: track.location ?? form.location,
      imageUrl: track.logoUrl ?? undefined,
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit && id ? await tracksApi.update(id, form) : await tracksApi.create(form);
      navigate(`/tracks/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save track');
    } finally {
      setSaving(false);
    }
  }

  const filteredCatalog =
    catalog?.filter((track) => track.trackName.toLowerCase().includes(search.toLowerCase())) ?? [];

  const title = isEdit ? 'Edit track' : 'New track';
  const backHref = isEdit && id ? `/tracks/${id}` : '/tracks';

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ds-muted">
          <Link to="/tracks" className="font-semibold text-ds-muted hover:text-ds-ink">
            Tracks
          </Link>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="text-ds-ink">{title}</span>
        </nav>
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">{title}</h1>
        {!isEdit && (
          <span className="text-sm text-ds-muted">
            Start from iRacing’s list so names match results imports, then add the team’s own details.
          </span>
        )}
      </header>

      {justSynced && (
        <p className="cut-sm m-0 bg-ds-panel px-4 py-3 text-sm text-w2w-red-ink shadow-[inset_3px_0_0_var(--color-w2w-red)]">
          Synced {justSynced} tracks from iRacing.
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        {!isEdit && (
          <section
            aria-labelledby="cat-title"
            className="cut flex min-w-0 flex-[2_1_320px] flex-col gap-3.5 bg-ds-panel pb-2.5 pt-[22px]"
          >
            <div className="flex flex-col gap-3.5 px-5">
              <div className="flex items-center justify-between gap-3">
                <h2 id="cat-title" className="h2">
                  <span className="num text-ds-dim">1</span> Pick from iRacing
                </h2>
                <button type="button" onClick={handleSync} disabled={syncing} className="btn-secondary btn-sm">
                  {syncing ? 'Syncing...' : 'Sync'}
                </button>
              </div>
              {catalog !== null && catalog.length > 0 && (
                <div className="cut-sm flex h-[42px] items-center gap-2 bg-ds-field px-3 text-ds-dim">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">
                    <path d="M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM16 16l4.5 4.5" />
                  </svg>
                  <input
                    type="text"
                    aria-label="Search iRacing tracks"
                    placeholder="Search iRacing tracks"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="min-w-0 flex-1 border-0 bg-transparent text-ds-ink outline-none placeholder:text-ds-dim"
                  />
                </div>
              )}
            </div>

            {catalog === null ? (
              <p className="m-0 px-5 pb-3 text-sm text-ds-muted">Loading...</p>
            ) : catalog.length === 0 ? (
              <p className="m-0 px-5 pb-3 text-sm text-ds-muted">
                No tracks synced yet. Click "Sync" to pull the track list from iRacing (requires signing in with an
                iRacing account).
              </p>
            ) : (
              <div className="flex max-h-[520px] flex-col overflow-y-auto">
                {filteredCatalog.map((track) => {
                  const inLibrary = libraryNames.has(catalogName(track).toLowerCase());
                  const selected = !inLibrary && form.name === catalogName(track);
                  return (
                    <button
                      key={`${track.trackId}-${track.configName ?? ''}`}
                      type="button"
                      onClick={() => pickTrack(track)}
                      aria-pressed={selected}
                      disabled={inLibrary}
                      className={`row-hover flex w-full items-center gap-3 border-0 border-t border-solid border-ds-line px-5 py-3 text-left text-ds-ink ${
                        inLibrary ? 'cursor-default opacity-55' : 'cursor-pointer'
                      } ${selected ? 'bg-ds-raised shadow-[inset_3px_0_0_var(--color-w2w-red)]' : 'bg-transparent'}`}
                    >
                      {track.logoUrl ? (
                        <img
                          key={track.logoUrl}
                          src={track.logoUrl}
                          alt=""
                          width={48}
                          height={32}
                          loading="lazy"
                          decoding="async"
                          className="h-8 w-12 flex-none bg-ds-field object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="h-8 w-12 flex-none bg-ds-field" />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{catalogName(track)}</span>
                        {track.location && <span className="truncate text-xs text-ds-muted">{track.location}</span>}
                      </span>
                      {selected && <span className="chip chip-solid chip-sm">Selected</span>}
                      {inLibrary && <span className="chip chip-sm">In library</span>}
                    </button>
                  );
                })}
                {filteredCatalog.length === 0 && <p className="m-0 px-5 py-4 text-ds-muted">No matches.</p>}
              </div>
            )}
          </section>
        )}

        <section
          aria-labelledby="det-title"
          className="cut min-w-0 flex-[3_1_420px] bg-ds-panel px-6 pb-6 pt-[22px]"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
            <h2 id="det-title" className="h2">
              {!isEdit && <span className="num text-ds-dim">2</span>} Team details
            </h2>

            <ImageDropZone
              imageUrl={form.imageUrl || undefined}
              hint="Track map or aerial shot · JPG or PNG"
              upload={tracksApi.uploadImage}
              // On edit an empty string tells the backend to clear the image (undefined would leave it).
              onChange={(url) => setForm({ ...form, imageUrl: url ?? (isEdit ? '' : undefined) })}
            />

            <label className="flex flex-col gap-1.5">
              <span className="lbl">Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
              />
            </label>

            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Category</span>
                <select
                  required
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="input"
                >
                  <option value="" disabled>
                    Select a category...
                  </option>
                  {TRACK_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                  {/* Free-text fallback: keep a category the select doesn't know (hand-typed or imported) selectable. */}
                  {form.category && !TRACK_CATEGORIES.some((c) => c.value === form.category) && (
                    <option value={form.category}>{trackCategoryLabel(form.category)}</option>
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Location</span>
                <input
                  value={form.location ?? ''}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="input"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="lbl">
                Team notes <span className="font-normal text-ds-dim">optional</span>
              </span>
              <textarea
                rows={3}
                placeholder="Track tips, pit entry, traffic hot spots"
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input resize-y"
              />
            </label>

            {error && (
              <p role="alert" className="m-0 text-sm text-ds-danger">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-ds-line pt-4">
              <Link to={backHref} className="btn-secondary">
                Cancel
              </Link>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add track'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
