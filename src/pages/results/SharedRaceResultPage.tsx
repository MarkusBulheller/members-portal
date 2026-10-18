import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import RaceResultBody, {
  RaceResultCrewTable,
  RaceResultDriverLegend,
  RaceResultHero,
  RaceResultStatTiles,
} from '../../components/RaceResultBody';
import RaceResultShareCard from '../../components/RaceResultShareCard';
import ThemeToggle from '../../components/ThemeToggle';
import { ApiError } from '../../lib/api';
import { raceResultsApi } from '../../lib/api/raceResults';
import { publicSiteContactUrl, publicSiteHost, publicSiteUrl } from '../../lib/publicSite';
import type { RaceResult } from '../../types/raceResult';

/** Public, unauthenticated view of a single race result — reached via a link an admin generated
 * from RaceResultDetailPage's "Share" button (e.g. to post in Discord). Not behind RequireAuth,
 * and deliberately doesn't reuse RaceResultDetailPage's chrome: no back-link to the (login-gated)
 * results list, no Remove/Share actions, and driver names render as plain text rather than links
 * to /drivers/:id, since that profile page isn't reachable without logging in. */
export default function SharedRaceResultPage() {
  const siteUrl = publicSiteUrl();
  const siteHost = publicSiteHost();
  const contactUrl = publicSiteContactUrl();
  const { token } = useParams<{ token: string }>();
  // Outcome of the fetch, tagged with the token it was for, so a token change (or a stale
  // response) never shows another link's result — without resetting state inside the effect.
  const [loaded, setLoaded] = useState<
    { token: string; outcome: { result: RaceResult } | { error: 'notFound' | 'failed' } } | null
  >(null);
  const current = loaded && loaded.token === token ? loaded.outcome : null;
  const result = current && 'result' in current ? current.result : null;
  const notFound = !token || (current !== null && 'error' in current && current.error === 'notFound');
  const loadError =
    current !== null && 'error' in current && current.error === 'failed'
      ? "Couldn't load this result. Please check your connection and try again."
      : null;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Ignore a slow response for a token we've since navigated away from (or an unmounted page).
    let cancelled = false;
    if (!token) return;
    raceResultsApi
      .getShared(token)
      .then((data) => {
        if (!cancelled) setLoaded({ token, outcome: { result: data } });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoaded({ token, outcome: { error: 'notFound' } });
        } else {
          console.error('Failed to load shared result', err);
          setLoaded({ token, outcome: { error: 'failed' } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleExport() {
    if (!result || !shareCardRef.current) return;
    setExporting(true);
    setExportError(null);
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
      setExportError('Failed to export image — please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ds-page text-ds-ink">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-5 py-6">
        <span className="flex items-center gap-2.5">
          <span className="font-logo text-[22px] font-black tracking-[0.14em]">
            W<span className="text-w2w-red">2</span>W
          </span>
          <span className="chip chip-sm !px-[9px] !py-0.5 !font-bold">Racing</span>
        </span>
        <span className="flex items-center gap-4">
          {siteUrl && siteHost && (
            <a
              href={siteUrl}
              className="text-[13px] font-bold uppercase text-w2w-red-ink hover:underline"
            >
              {siteHost}
            </a>
          )}
          <ThemeToggle />
        </span>
      </header>

      <main className="mx-auto flex max-w-[1100px] flex-col gap-5 px-5 pb-16">
        {notFound ? (
          <p role="alert" className="m-0 text-sm text-ds-muted">This share link is invalid or has been revoked.</p>
        ) : loadError ? (
          <p role="alert" className="m-0 text-sm text-ds-danger">{loadError}</p>
        ) : !result ? (
          <p role="status" className="m-0 text-sm text-ds-muted">Loading...</p>
        ) : (
          <>
            <RaceResultHero result={result} variant="public">
              <RaceResultStatTiles result={result} variant="hero" />
              <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2.5">
                <span className="text-[13px] font-semibold text-ds-muted">Drivers</span>
                <RaceResultDriverLegend result={result} />
                <button
                  onClick={() => void handleExport()}
                  disabled={exporting}
                  className="btn-secondary btn-sm ml-auto"
                >
                  {exporting ? 'Exporting...' : 'Export PNG'}
                </button>
              </div>
            </RaceResultHero>

            {exportError && (
              <p role="alert" className="m-0 text-sm text-ds-danger">
                {exportError}
              </p>
            )}

            <RaceResultCrewTable result={result} />

            {/* Everything else the logged-in result page shows: share-of-race bars, lap-time box
                plot, lap scatter and the stint timeline/list. The hero already has the stat tiles
                and the crew table above is this page's drivers table, so both are switched off;
                driver names stay plain text (profiles aren't reachable without logging in). */}
            <RaceResultBody result={result} linkDrivers={false} showTiles={false} showDriversTable={false} />

            {contactUrl && (
              <section
                aria-labelledby="cta-title"
                className="cut flex flex-wrap items-center justify-between gap-4 bg-ds-panel px-6 py-[22px] shadow-[inset_0_-3px_0_var(--color-w2w-red)]"
              >
                <div className="flex flex-col gap-0.5">
                  <h2 id="cta-title" className="h2 text-[22px]!">Fancy a stint with us?</h2>
                  <span className="text-ds-muted">
                    W2W Racing runs GT3 and prototype endurance races on iRacing and Le Mans Ultimate.
                  </span>
                </div>
                <a href={contactUrl} className="btn-primary min-h-[46px]">
                  Get in touch
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
                    <path d="M5 12h13M13 6l6 6-6 6" />
                  </svg>
                </a>
              </section>
            )}

            {/* Off-screen (not display:none — html-to-image needs it actually laid out) render
                target for the "Export" button. aria-hidden since a screen reader walking the DOM
                linearly would otherwise hit this duplicate copy of the page's content. */}
            <div style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }} aria-hidden="true">
              <div ref={shareCardRef}>
                <RaceResultShareCard result={result} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
