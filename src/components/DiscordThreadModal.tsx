import { useEffect, useState } from 'react';
import Modal from './Modal';
import { ApiError } from '../lib/api';
import { discordThreadApi } from '../lib/api/discordThread';
import type { DiscordThreadStatus } from '../types/discordThread';

function DiscordThreadDialog({ eventId, teamId, onClose }: { eventId: string; teamId: string; onClose: () => void }) {
  const [status, setStatus] = useState<DiscordThreadStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'summary' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    discordThreadApi
      .get(eventId, teamId)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Couldn't load the Discord thread.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, teamId]);

  const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong - please try again.');

  async function createThread() {
    setBusy('create');
    setMessage(null);
    try {
      const result = await discordThreadApi.create(eventId, teamId);
      setStatus({ exists: true, threadId: result.threadId, url: result.url });
      setMessage({ kind: 'ok', text: result.created ? 'Thread created.' : 'The thread already exists.' });
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function postSummary() {
    setBusy('summary');
    setMessage(null);
    try {
      const { posted } = await discordThreadApi.postPlanSummary(eventId, teamId);
      setMessage({ kind: 'ok', text: `Posted ${posted} ${posted === 1 ? 'message' : 'messages'} to the thread.` });
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title="Discord thread" onClose={onClose}>
      {loadError ? (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {loadError}
        </p>
      ) : !status ? (
        <p role="status" className="m-0 text-sm text-ds-muted">
          Loading...
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={`chip ${status.exists ? 'chip-accent' : 'chip-muted'}`}>
              {status.exists ? 'Thread created' : 'No thread yet'}
            </span>
            {status.exists && status.url && (
              <a href={status.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-w2w-red-ink hover:underline">
                Open in Discord
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void createThread()}
              disabled={status.exists || busy !== null}
              className="btn-primary btn-sm"
            >
              {busy === 'create' ? 'Creating...' : 'Create thread'}
            </button>
            {status.exists && (
              <button
                type="button"
                onClick={() => void postSummary()}
                disabled={busy !== null}
                className="btn-secondary btn-sm"
              >
                {busy === 'summary' ? 'Posting...' : 'Post plan summary'}
              </button>
            )}
          </div>

          <div aria-live="polite" className="min-h-0">
            {message && (
              <p
                role={message.kind === 'error' ? 'alert' : 'status'}
                className={`m-0 text-[13px] ${message.kind === 'error' ? 'text-ds-danger' : 'text-ds-muted'}`}
              >
                {message.text}
              </p>
            )}
          </div>

          <p className="m-0 border-t border-ds-line pt-4 text-xs leading-relaxed text-ds-muted">
            Posts into your events channel and creates a public thread. Members with a linked Discord account are added
            automatically.
          </p>
        </div>
      )}
    </Modal>
  );
}

/** "Discord thread" button for the team plan header, with its dialog. Rendered where the
 * "Share live view" button is, so it shows to the same people. */
export default function DiscordThreadButton({ eventId, teamId }: { eventId: string; teamId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm self-center" aria-haspopup="dialog">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        Discord thread
      </button>
      {open && <DiscordThreadDialog eventId={eventId} teamId={teamId} onClose={() => setOpen(false)} />}
    </>
  );
}
