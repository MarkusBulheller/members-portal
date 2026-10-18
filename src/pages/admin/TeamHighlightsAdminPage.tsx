import { useEffect, useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { teamHighlightsApi } from '../../lib/api/teamHighlights';
import type { CreateTeamHighlightInput, TeamHighlight } from '../../types/teamHighlight';

const EMPTY_FORM: CreateTeamHighlightInput = { period: '', title: '', description: '', position: null };

const GHOST_BTN =
  'cut-xs min-h-9 cursor-pointer border-0 bg-transparent px-3 text-[13px] font-bold uppercase transition-colors hover:bg-ds-control-hover disabled:cursor-default disabled:opacity-50';

const MOVE_BTN =
  'cut-xs flex h-6 w-[30px] cursor-pointer items-center justify-center border-0 bg-ds-control text-ds-muted transition-colors hover:bg-ds-control-hover disabled:cursor-default disabled:opacity-30';

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
    setForm({
      period: highlight.period,
      title: highlight.title,
      description: highlight.description,
      position: highlight.position ?? null,
    });
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
    if (form.position != null && (!Number.isInteger(form.position) || form.position < 1 || form.position > 999)) {
      setError('Position must be a whole number from 1 to 999, or left empty.');
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="max-w-[560px] text-ds-muted">
          The timeline on the public website and the highlights card on the dashboard. Order here is the order there.
        </span>
        {editingId === null && (
          <button onClick={startCreate} className="btn-primary">
            + New highlight
          </button>
        )}
      </div>

      {editingId !== null && (
        <section
          aria-labelledby="highlight-form"
          className="cut flex flex-col gap-[18px] bg-ds-panel px-6 py-[22px] shadow-[inset_0_3px_0_var(--color-w2w-red)]"
        >
          <h2 id="highlight-form" className="h2">
            {editingId === 'new' ? 'New highlight' : 'Edit highlight'}
          </h2>

          <div className="flex flex-wrap gap-x-4 gap-y-3.5">
            <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
              <span className="lbl">
                Period <span className="ml-1 font-normal text-ds-dim">(e.g. "Season 3 · 2026")</span>
              </span>
              <input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="input" />
            </label>

            <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
              <span className="lbl">Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
            </label>

            <label className="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5">
              <span className="lbl">
                Finishing position <span className="ml-1 font-normal text-ds-dim">(optional)</span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                step={1}
                placeholder="e.g. 1"
                aria-describedby="highlight-position-hint"
                value={form.position ?? ''}
                onChange={(e) => setForm({ ...form, position: e.target.value === '' ? null : Number(e.target.value) })}
                className="input num"
              />
              <span id="highlight-position-hint" className="text-xs text-ds-dim">
                Shown as a P# badge on the dashboard (P1 to P3 get medal colours).
              </span>
            </label>

            <label className="flex min-w-0 flex-[1_1_100%] flex-col gap-1.5">
              <span className="lbl">Description</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input resize-none"
              />
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="cut-sm m-0 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2.5 border-t border-ds-line pt-4">
            <button onClick={cancelForm} className="btn-secondary">
              Cancel
            </button>
            <button onClick={() => void handleSubmit()} disabled={busy} className="btn-primary">
              {editingId === 'new' ? 'Create' : 'Save changes'}
            </button>
          </div>
        </section>
      )}

      {highlights === null ? (
        <p role="status" className="m-0 text-sm text-ds-muted">Loading...</p>
      ) : highlights.length === 0 ? (
        <section className="cut bg-ds-panel">
          <p className="m-0 px-4 py-9 text-center text-ds-muted">
            No highlights yet — the public site's timeline will be empty.
          </p>
        </section>
      ) : (
        <section aria-label="Highlights" className="cut bg-ds-panel py-1">
          {highlights.map((highlight, index) => (
            <div
              key={highlight.id}
              className={`row-hover flex flex-wrap items-center gap-3.5 px-5 py-3 ${
                index === 0 ? '' : 'border-t border-ds-line'
              }`}
            >
              <span className="flex flex-col gap-0.5">
                <button
                  onClick={() => void handleMove(highlight, 'up')}
                  disabled={busy || index === 0}
                  className={MOVE_BTN}
                  aria-label="Move up"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
                    <path d="M6 15l6-6 6 6" />
                  </svg>
                </button>
                <button
                  onClick={() => void handleMove(highlight, 'down')}
                  disabled={busy || index === highlights.length - 1}
                  className={MOVE_BTN}
                  aria-label="Move down"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </span>
              <span className="num w-[22px] flex-none text-center text-lg text-ds-dim">{index + 1}</span>
              {highlight.position != null && (
                <span className="slant num box-border min-w-10 flex-none bg-ds-control px-2 py-0.5 text-center text-sm text-ds-ink-soft">
                  P{highlight.position}
                </span>
              )}
              <span className="flex min-w-0 flex-[1_1_220px] flex-col">
                <span className="font-bold text-ds-ink">{highlight.title}</span>
                <span className="text-[13px] text-ds-muted">{highlight.description}</span>
              </span>
              <span className="flex-none text-xs text-ds-dim">{highlight.period}</span>
              <span className="flex gap-1">
                <button onClick={() => startEdit(highlight)} className={`${GHOST_BTN} text-ds-ink-soft`}>
                  Edit
                </button>
                <button
                  onClick={() => void handleDelete(highlight)}
                  disabled={busy}
                  className={`${GHOST_BTN} text-ds-danger`}
                >
                  Delete
                </button>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
