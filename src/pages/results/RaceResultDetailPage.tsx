import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toPng } from 'html-to-image';
import RaceResultBody from '../../components/RaceResultBody';
import RaceResultShareCard from '../../components/RaceResultShareCard';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
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
  const [result, setResult] = useState<RaceResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) void raceResultsApi.getById(id).then(setResult);
  }, [id]);

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
      setTimeout(() => setLinkCopied(false), 2000);
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

  if (!result) {
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  return (
    <div>
      <Link to="/results" className="text-xs text-white/65 hover:text-white">
        ← Back to results
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-black text-2xl uppercase text-w2w-white">
            {result.trackName}
            {result.trackConfig ? ` — ${result.trackConfig}` : ''}
          </h1>
          <p className="text-white/65 text-sm mt-1">
            {[
              result.seriesName,
              result.carName,
              result.totalSplits && result.totalSplits > 1 ? `Split ${result.splitNumber}/${result.totalSplits}` : null,
              result.startTime ? new Date(result.startTime).toLocaleDateString() : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          {user?.role === 'ADMIN' && (
            <>
              <button
                onClick={() => void handleShare()}
                className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors"
              >
                {linkCopied ? 'Link Copied!' : result.shareToken ? 'Copy Link' : 'Share'}
              </button>
              {result.shareToken && (
                <button
                  onClick={() => void handleUnshare()}
                  className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors"
                >
                  Unshare
                </button>
              )}
              <button
                onClick={() => void handleRemove()}
                className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="mt-4 text-w2w-red text-sm">
          {actionError}
        </p>
      )}

      <div className="mt-6">
        <RaceResultBody result={result} linkDrivers />
      </div>

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
