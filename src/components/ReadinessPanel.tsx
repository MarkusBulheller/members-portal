import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { progressOf } from '../lib/readiness';
import { useReadiness } from '../lib/useReadiness';
import ReadinessCheckList from './ReadinessCheckList';
import ReadinessStatusChip from './ReadinessStatusChip';

/** "Race readiness": an informational go/no-go for the event — nothing here blocks anything. The
 * server decides what the viewer may see (admins: every team; members: only their own). The whole
 * panel stays hidden when there is nothing to show. */
export default function ReadinessPanel({ eventId }: { eventId: string }) {
  const { data, loading, error, refresh } = useReadiness(eventId);
  const { hash } = useLocation();
  const visible = !!data && (data.event.length > 0 || data.teams.length > 0);

  // The page loads asynchronously, so the browser's own #hash scroll misses this panel.
  useEffect(() => {
    if (visible && hash === '#readiness') {
      document.getElementById('readiness')?.scrollIntoView({ block: 'start' });
    }
  }, [visible, hash]);

  if (!data && !error && !loading) return null;
  if (data && !visible) return null;

  const progress = data ? progressOf(data.summary) : null;
  const pct = progress && progress.total > 0 ? (progress.passed / progress.total) * 100 : 0;

  return (
    <section
      id="readiness"
      aria-labelledby="readiness-title"
      aria-busy={loading}
      className="cut flex scroll-mt-4 flex-col gap-4 bg-ds-panel px-4 py-4 sm:px-6 sm:py-[22px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="readiness-title" className="h2">
            Race readiness
          </h2>
          {data && <ReadinessStatusChip summary={data.summary} />}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="btn-secondary btn-sm"
        >
          {loading && data ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p role="alert" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ds-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={refresh}
            className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-ds-ink underline"
          >
            Try again
          </button>
        </p>
      )}

      {!data && loading && (
        <div aria-hidden="true" className="flex flex-col gap-2.5">
          <div className="h-1.5 bg-ds-control" />
          <div className="h-4 w-2/3 bg-ds-control" />
          <div className="h-4 w-1/2 bg-ds-control" />
        </div>
      )}

      {data && progress && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ds-muted">
              <span className="num text-ds-ink">{progress.passed}</span> of{' '}
              <span className="num text-ds-ink">{progress.total}</span> checks passed
              <span className="text-ds-dim"> · informational, nothing here blocks signups or planning</span>
            </span>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.passed}
              aria-label="Readiness checks passed"
              className="h-1.5 bg-ds-control"
            >
              <div className="h-full bg-w2w-red" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {data.event.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="m-0 text-sm font-extrabold text-ds-ink">Event</h3>
                <ReadinessCheckList checks={data.event} eventId={eventId} />
              </div>
            )}
            {data.teams.map((team) => (
              <div key={team.teamId} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="m-0 text-sm font-extrabold text-ds-ink">{team.teamName}</h3>
                  <ReadinessStatusChip summary={team.summary} small />
                </div>
                <ReadinessCheckList checks={team.checks} eventId={eventId} />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
