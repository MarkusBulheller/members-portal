import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import FollowTimeline from '../../components/FollowTimeline';
import ThemeToggle from '../../components/ThemeToggle';
import {
  clockReadout,
  formatCountdownLong,
  formatHms,
  formatLocalDayTime,
  formatLocalTime,
  formatStintRange,
  formatUntil,
  type FollowStintView,
  type FollowView,
  spansLocalDays,
  stintTiming,
  timeZoneAbbreviation,
} from '../../lib/followState';
import { type FollowConnection, useFollowNow, useFollowState } from '../../lib/useFollowState';
import type { FollowState } from '../../types/follow';

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="font-logo text-[22px] font-black tracking-[0.14em]">
        W<span className="text-w2w-red">2</span>W
      </span>
      <span className="chip chip-sm !px-[9px] !py-0.5 !font-bold">Racing</span>
    </span>
  );
}

function LiveChip({ connection }: { connection: FollowConnection }) {
  return (
    <span
      className={`chip chip-sm ${connection === 'live' ? 'chip-accent' : 'chip-muted'}`}
      title={
        connection === 'live'
          ? 'This page updates by itself'
          : 'Live updates are paused - this page refreshes every 15 seconds meanwhile'
      }
    >
      {connection === 'live' ? 'Live' : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </span>
  );
}

function ProgressBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
      className="h-2 w-full bg-ds-control"
    >
      <div className="h-full bg-w2w-red" style={{ width: `${Math.round((value ?? 0) * 1000) / 10}%` }} />
    </div>
  );
}

/** The race clock. Owns the 1 Hz tick, so the rest of the page doesn't re-render every second. */
function RaceClock({ view, offsetMs }: { view: FollowView; offsetMs: number }) {
  const nowMs = useFollowNow(offsetMs);
  const c = clockReadout(view, nowMs);
  const big = 'num leading-none text-[clamp(34px,9.5vw,76px)]';
  const label = 'text-[13px] font-semibold text-ds-muted';

  if (c.phase === 'unscheduled') {
    return (
      <div className="flex flex-col gap-1">
        <span className={label}>Race clock</span>
        <span className="text-[clamp(20px,5vw,30px)] font-extrabold">Start time not set yet</span>
      </div>
    );
  }
  if (c.phase === 'before') {
    return (
      <div className="flex flex-col gap-2">
        <span className={label}>Green flag in</span>
        <span className={big} aria-label={`Green flag in ${formatHms(c.untilStartMs ?? 0)}`}>
          {formatCountdownLong(c.untilStartMs ?? 0)}
        </span>
        {view.raceStartMs !== null && (
          <span className="text-sm text-ds-muted">{formatLocalDayTime(view.raceStartMs)}</span>
        )}
      </div>
    );
  }
  if (c.phase === 'finished') {
    return (
      <div className="flex flex-col gap-2">
        <span className={label}>Chequered flag</span>
        <span className={big}>Finished</span>
        {c.elapsedMs !== null && <span className="text-sm text-ds-muted">Race time {formatHms(c.elapsedMs)}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-x-8 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
        <div className="flex flex-col gap-2">
          <span className={label}>Elapsed</span>
          <span className={big}>{formatHms(c.elapsedMs ?? 0)}</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className={label}>Remaining</span>
          <span className={`${big} text-ds-ink-soft`}>{formatHms(c.remainingMs ?? 0)}</span>
        </div>
      </div>
      <ProgressBar value={c.progress} label="Race progress" />
    </div>
  );
}

function StintCounter({ stint, count }: { stint: FollowStintView; count: number }) {
  return (
    <span className="num text-[15px] text-ds-muted">
      Stint {stint.number} of {count}
    </span>
  );
}

function DriverName({ stint, className }: { stint: FollowStintView; className: string }) {
  return (
    <span className={`${className} min-w-0 break-words ${stint.assigned ? '' : 'text-ds-muted'}`}>{stint.driverName}</span>
  );
}

/** Progress/ETA part of the "Driving now" card - ticks every second on its own. */
function DrivingTiming({ view, offsetMs }: { view: FollowView; offsetMs: number }) {
  const nowMs = useFollowNow(offsetMs);
  const current = view.current;
  if (!current) return null;
  const t = stintTiming(view, nowMs);
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar value={t.progress} label="Stint progress" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-ds-muted">
        <span>{current.startMs !== null ? `Started ${formatLocalTime(current.startMs)}` : ''}</span>
        <span>
          {current.endMs !== null && (
            <>
              Ends <span className="num text-ds-ink">{formatLocalTime(current.endMs)}</span>
              {' · '}
              {t.overrun ? 'running over' : <span className="num text-ds-ink">in {formatUntil(t.untilEndMs ?? 0)}</span>}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function DrivingNowCard({ view, offsetMs }: { view: FollowView; offsetMs: number }) {
  const { current } = view;
  let body;
  if (current) {
    body = (
      <>
        <div className="flex flex-col gap-1">
          <DriverName stint={current} className="text-[clamp(28px,6vw,44px)] font-extrabold leading-[1.1]" />
          <StintCounter stint={current} count={view.stintCount} />
        </div>
        <DrivingTiming view={view} offsetMs={offsetMs} />
      </>
    );
  } else {
    const message =
      view.phase === 'finished'
        ? 'The race has finished.'
        : view.changeover
          ? 'Pit stop - driver change in progress.'
          : view.phase === 'before'
            ? 'Waiting for the green flag.'
            : view.phase === 'unscheduled'
              ? 'Waiting for the race to be scheduled.'
              : 'Nobody on track right now.';
    body = <p className="m-0 text-[clamp(18px,4vw,24px)] font-extrabold leading-snug text-ds-ink-soft">{message}</p>;
  }
  return (
    <section
      aria-labelledby="driving-now-title"
      className="cut flex flex-col gap-4 bg-ds-panel px-[22px] py-5 shadow-[inset_0_-3px_0_var(--color-w2w-red)]"
    >
      <h2 id="driving-now-title" className="h2">
        Driving now
      </h2>
      {body}
    </section>
  );
}

function NextUpTiming({ view, offsetMs }: { view: FollowView; offsetMs: number }) {
  const nowMs = useFollowNow(offsetMs);
  const next = view.next;
  if (!next) return null;
  const t = stintTiming(view, nowMs);
  const startMs = next.startMs ?? (view.phase === 'before' ? view.raceStartMs : null);
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ds-muted">
      {t.untilNextMs !== null && (
        <span>
          {view.changeover ? 'Due ' : 'Starts '}in{' '}
          <span className="num text-[22px] text-ds-ink">{formatUntil(t.untilNextMs)}</span>
        </span>
      )}
      {startMs !== null && (
        <span>
          at <span className="num text-ds-ink">{formatLocalTime(startMs)}</span>
        </span>
      )}
    </div>
  );
}

function NextUpCard({ view, offsetMs }: { view: FollowView; offsetMs: number }) {
  const { next } = view;
  return (
    <section aria-labelledby="next-up-title" className="cut flex flex-col gap-4 bg-ds-panel px-[22px] py-5">
      <h2 id="next-up-title" className="h2">
        Next up
      </h2>
      {next ? (
        <>
          <div className="flex flex-col gap-1">
            <DriverName stint={next} className="text-[clamp(22px,4.5vw,32px)] font-extrabold leading-[1.1]" />
            <StintCounter stint={next} count={view.stintCount} />
          </div>
          <NextUpTiming view={view} offsetMs={offsetMs} />
        </>
      ) : (
        <p className="m-0 text-[clamp(18px,4vw,24px)] font-extrabold leading-snug text-ds-ink-soft">
          {view.phase === 'finished' ? 'No more stints.' : view.current ? 'This is the final stint.' : 'Nothing planned yet.'}
        </p>
      )}
    </section>
  );
}

const STATUS_CHIP: Record<FollowStintView['status'], { label: string; className: string } | null> = {
  done: { label: 'Done', className: 'chip-muted' },
  live: { label: 'Live', className: 'chip-solid' },
  next: { label: 'Next', className: 'chip-accent' },
  upcoming: null,
};

function StintList({ view, zone }: { view: FollowView; zone: string }) {
  const withDay = spansLocalDays(view);
  const cols =
    'grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[48px_minmax(0,1.2fr)_minmax(0,1.4fr)_88px]';
  return (
    <section aria-labelledby="stints-title" className="cut flex flex-col gap-3 bg-ds-panel px-[22px] py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="stints-title" className="h2">
          Stints
        </h2>
        <span className="text-[13px] text-ds-muted">Times in your local time{zone ? ` (${zone})` : ''}</span>
      </div>
      {view.stints.length === 0 ? (
        <p className="m-0 text-sm text-ds-muted">No stints have been planned yet.</p>
      ) : (
        <div>
          <div
            aria-hidden="true"
            className={`${cols} hidden px-2 pb-2 text-[11px] font-bold uppercase text-ds-dim sm:grid`}
          >
            <span>#</span>
            <span>Driver</span>
            <span>Start – end</span>
            <span className="justify-self-end">Status</span>
          </div>
          <ol className="m-0 list-none p-0">
            {view.stints.map((s) => {
              const chip = STATUS_CHIP[s.status];
              const live = s.status === 'live';
              return (
                <li
                  key={s.number}
                  aria-current={live ? 'step' : undefined}
                  className={`grid ${cols} gap-y-0.5 border-t border-ds-line px-2 py-2.5 sm:py-3 ${
                    live ? 'bg-ds-raised shadow-[inset_3px_0_0_var(--color-w2w-red)]' : ''
                  } ${s.status === 'done' ? 'text-ds-dim' : ''}`}
                >
                  <span className="num row-span-2 text-[18px] sm:row-span-1">{s.number}</span>
                  <span
                    className={`col-start-2 min-w-0 truncate text-[15px] font-bold ${
                      !s.assigned ? 'text-ds-muted' : s.status === 'done' ? 'text-ds-dim' : ''
                    }`}
                  >
                    {s.driverName}
                  </span>
                  <span className="num col-start-2 row-start-2 text-[13px] text-ds-muted sm:col-start-3 sm:row-start-1 sm:text-[14px]">
                    {formatStintRange(s.startMs, s.endMs, withDay)}
                  </span>
                  <span className="col-start-3 row-span-2 row-start-1 justify-self-end sm:col-start-4 sm:row-span-1">
                    {chip && <span className={`chip chip-sm ${chip.className}`}>{chip.label}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

/** Polite screen-reader announcement of who is driving; changes only when the driver does. */
function announcement(view: FollowView): string {
  if (view.current) return `Now driving: ${view.current.driverName}, stint ${view.current.number} of ${view.stintCount}.`;
  if (view.phase === 'finished') return 'The race has finished.';
  if (view.changeover) return 'Pit stop, driver change in progress.';
  return '';
}

function Notice({ title, children, role }: { title: string; children: string; role: 'alert' | 'status' }) {
  return (
    <section role={role} className="cut flex flex-col gap-2 bg-ds-panel px-[22px] py-6 shadow-[inset_0_-3px_0_var(--color-w2w-red)]">
      <h1 className="m-0 text-[clamp(22px,5vw,30px)] font-extrabold leading-[1.15]">{title}</h1>
      <p className="m-0 text-sm text-ds-muted">{children}</p>
    </section>
  );
}

function FollowContent({
  state,
  view,
  connection,
  offsetMs,
}: {
  state: FollowState;
  view: FollowView;
  connection: FollowConnection;
  offsetMs: number;
}) {
  const zone = timeZoneAbbreviation(view.evaluatedAtMs);
  const simLabel = state.event.sim === 'LMU' ? 'Le Mans Ultimate' : 'iRacing';
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(view)}
      </p>

      <section aria-labelledby="follow-title" className="cut-lg flex flex-col gap-6 bg-ds-panel px-[clamp(18px,4vw,36px)] py-[clamp(20px,4vw,32px)]">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 id="follow-title" className="m-0 text-[clamp(26px,5vw,34px)] font-extrabold leading-[1.1]">
              {state.team.name}
            </h1>
            <LiveChip connection={connection} />
            <span className="chip chip-sm">{simLabel}</span>
          </div>
          <span className="text-sm text-ds-muted">
            {state.event.title}
            {state.event.trackName && ` · ${state.event.trackName}`}
            {state.team.carName && ` · ${state.team.carName}`}
          </span>
        </div>
        <RaceClock view={view} offsetMs={offsetMs} />
      </section>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
        <DrivingNowCard view={view} offsetMs={offsetMs} />
        <NextUpCard view={view} offsetMs={offsetMs} />
      </div>

      <StintList view={view} zone={zone} />
      <FollowTimeline view={view} offsetMs={offsetMs} />
    </>
  );
}

/** Public, anonymous "Follow the race" page, reached through a team's private live link (the
 * "Share live view" button on the team plan). Read-only: who is driving now, who is next and when
 * the changeovers are. Not behind RequireAuth; no fuel, tyre, lap-time or setting data exists here. */
export default function FollowRacePage() {
  const { token } = useParams<{ token: string }>();
  const { state, view, connection, error, offsetMs } = useFollowState(token);

  const teamName = state?.team.name;
  useEffect(() => {
    const previous = document.title;
    document.title = teamName ? `${teamName} – live` : 'Follow the race';
    return () => {
      document.title = previous;
    };
  }, [teamName]);

  return (
    <div className="min-h-screen bg-ds-page text-ds-ink">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-5 py-6">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main className="mx-auto flex max-w-[1100px] flex-col gap-5 px-5 pb-16">
        {error === 'inactive' ? (
          <Notice role="alert" title="This link is no longer active.">
            The team has switched this live view off or replaced the link. Ask them for the new one.
          </Notice>
        ) : state && view ? (
          <FollowContent state={state} view={view} connection={connection} offsetMs={offsetMs} />
        ) : error === 'failed' ? (
          <Notice role="alert" title="Couldn't load the live view.">
            Please check your connection - we keep trying in the background.
          </Notice>
        ) : (
          <p role="status" className="m-0 text-sm text-ds-muted">
            Loading...
          </p>
        )}
      </main>
    </div>
  );
}
