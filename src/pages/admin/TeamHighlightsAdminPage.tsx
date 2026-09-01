import { useEffect, useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { teamHighlightsApi } from '../../lib/api/teamHighlights';
import type { CreateTeamHighlightInput, TeamHighlight } from '../../types/teamHighlight';

const EMPTY_FORM: CreateTeamHighlightInput = { period: '', title: '', description: '' };

export default function TeamHighlightsAdminPage() {
  const confirm = useConfirm();
  const [highlights, setHighlights] = useState<TeamHighlight[] | null>(null);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<CreateTeamHighlightInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => void teamHighlightsApi.list().then(setHighlights);
  useEffect(load, []);

  function startCreate() {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startEdit(highlight: TeamHighlight) {
    setEditingId(highlight.id);
    setForm({ period: highlight.period, title: highlight.title, description: highlight.description });
    setError(null);
  }

  function cancelForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!form.period.trim() || !form.title.trim() || !form.description.trim()) {
      setError('Period, title, and description are all required.');
      return;
    }
    setBusy(true);
    try {
      if (editingId === 'new') {
        await teamHighlightsApi.create(form);
      } else if (editingId) {
        await teamHighlightsApi.update(editingId, form);
      }
      cancelForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save highlight');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(highlight: TeamHighlight) {
    if (!(await confirm(`Delete "${highlight.title}"? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    setBusy(true);
    try {
      await teamHighlightsApi.remove(highlight.id);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(highlight: TeamHighlight, direction: 'up' | 'down') {
    setBusy(true);
    try {
      const updated = await teamHighlightsApi.move(highlight.id, direction);
      setHighlights(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Admin</p>
          <h1 className="font-display font-black text-3xl uppercase text-w2w-white">Team Highlights</h1>
          <p className="text-white/65 text-sm mt-2 max-w-lg">
            Powers the "Team Highlights" timeline on the public marketing site — real team history, in the order
            shown below.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={startCreate}
            className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner shrink-0"
          >
            New Highlight
          </button>
        )}
      </div>

      {editingId !== null && (
        <div className="mb-8 bg-w2w-charcoal border border-white/10 p-6 space-y-4 max-w-xl">
          <h2 className="font-heading text-xs tracking-[0.25em] text-white/65 uppercase">
            {editingId === 'new' ? 'New Highlight' : 'Edit Highlight'}
          </h2>

          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">
              Period <span className="text-white/70 normal-case tracking-normal">(e.g. "Season 3 · 2026")</span>
            </span>
            <input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="input" />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Title</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input resize-none"
            />
          </label>

          {error && <p className="text-w2w-red text-sm">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => void handleSubmit()}
              disabled={busy}
              className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
            >
              {editingId === 'new' ? 'Create' : 'Save Changes'}
            </button>
            <button
              onClick={cancelForm}
              className="px-5 py-2.5 border border-white/20 text-white/60 hover:text-white font-heading text-xs uppercase tracking-wide transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {highlights === null ? (
        <p className="text-white/65 text-sm">Loading...</p>
      ) : highlights.length === 0 ? (
        <p className="text-white/65 text-sm">No highlights yet — the public site's timeline will be empty.</p>
      ) : (
        <div className="space-y-2">
          {highlights.map((highlight, index) => (
            <div key={highlight.id} className="flex items-start justify-between gap-4 bg-w2w-charcoal border border-white/10 p-5">
              <div className="min-w-0">
                <span className="font-heading text-xs tracking-[0.2em] text-w2w-red uppercase">{highlight.period}</span>
                <p className="font-heading font-semibold text-white text-sm mt-1">{highlight.title}</p>
                <p className="text-white/65 text-xs mt-1 max-w-xl">{highlight.description}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => void handleMove(highlight, 'up')}
                  disabled={busy || index === 0}
                  className="text-white/65 hover:text-white text-sm disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => void handleMove(highlight, 'down')}
                  disabled={busy || index === highlights.length - 1}
                  className="text-white/65 hover:text-white text-sm disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => startEdit(highlight)}
                  className="ml-2 px-3 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleDelete(highlight)}
                  disabled={busy}
                  className="px-3 py-1.5 border border-w2w-red/40 text-w2w-red hover:bg-w2w-red/10 disabled:opacity-50 font-heading text-xs uppercase tracking-wide transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
