import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

  useEffect(() => {
    if (!id) return;
    void tracksApi.getById(id).then((track) => {
      setForm({
        name: track.name,
        category: track.category,
        location: track.location ?? undefined,
        notes: track.notes ?? undefined,
        imageUrl: track.imageUrl ?? undefined,
      });
    });
  }, [id]);

  useEffect(() => {
    if (isEdit) return;
    void iracingTracksApi.list().then(setCatalog);
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
      name: track.configName ? `${track.trackName} - ${track.configName}` : track.trackName,
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

  return (
    <div className="max-w-3xl">
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-8">
        {isEdit ? 'Edit Track' : 'New Track'}
      </h1>

      {justSynced && (
        <p className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">
          Synced {justSynced} tracks from iRacing.
        </p>
      )}

      <div className="grid md:grid-cols-[1fr_320px] gap-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {form.imageUrl && (
            <img src={form.imageUrl} alt="" className="h-24 w-36 object-cover bg-black/30" />
          )}
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Category</span>
            <input
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Location</span>
            <input
              value={form.location ?? ''}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Notes</span>
            <textarea
              rows={4}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input resize-none"
            />
          </label>

          {error && <p role="alert" className="text-w2w-red text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-sm transition-colors clip-corner"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Track'}
          </button>
        </form>

        {!isEdit && (
          <div className="bg-w2w-charcoal border border-white/10 p-4 h-fit">
            <div className="flex items-center justify-between mb-3">
              <p className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">
                Pick from iRacing
              </p>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-[11px] text-white/65 hover:text-white disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>

            {catalog === null ? (
              <p className="text-white/65 text-xs">Loading...</p>
            ) : catalog.length === 0 ? (
              <p className="text-white/65 text-xs">
                No tracks synced yet. Click "Sync" to pull the track list from iRacing (requires
                signing in with an iRacing account).
              </p>
            ) : (
              <>
                <input
                  type="text"
                  aria-label="Search iRacing tracks"
                  placeholder="Search tracks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input mb-3"
                />
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {filteredCatalog.map((track) => (
                    <button
                      key={`${track.trackId}-${track.configName ?? ''}`}
                      type="button"
                      onClick={() => pickTrack(track)}
                      className="w-full flex items-center gap-3 text-left px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {track.logoUrl ? (
                        <img
                          src={track.logoUrl}
                          alt=""
                          className="h-8 w-12 object-contain shrink-0 bg-black/30"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="h-8 w-12 shrink-0 bg-black/30" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate">
                          {track.trackName}
                          {track.configName ? ` - ${track.configName}` : ''}
                        </p>
                        {track.location && <p className="text-[11px] text-white/65 truncate">{track.location}</p>}
                      </div>
                    </button>
                  ))}
                  {filteredCatalog.length === 0 && (
                    <p className="text-white/65 text-xs px-3 py-2">No matches.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
