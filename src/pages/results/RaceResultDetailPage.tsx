import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import RaceResultBody, { RaceResultHero } from '../../components/RaceResultBody';
import { formatRaceDate } from '../../components/RaceResultRow';
import PersonalRaceSummary from '../../components/PersonalRaceSummary';
import RaceResultShareCard from '../../components/RaceResultShareCard';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ApiError } from '../../lib/api';
import { raceResultsApi } from '../../lib/api/raceResults';
import type { RaceResult } from '../../types/raceResult';

function shareUrl(token: string): string {
  return `${window.location.origin}/share/results/${token}`;
}

export default function RaceResultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  // The fetched result (or error), tagged with the id it belongs to, so navigating to another id
  // never shows the previous record and a stale response is ignored.
  const [loaded, setLoaded] = useState<{ id: string; result: RaceResult | null; error: string | null } | null>(null);
  const current = loaded && loaded.id === id ? loaded : null;
  const result = current?.result ?? null;
  const loadError = current?.error ?? null;
  const [exporting, setExporting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Drop responses that arrive after the id changed or the page unmounted.
    let cancelled = false;
    if (!id) return;
    raceResultsApi
      .getById(id)
      .then((data) => {
        if (!cancelled) setLoaded({ id, result: data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('Failed to load race result', err);
        setLoaded({
          id,
          result: null,
          error:
            err instanceof ApiError && err.status === 404
              ? 'This result could not be found.'
              : "Couldn't load this result. Please try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Don't leave the "Copied" reset timer running after the page unmounts.
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  function setResult(next: RaceResult) {
    if (id) setLoaded({ id, result: next, error: null });
  }

  async function handleRemove() {
    if (!result) return;
    if (!(await confirm('Remove this result?', { confirmLabel: 'Remove' }))) return;
    await raceResultsApi.remove(result.id);
    navigate('/results');
  }

  async function handleShare() {
    if (!result) return;
    setActionError(null);
    const { shareToken } = result.shareToken ? { shareToken: result.shareToken } : await raceResultsApi.share(result.id);
    setResult({ ...result, shareToken });
    try {
      await navigator.clipboard.writeText(shareUrl(shareToken));
      setLinkCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setActionError(`Link generated, but couldn't copy it automatically: ${shareUrl(shareToken)}`);
    }
  }

  async function handleUnshare() {
    if (!result) return;
    if (!(await confirm('Revoke this share link? It will stop working immediately.', { confirmLabel: 'Revoke' }))) return;
    await raceResultsApi.unshare(result.id);
    setResult({ ...result, shareToken: null });
  }

  async function handleExport() {
    if (!result || !shareCardRef.current) return;
    setExporting(true);
    setActionError(null);
    try {
      // Loaded on demand so the export library stays out of the main bundle.
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `w2w-${result.trackName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${result.subsessionId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export result image', err);
      setActionError('Failed to export image — please try again.');
    } finally {
      setExporting(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm text-ds-danger">
        {loadError}
      </p>
    );
  }
  if (!result) {
    return <p className="text-sm text-ds-muted">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[13px] text-ds-muted">
        <Link to="/results" className="font-semibold text-ds-muted hover:text-ds-ink">
          Results
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="text-ds-ink">
          {result.trackName}
          {result.startTime ? ` · ${formatRaceDate(result.startTime)}` : ''}
        </span>
      </nav>

      <RaceResultHero
        result={result}
        variant="detail"
        actions={
          <div className="relative flex flex-wrap items-start gap-2">
            {user?.role === 'ADMIN' && (
              <button onClick={() => void handleShare()} className="btn-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
                  <path d="M18 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM18 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                </svg>
                {linkCopied ? 'Link Copied!' : result.shareToken ? 'Copy Link' : 'Share'}
              </button>
            )}
            <button onClick={() => void handleExport()} disabled={exporting} className="btn-secondary">
              {exporting ? 'Exporting...' : 'Export PNG'}
            </button>
            {user?.role === 'ADMIN' && (
              <button onClick={() => void handleRemove()} className="btn-danger">
                Remove
              </button>
            )}
          </div>
        }
      />

      {result.importedAt && (
        <p className="m-0 -mt-2 text-[13px] text-ds-muted">
          {result.importSource === 'AUTO'
            ? 'Imported automatically'
            : result.importSource === 'MANUAL'
              ? 'Imported manually'
              : 'Imported'}{' '}
          · {formatRaceDate(result.importedAt)}
        </p>
      )}

      <PersonalRaceSummary result={result} />

      {user?.role === 'ADMIN' && result.shareToken && (
        <section
          aria-label="Share link"
          className="cut flex flex-wrap items-center gap-3 bg-ds-panel px-5 py-3.5 shadow-[inset_0_-3px_0_var(--color-w2w-red)]"
        >
          <span className="chip chip-accent">Public link is live</span>
          <span className="cut-sm flex h-[42px] min-w-0 flex-[1_1_280px] items-center overflow-hidden text-ellipsis whitespace-nowrap bg-ds-field px-3 text-[13px] text-ds-ink-soft">
            {shareUrl(result.shareToken)}
          </span>
          <button onClick={() => void handleShare()} className="btn-secondary btn-sm !min-h-[42px] !px-[18px] !text-[13px]">
            {linkCopied ? 'Copied!' : 'Copy'}
          </button>
          <Link to={`/share/results/${result.shareToken}`} className="text-[13px] font-semibold text-w2w-red-ink hover:underline">
            Preview
          </Link>
          <button onClick={() => void handleUnshare()} className="btn-danger btn-sm !min-h-[42px] !bg-transparent !px-4 !text-[13px] hover:!bg-ds-control-hover">
            Unshare
          </button>
        </section>
      )}

      {actionError && (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {actionError}
        </p>
      )}

      <RaceResultBody result={result} linkDrivers />

      {/* Off-screen (not display:none — html-to-image needs it actually laid out) render target
          for the "Export" button. aria-hidden since a screen reader walking the DOM linearly
          would otherwise hit this duplicate copy of the page's content. */}
      <div style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={shareCardRef}>
          <RaceResultShareCard result={result} />
        </div>
      </div>
    </div>
  );
}
