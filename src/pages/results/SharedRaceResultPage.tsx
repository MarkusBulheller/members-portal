import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toPng } from 'html-to-image';
import RaceResultBody from '../../components/RaceResultBody';
import RaceResultShareCard from '../../components/RaceResultShareCard';
import ThemeToggle from '../../components/ThemeToggle';
import { ApiError } from '../../lib/api';
import { raceResultsApi } from '../../lib/api/raceResults';
import type { RaceResult } from '../../types/raceResult';

/** Public, unauthenticated view of a single race result — reached via a link an admin generated
 * from RaceResultDetailPage's "Share" button (e.g. to post in Discord). Not behind RequireAuth,
 * and deliberately doesn't reuse RaceResultDetailPage's chrome: no back-link to the (login-gated)
 * results list, no Remove/Share actions, and driver names render as plain text rather than links
 * to /drivers/:id, since that profile page isn't reachable without logging in. */
export default function SharedRaceResultPage() {
  const { token } = useParams<{ token: string }>();
  const [result, setResult] = useState<RaceResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    raceResultsApi
      .getShared(token)
      .then(setResult)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          throw err;
        }
      });
  }, [token]);

  async function handleExport() {
    if (!result || !shareCardRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `w2w-${result.trackName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${result.subsessionId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export result image', err);
      setExportError('Failed to export image — please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-w2w-black">
      <header className="border-b border-white/10 px-8 py-5 flex items-center justify-between">
        <span className="font-display font-black text-lg uppercase tracking-wide text-w2w-white">
          W<span className="text-w2w-red">2</span>W Racing
        </span>
        <ThemeToggle />
      </header>

      <main className="max-w-6xl mx-auto px-8 py-10">
        {notFound ? (
          <p role="alert" className="text-white/65 text-sm">This share link is invalid or has been revoked.</p>
        ) : !result ? (
          <p role="status" className="text-white/65 text-sm">Loading...</p>
        ) : (
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-display font-black text-2xl uppercase text-w2w-white">
                  {result.trackName}
                  {result.trackConfig ? ` — ${result.trackConfig}` : ''}
                </h1>
                <p className="text-white/65 text-sm mt-1">
                  {[
                    result.seriesName,
                    result.carName,
                    result.totalSplits && result.totalSplits > 1
                      ? `Split ${result.splitNumber}/${result.totalSplits}`
                      : null,
                    result.startTime ? new Date(result.startTime).toLocaleDateString() : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                onClick={() => void handleExport()}
                disabled={exporting}
                className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-heading text-xs uppercase tracking-wide transition-colors disabled:opacity-50 shrink-0"
              >
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>

            {exportError && (
              <p role="alert" className="mt-4 text-w2w-red text-sm">
                {exportError}
              </p>
            )}

            <div className="mt-6">
              <RaceResultBody result={result} linkDrivers={false} />
            </div>

            {/* Off-screen (not display:none — html-to-image needs it actually laid out) render
                target for the "Export" button. aria-hidden since a screen reader walking the DOM
                linearly would otherwise hit this duplicate copy of the page's content. */}
            <div style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }} aria-hidden="true">
              <div ref={shareCardRef}>
                <RaceResultShareCard result={result} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
