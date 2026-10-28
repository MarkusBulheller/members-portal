import { useEffect, useMemo, useRef, useState } from 'react';
import PersonalRaceCard from './PersonalRaceCard';
import { driversApi } from '../lib/api/drivers';
import { formatDuration, formatLapTime } from '../lib/lapTime';
import { computeRaceSummary } from '../lib/raceSummary';
import { buildSummaryTiles } from '../lib/raceSummaryTiles';
import type { RaceResult } from '../types/raceResult';

/** "Your race": the logged-in member's own mini report of this result — stat tiles, their stints
 * and a PNG share image (rendered from the off-screen PersonalRaceCard). Renders nothing unless
 * the member's own driver profile has a stint in the result; only ever the viewer's OWN race, never
 * another driver's. The profile is fetched once (GET /drivers/me); a failure just hides the panel. */
export default function PersonalRaceSummary({ result }: { result: RaceResult }) {
  const [ownProfileId, setOwnProfileId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    driversApi
      .getOwn()
      .then((profile) => {
        if (!cancelled) setOwnProfileId(profile.id);
      })
      .catch(() => {
        // No driver profile (or the request failed): the panel simply doesn't show.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () => (ownProfileId ? computeRaceSummary(result, ownProfileId) : null),
    [result, ownProfileId],
  );
  const tiles = useMemo(() => (summary ? buildSummaryTiles(summary) : []), [summary]);

  if (!summary) return null;

  async function handleShareImage() {
    if (!cardRef.current || !summary) return;
    setExporting(true);
    setError(null);
    try {
      // Loaded on demand so the export library stays out of the main bundle.
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 1 });
      const link = document.createElement('a');
      link.download = `w2w-my-race-${result.trackName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${result.subsessionId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export personal race image', err);
      setError('Failed to export image — please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section
      aria-labelledby="my-race-title"
      className="cut flex flex-col gap-4 bg-ds-panel px-[22px] pb-6 pt-5 shadow-[inset_0_-3px_0_var(--color-w2w-red)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="my-race-title" className="h2">Your race</h2>
          <span className="text-[13px] text-ds-muted">
            {summary.driverCount > 1
              ? `Your drive compared with ${summary.driverCount - 1} teammate${summary.driverCount === 2 ? '' : 's'}.`
              : 'Your drive in this race.'}
          </span>
        </div>
        <button type="button" onClick={() => void handleShareImage()} disabled={exporting} className="btn-secondary btn-sm">
          {exporting ? 'Exporting...' : 'Share image'}
        </button>
      </div>

      {summary.highlights.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {summary.highlights.map((h) => (
            <li key={h.key} className="chip chip-accent chip-sm">
              {h.label}
            </li>
          ))}
        </ul>
      )}

      <dl className="m-0 grid grid-cols-2 gap-2.5 min-[760px]:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="cut-sm flex flex-col gap-0.5 bg-ds-field px-4 py-3.5">
            <dt className="text-[13px] font-semibold text-ds-muted">{tile.label}</dt>
            <dd className="num m-0 text-[26px] leading-[1.15]">{tile.value}</dd>
            <dd className="m-0 min-h-[18px] text-xs leading-snug text-ds-muted">{tile.sub}</dd>
          </div>
        ))}
      </dl>

      {summary.stints.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ds-muted">Your stints</span>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {summary.stints.map((stint) => (
              <li
                key={stint.stintNumber}
                className="cut-sm flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-ds-field py-2.5 pl-[18px] pr-3.5 text-sm shadow-[inset_4px_0_0_var(--color-w2w-red)]"
              >
                <span className="font-bold text-ds-ink">
                  Stint {stint.stintNumber}
                  <span className="ml-2 text-xs font-normal text-ds-muted">
                    L{stint.startLap}–{stint.endLap}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ds-muted">
                  <span>
                    <span className="num text-sm text-ds-ink-soft">{stint.laps}</span> lap{stint.laps === 1 ? '' : 's'}
                    {stint.driveMs !== null ? ` · ${formatDuration(stint.driveMs)}` : ''}
                  </span>
                  <span>
                    avg <span className="num text-sm text-ds-ink-soft">{formatLapTime(stint.avgLapMs)}</span>
                  </span>
                  <span>
                    best <span className="num text-sm text-ds-ink-soft">{formatLapTime(stint.bestLapMs)}</span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {error}
        </p>
      )}

      {/* Off-screen (not display:none — html-to-image needs it actually laid out) render target for
          "Share image". aria-hidden: a duplicate copy of the numbers above. */}
      <div style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={cardRef}>
          <PersonalRaceCard result={result} summary={summary} />
        </div>
      </div>
    </section>
  );
}
