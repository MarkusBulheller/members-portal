import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RecapShareCard from '../../components/recap/RecapShareCard';
import RecapStoryCard from '../../components/recap/RecapStoryCard';
import { recapApi } from '../../lib/api/recap';
import { buildRecapCards, teamLabel, type RecapCardKey } from '../../lib/recapCards';
import { recapFileName } from '../../lib/recapFormat';
import type { RecapStats } from '../../types/recap';

/** Few teams read better as a segmented control; more than this becomes a select. */
const MAX_TEAM_SEGMENTS = 3;

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Failed to load the recap.';
}

/** Two animation frames: lets React commit and the browser lay out the off-screen share card before it is rasterised. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export default function RecapPage() {
  /** null = let the server pick (current year, or the latest year with results). */
  const [year, setYear] = useState<number | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [stats, setStats] = useState<RecapStats | null>(null);
  /** Which request last finished (successfully or not); loading = the current request isn't it yet. */
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${year ?? 'auto'}|${teamId ?? 'all'}|${reloadKey}`;
  const loading = settled?.key !== requestKey;
  const error = settled?.key === requestKey ? settled.error : null;
  const [sharing, setSharing] = useState<RecapCardKey | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    recapApi
      .get(year, teamId)
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setSettled({ key: requestKey, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setSettled({ key: requestKey, error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [year, teamId, requestKey]);

  const cards = useMemo(() => (stats ? buildRecapCards(stats) : []), [stats]);
  const sharingCard = cards.find((c) => c.key === sharing) ?? null;

  // Renders the chosen card off-screen (below), waits for layout, rasterises it and downloads the PNG.
  useEffect(() => {
    if (!sharing || !stats || !sharingCard) return;
    let cancelled = false;
    void (async () => {
      try {
        await nextPaint();
        if (cancelled || !shareRef.current) return;
        // Loaded on demand so the export library stays out of the main bundle.
        const { toPng } = await import('html-to-image');
        const dataUrl = await toPng(shareRef.current, { pixelRatio: 1 });
        const link = document.createElement('a');
        link.download = recapFileName(stats.year, stats.teamName, sharing);
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error('Failed to export recap image', err);
        if (!cancelled) setShareError('Failed to export image — please try again.');
      } finally {
        if (!cancelled) setSharing(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sharing, sharingCard, stats]);

  const startShare = useCallback((key: RecapCardKey) => {
    setShareError(null);
    setSharing(key);
  }, []);

  const selectedYear = year ?? stats?.year ?? null;
  const selectedTeam = teamId;
  const years = stats?.availableYears ?? [];
  const teams = stats?.teams ?? [];
  const hasAnyResults = years.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1]">Team recap</h1>
        <span className="text-ds-muted">The season so far, and who drove it.</span>
      </header>

      {(hasAnyResults || year !== null || teamId !== null) && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          {years.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span id="recap-year-label" className="lbl">
                Year
              </span>
              <div role="group" aria-labelledby="recap-year-label" className="seg">
                {years.map((y) => (
                  <button key={y} type="button" aria-pressed={y === selectedYear} onClick={() => setYear(y)}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}
          {teams.length > 0 && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span id="recap-team-label" className="lbl">
                Team
              </span>
              {teams.length <= MAX_TEAM_SEGMENTS ? (
                <div role="group" aria-labelledby="recap-team-label" className="seg">
                  <button type="button" aria-pressed={selectedTeam === null} onClick={() => setTeamId(null)}>
                    All teams
                  </button>
                  {teams.map((t) => (
                    <button key={t.teamId} type="button" aria-pressed={selectedTeam === t.teamId} onClick={() => setTeamId(t.teamId)}>
                      {t.teamName}
                    </button>
                  ))}
                </div>
              ) : (
                <select
                  aria-labelledby="recap-team-label"
                  className="input min-w-[200px] max-w-full"
                  value={selectedTeam === null ? '' : String(selectedTeam)}
                  onChange={(e) => setTeamId(e.target.value === '' ? null : Number(e.target.value))}
                >
                  <option value="">All teams</option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="cut flex flex-wrap items-center justify-between gap-3 bg-ds-panel px-5 py-4">
          <span className="text-sm text-ds-danger">{error}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      )}

      {shareError && (
        <p role="alert" className="m-0 text-sm text-ds-danger">
          {shareError}
        </p>
      )}

      {!stats && loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm font-semibold text-ds-muted">
          Loading the recap…
        </div>
      )}

      {stats && stats.totals.races === 0 && (
        <div className="cut flex flex-col gap-1 bg-ds-panel px-6 py-10 text-center">
          <h2 className="m-0 text-xl font-extrabold">
            {hasAnyResults ? `No results in ${stats.year}` : 'No race results yet'}
          </h2>
          <p className="m-0 text-sm text-ds-muted">
            {hasAnyResults
              ? `No imported races for ${teamLabel(stats)} in ${stats.year}. Try another year or team.`
              : 'The recap appears once the first race results are imported.'}
          </p>
        </div>
      )}

      {stats && cards.length > 0 && (
        <div
          aria-busy={loading}
          className={`flex flex-col gap-5 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          <p className="m-0 text-sm text-ds-muted">
            <strong className="font-bold text-ds-ink">{teamLabel(stats)}</strong> · {stats.year}
          </p>
          {cards.map((card, i) => (
            <RecapStoryCard
              key={card.key}
              card={card}
              index={i}
              total={cards.length}
              sharing={sharing === card.key}
              busy={sharing !== null}
              onShare={() => startShare(card.key)}
            />
          ))}
        </div>
      )}

      {/* Off-screen (not display:none — html-to-image needs it actually laid out) render target for
          "Share". aria-hidden: a duplicate of the card above. Only the card being exported is mounted. */}
      {stats && sharingCard && (
        <div style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }} aria-hidden="true">
          <div ref={shareRef}>
            <RecapShareCard stats={stats} card={sharingCard} />
          </div>
        </div>
      )}
    </div>
  );
}
