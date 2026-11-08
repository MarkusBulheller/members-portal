import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useConfirm } from '../context/ConfirmContext';
import { ApiError } from '../lib/api';
import { raceResultsApi } from '../lib/api/raceResults';

type Tab = 'discord' | 'short';

const LIMITS: Record<Tab, number> = { discord: 2000, short: 280 };
const TAB_LABELS: Record<Tab, string> = { discord: 'Discord', short: 'Short post' };

/** A ready-to-edit race report for a result: a Discord version and a short one for social posts.
 * The text is built on the server from the result; it can be edited here, copied, and (admins) posted
 * to the Discord results channel. Nothing is posted without pressing "Post to Discord". */
export default function RaceReportModal({ resultId, isAdmin, onClose }: { resultId: string; isAdmin: boolean; onClose: () => void }) {
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState<Record<Tab, string> | null>(null);
  const [texts, setTexts] = useState<Record<Tab, string>>({ discord: '', short: '' });
  const [tab, setTab] = useState<Tab>('discord');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // The confirm dialog stacks on top of this one; Escape in it must not also close this dialog.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    raceResultsApi
      .report(resultId)
      .then((report) => {
        if (cancelled) return;
        setDrafts(report);
        setTexts(report);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Couldn't write the report.");
      });
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const text = texts[tab];
  const limit = LIMITS[tab];
  const over = text.length > limit;
  const edited = drafts !== null && text !== drafts[tab];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setMessage({ kind: 'error', text: "Couldn't copy automatically: select the text and press Ctrl+C." });
    }
  }

  async function post() {
    setConfirming(true);
    const ok = await confirm('Post this text to the Discord results channel?', { title: 'Post race report', confirmLabel: 'Post to Discord' });
    setTimeout(() => setConfirming(false), 0);
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await raceResultsApi.postReport(resultId, texts.discord);
      setMessage({ kind: 'ok', text: 'Posted to the results channel.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong - please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Race report" wide onClose={() => !confirming && onClose()}>
      {loadError ? (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {loadError}
        </p>
      ) : !drafts ? (
        <p role="status" className="m-0 text-sm text-ds-muted">
          Writing the report...
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[13px] text-ds-muted">
            A draft built from this result: edit it as you like, then copy it
            {isAdmin ? ' or post it to Discord' : ''}.
          </p>

          <div role="group" aria-label="Version" className="seg seg-field self-start">
            {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
              <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="sr-only">{TAB_LABELS[tab]} text</span>
            <textarea
              value={text}
              onChange={(e) => setTexts((current) => ({ ...current, [tab]: e.target.value }))}
              rows={tab === 'discord' ? 10 : 5}
              spellCheck
              className="input min-h-[140px] w-full resize-y py-3 text-[14px] leading-relaxed"
            />
            <span className={`text-xs ${over ? 'text-ds-danger' : 'text-ds-dim'}`} aria-live="polite">
              {text.length} / {limit} characters{over ? ' - too long' : ''}
            </span>
          </label>

          {tab === 'discord' && !/https?:\/\//.test(texts.discord) && (
            <p className="m-0 text-xs text-ds-muted">
              No link in the text: the result has no public share link yet (create one with Share on the result page).
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void copy()} className="btn-primary btn-sm">
              {copied ? 'Copied' : 'Copy text'}
            </button>
            {isAdmin && tab === 'discord' && (
              <button type="button" onClick={() => void post()} disabled={busy || over || text.trim() === ''} className="btn-secondary btn-sm">
                {busy ? 'Posting...' : 'Post to Discord'}
              </button>
            )}
            {edited && (
              <button
                type="button"
                onClick={() => setTexts((current) => ({ ...current, [tab]: drafts[tab] }))}
                className="btn-secondary btn-sm"
              >
                Reset to draft
              </button>
            )}
          </div>

          <div aria-live="polite" className="min-h-0">
            {message && (
              <p role={message.kind === 'error' ? 'alert' : 'status'} className={`m-0 text-[13px] ${message.kind === 'error' ? 'text-ds-danger' : 'text-ds-muted'}`}>
                {message.text}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
