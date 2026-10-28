import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import { ApiError } from '../lib/api';
import { discordThreadApi } from '../lib/api/discordThread';

/** What the dialog needs of either a thread (crew) or a channel (event). */
interface LinkStatus {
  exists: boolean;
  url: string | null;
}

/** Without `teamId` this is the text channel for the whole event (created in the Discord event
 * category); with it, the thread for that crew (which can also receive the stint plan). */
function DiscordThreadDialog({ eventId, teamId, onClose }: { eventId: string; teamId?: string; onClose: () => void }) {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'summary' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const noun = teamId ? 'thread' : 'channel';

  useEffect(() => {
    let cancelled = false;
    (teamId ? discordThreadApi.get(eventId, teamId) : discordThreadApi.getEventChannel(eventId))
      .then((data) => {
        if (!cancelled) setStatus({ exists: data.exists, url: data.url });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : `Couldn't load the Discord ${noun}.`);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, teamId, noun]);

  const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong - please try again.');

  async function createThread() {
    setBusy('create');
    setMessage(null);
    try {
      const result = await (teamId ? discordThreadApi.create(eventId, teamId) : discordThreadApi.createEventChannel(eventId));
      setStatus({ exists: true, url: result.url });
      setMessage({ kind: 'ok', text: result.created ? `${noun === 'thread' ? 'Thread' : 'Channel'} created.` : `The ${noun} already exists.` });
    } catch (err) {
      setMessage({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function postSummary() {
    if (!teamId) return;
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
    <Modal title={teamId ? 'Discord thread' : 'Discord channel'} onClose={onClose}>
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
              {status.exists ? (teamId ? 'Thread created' : 'Channel created') : teamId ? 'No thread yet' : 'No channel yet'}
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
              {busy === 'create' ? 'Creating...' : teamId ? 'Create thread' : 'Create channel'}
            </button>
            {status.exists && teamId && (
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
            {teamId
              ? 'Posts into your events channel and creates a public thread. Members with a linked Discord account are added automatically.'
              : "Creates a new text channel for this event in your event category (Admin → Discord Bot) and posts the event details in it. It inherits the category's permissions."}
          </p>
        </div>
      )}
    </Modal>
  );
}

/** "Discord thread" button with its dialog in the team plan header (next to "Share live view",
 * with `teamId`), and "Discord channel" on the event page (without it: a new channel for the
 * whole event). */
export default function DiscordThreadButton({
  eventId,
  teamId,
  className = 'btn-secondary btn-sm self-center',
}: {
  eventId: string;
  teamId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-haspopup="dialog">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        {teamId ? 'Discord thread' : 'Discord channel'}
      </button>
      {/* Portalled to <body>: on the event page the button sits in a header with clipped corners
          (clip-path), which would clip a dialog drawn inside it down to the header's shape. */}
      {open &&
        createPortal(<DiscordThreadDialog eventId={eventId} teamId={teamId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
