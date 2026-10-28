import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Switch from '../../components/Switch';
import { ApiError } from '../../lib/api';
import { iracingAutoImportApi } from '../../lib/api/iracingAutoImport';
import { iracingTeamsApi } from '../../lib/api/iracingTeams';
import { relativeTime, shortDate } from '../../lib/relativeTime';
import { useIracingTeamToggles } from '../../lib/useIracingTeamToggles';
import type {
  AutoImportAttempt,
  AutoImportAttemptStatus,
  AutoImportMode,
  AutoImportRunResult,
  AutoImportRunStatus,
  AutoImportSettings,
  UpdateAutoImportSettingsInput,
} from '../../types/iracingAutoImport';
import type { IracingTeam } from '../../types/iracingTeam';

const MIN_DELAY = 5;
const MAX_DELAY = 240;

const NOTICE_ERROR =
  'cut-sm m-0 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]';
const NOTICE_WARN =
  'cut-sm m-0 flex flex-wrap items-center gap-x-3 gap-y-1 bg-ds-warn/10 px-3.5 py-3 text-[13px] text-ds-ink-soft shadow-[inset_3px_0_0_var(--color-ds-warn)]';
const NOTICE_INFO =
  'cut-sm m-0 flex flex-wrap items-center gap-x-3 gap-y-1 bg-ds-raised px-3.5 py-3 text-[13px] text-ds-ink-soft shadow-[inset_3px_0_0_var(--color-w2w-red)]';

const RUN_CHIP: Record<AutoImportRunStatus, { label: string; className: string }> = {
  OK: { label: 'OK', className: 'chip-accent' },
  SKIPPED: { label: 'Skipped', className: 'chip-muted' },
  ERROR: { label: 'Error', className: 'chip-warn' },
};

const ATTEMPT_CHIP: Record<AutoImportAttemptStatus, { label: string; className: string }> = {
  FOUND: { label: 'Found', className: '' },
  IMPORTED: { label: 'Imported', className: 'chip-accent' },
  FAILED: { label: 'Failed', className: 'chip-warn' },
  IGNORED: { label: 'Ignored', className: 'chip-muted' },
};

const FILTERS: { status: AutoImportAttemptStatus; label: string }[] = [
  { status: 'FOUND', label: 'Found' },
  { status: 'IMPORTED', label: 'Imported' },
  { status: 'FAILED', label: 'Failed' },
  { status: 'IGNORED', label: 'Ignored' },
];

const EMPTY_TEXT: Record<AutoImportAttemptStatus, string> = {
  FOUND: 'Nothing waiting. New finished races from watched teams show up here.',
  IMPORTED: 'No automatically imported results yet.',
  FAILED: 'No failed imports.',
  IGNORED: 'No ignored results.',
};

/** "23 Oct, 18:42" — 24-hour clock, with the year only when it isn't this year. */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shortDate(iso)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function RunStatusChip({ status }: { status: AutoImportRunStatus }) {
  const chip = RUN_CHIP[status];
  return <span className={`chip chip-sm ${chip.className}`}>{chip.label}</span>;
}

export default function AutoImportAdminPage() {
  return (
    <div className="flex flex-col gap-5">
      <StatusCard />
      <WatchedTeamsPanel />
      <ResultsPanel />
    </div>
  );
}

/* ------------------------------------------------------------------ status card */

function StatusCard() {
  const [settings, setSettings] = useState<AutoImportSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delayInput, setDelayInput] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<AutoImportRunResult | null>(null);

  const load = useCallback(() => {
    iracingAutoImportApi
      .get()
      .then((s) => {
        setSettings(s);
        setDelayInput(String(s.delayMinutes));
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(errorMessage(err, 'Failed to load the auto-import settings.')));
  }, []);

  useEffect(load, [load]);

  async function save(input: UpdateAutoImportSettingsInput) {
    setSaving(true);
    setError(null);
    try {
      const updated = await iracingAutoImportApi.update(input);
      setSettings(updated);
      setDelayInput(String(updated.delayMinutes));
    } catch (err) {
      setError(errorMessage(err, 'Failed to save the settings.'));
      if (settings) setDelayInput(String(settings.delayMinutes));
    } finally {
      setSaving(false);
    }
  }

  const parsedDelay = Number(delayInput);
  const delayValid = delayInput.trim() !== '' && Number.isInteger(parsedDelay) && parsedDelay >= MIN_DELAY && parsedDelay <= MAX_DELAY;
  const delayDirty = settings !== null && delayInput.trim() !== String(settings.delayMinutes);

  function commitDelay() {
    if (!settings || !delayDirty || !delayValid || saving) return;
    void save({ delayMinutes: parsedDelay });
  }

  function handleDelaySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    commitDelay();
  }

  async function handleRunNow() {
    setRunning(true);
    setError(null);
    setRunResult(null);
    try {
      setRunResult(await iracingAutoImportApi.runNow());
      load();
    } catch (err) {
      setError(errorMessage(err, 'The run failed.'));
    } finally {
      setRunning(false);
    }
  }

  if (!settings) {
    return loadError ? (
      <p role="alert" className={NOTICE_ERROR}>
        {loadError}
      </p>
    ) : (
      <p role="status" className="m-0 text-sm text-ds-muted">
        Loading...
      </p>
    );
  }

  const mode: AutoImportMode = settings.mode;

  return (
    <section aria-labelledby="ai-status" className="cut flex flex-col gap-[18px] bg-ds-panel px-6 py-[22px]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="ai-status" className="h2">
            Auto-import race results
          </h2>
          <span className="text-[13px] text-ds-muted">
            Checks every 30 minutes · only results that finish after you switch it on
          </span>
        </div>
        <Switch
          checked={settings.enabled}
          label="Auto-import race results"
          disabled={saving}
          onChange={(next) => void save({ enabled: next })}
        />
      </div>

      {settings.enabled && settings.enabledSince && (
        <span className="text-[13px] text-ds-muted">
          Watching races that finish after <span className="font-semibold text-ds-ink-soft">{formatDateTime(settings.enabledSince)}</span>.
        </span>
      )}

      {!settings.resultsChannelId && (
        <p role="note" className={NOTICE_WARN}>
          <span>No results channel set — announcements are skipped. Set one under Discord bot.</span>
          <Link to="/admin/settings/discord-bot" className="font-semibold text-w2w-red-ink hover:underline">
            Open Discord bot settings
          </Link>
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] items-start gap-x-6 gap-y-[18px]">
        <div className="flex flex-col gap-1.5">
          <span className="lbl" id="ai-mode-label">
            When a result is found
          </span>
          <div role="group" aria-labelledby="ai-mode-label" className="seg seg-field self-start">
            <button
              type="button"
              aria-pressed={mode === 'NOTIFY'}
              disabled={saving}
              onClick={() => mode !== 'NOTIFY' && void save({ mode: 'NOTIFY' })}
            >
              Notify only (recommended first)
            </button>
            <button
              type="button"
              aria-pressed={mode === 'AUTO'}
              disabled={saving}
              onClick={() => mode !== 'AUTO' && void save({ mode: 'AUTO' })}
            >
              Import automatically
            </button>
          </div>
          <span className="text-xs text-ds-dim">
            {mode === 'NOTIFY'
              ? 'Finished races are listed below for you to import or ignore.'
              : 'Finished races are imported on their own and announced in the results channel.'}
          </span>
        </div>

        <form onSubmit={handleDelaySubmit} className="flex flex-col gap-1.5">
          <label htmlFor="ai-delay" className="lbl">
            Wait after the race ends
          </label>
          <div className="flex items-center gap-2">
            <input
              id="ai-delay"
              type="number"
              inputMode="numeric"
              min={MIN_DELAY}
              max={MAX_DELAY}
              step={1}
              value={delayInput}
              onChange={(e) => setDelayInput(e.target.value)}
              onBlur={commitDelay}
              disabled={saving}
              aria-invalid={delayDirty && !delayValid}
              className="input num w-28 flex-none"
            />
            <span className="text-[13px] text-ds-muted">minutes</span>
            {delayDirty && (
              <button type="submit" disabled={saving || !delayValid} className="btn-secondary btn-sm">
                Save
              </button>
            )}
          </div>
          <span className={`text-xs ${delayDirty && !delayValid ? 'text-ds-danger' : 'text-ds-dim'}`}>
            {delayDirty && !delayValid
              ? `Enter a whole number from ${MIN_DELAY} to ${MAX_DELAY}.`
              : 'Gives iRacing time to finish processing the results (5–240).'}
          </span>
        </form>
      </div>

      {error && (
        <p role="alert" className={NOTICE_ERROR}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-ds-line pt-4">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <span className="lbl">Last run</span>
          {settings.lastRunAt ? (
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ds-ink-soft">
              <span title={formatDateTime(settings.lastRunAt)}>{relativeTime(settings.lastRunAt, { capitalize: true })}</span>
              {settings.lastRunStatus && <RunStatusChip status={settings.lastRunStatus} />}
              {settings.lastRunMessage && <span className="min-w-0 text-ds-muted">{settings.lastRunMessage}</span>}
            </span>
          ) : (
            <span className="text-sm text-ds-muted">It hasn't run yet.</span>
          )}
        </div>
        <button type="button" onClick={() => void handleRunNow()} disabled={running} className="btn-secondary">
          {running ? 'Running...' : 'Run now'}
        </button>
      </div>

      {runResult && (
        <p role="status" className={NOTICE_INFO}>
          <RunStatusChip status={runResult.status} />
          <span>
            {runResult.message} · Found <span className="num">{runResult.found}</span>, imported{' '}
            <span className="num">{runResult.imported}</span>.
          </span>
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ watched teams */

function WatchedTeamsPanel() {
  const [teams, setTeams] = useState<IracingTeam[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toggles = useIracingTeamToggles((updated) =>
    setTeams((list) => list?.map((t) => (t.teamId === updated.teamId ? updated : t)) ?? list),
  );

  useEffect(() => {
    iracingTeamsApi
      .list({ includeInactive: true })
      .then(setTeams)
      .catch((err: unknown) => setLoadError(errorMessage(err, 'Failed to load the iRacing teams.')));
  }, []);

  return (
    <section aria-labelledby="ai-teams" className="cut flex flex-col bg-ds-panel pb-1.5 pt-5">
      <div className="flex flex-col gap-1 px-6 pb-3">
        <h2 id="ai-teams" className="h2">
          Watched teams
        </h2>
        <span className="text-[13px] text-ds-muted">
          Only teams switched on here are checked for new results. Teams come from the iRacing teams tab.
        </span>
      </div>

      {toggles.error && (
        <p role="alert" className={`${NOTICE_ERROR} mx-5 mb-3`}>
          {toggles.error}
        </p>
      )}

      {teams === null ? (
        loadError ? (
          <p role="alert" className={`${NOTICE_ERROR} mx-5 mb-3`}>
            {loadError}
          </p>
        ) : (
          <p role="status" className="m-0 border-t border-ds-line px-6 py-6 text-sm text-ds-muted">
            Loading...
          </p>
        )
      ) : teams.length === 0 ? (
        <p className="m-0 border-t border-ds-line px-6 py-8 text-center text-ds-muted">
          No iRacing teams yet. Sync them from the{' '}
          <Link to="/admin/settings/iracing-teams" className="font-semibold text-w2w-red-ink hover:underline">
            iRacing teams
          </Link>{' '}
          tab first.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {teams.map((team) => {
            const busy = toggles.busyIds.has(team.teamId);
            const muted = team.active ? '' : 'opacity-60';
            return (
              <li
                key={team.teamId}
                className="row-hover flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-ds-line px-6 py-3.5"
              >
                <span className={`flex min-w-0 flex-[1_1_240px] items-center gap-3.5 ${muted}`}>
                  <span
                    aria-hidden="true"
                    className="cut-xs flex h-10 w-10 flex-none items-center justify-center bg-ds-control text-[15px] font-black italic text-ds-ink"
                  >
                    {team.teamName.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ds-ink">{team.teamName}</span>
                      {!team.active && <span className="chip chip-sm chip-muted">Inactive</span>}
                    </span>
                    <span className="text-[13px] text-ds-muted">
                      Team ID {team.teamId} ·{' '}
                      {team.manual ? 'added by hand' : <><span className="num">{team.rosterCount}</span> on roster</>} ·{' '}
                      <span title={team.lastCheckedAt ? formatDateTime(team.lastCheckedAt) : undefined}>
                        {team.lastCheckedAt ? `Checked ${relativeTime(team.lastCheckedAt)}` : 'Never checked'}
                      </span>
                    </span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <span className={`flex items-center gap-2.5 ${muted}`}>
                    <span className="text-[13px] font-semibold text-ds-muted" aria-hidden="true">
                      Watch for results
                    </span>
                    <Switch
                      checked={team.active && team.autoImport}
                      label={`Watch for results: ${team.teamName}`}
                      disabled={!team.active || busy}
                      onChange={(next) => void toggles.setAutoImport(team, next)}
                    />
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="text-[13px] font-semibold text-ds-muted" aria-hidden="true">
                      Active
                    </span>
                    <Switch
                      checked={team.active}
                      label={`Active: ${team.teamName}`}
                      disabled={busy}
                      onChange={(next) => void toggles.setActive(team, next)}
                    />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ results */

function finishLine(attempt: AutoImportAttempt) {
  const inClass = attempt.finishingPositionInClass;
  const overall = attempt.finishingPosition;
  if (inClass === null && overall === null) return <span className="text-ds-dim">No finish data</span>;
  return (
    <span>
      {inClass !== null && (
        <>
          <span className="num text-base">P{inClass}</span> in class
        </>
      )}
      {inClass !== null && overall !== null && ' · '}
      {overall !== null && (
        <>
          <span className="num text-base">P{overall}</span> overall
        </>
      )}
    </span>
  );
}

function ResultsPanel() {
  const [status, setStatus] = useState<AutoImportAttemptStatus>('FOUND');
  const [attempts, setAttempts] = useState<AutoImportAttempt[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; raceResultId: string | null } | null>(null);
  const requestRef = useRef(0);

  const load = useCallback((which: AutoImportAttemptStatus) => {
    const token = ++requestRef.current;
    iracingAutoImportApi
      .listAttempts(which, 50)
      .then((list) => {
        if (token !== requestRef.current) return;
        setAttempts(list);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (token !== requestRef.current) return;
        setAttempts((current) => current ?? []);
        setLoadError(errorMessage(err, 'Failed to load the results.'));
      });
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  function pickStatus(next: AutoImportAttemptStatus) {
    if (next === status) return;
    setAttempts(null);
    setLoadError(null);
    setActionError(null);
    setNotice(null);
    setStatus(next);
  }

  async function handleImport(attempt: AutoImportAttempt) {
    setBusyId(attempt.id);
    setActionError(null);
    setNotice(null);
    try {
      const { raceResultId } = await iracingAutoImportApi.importAttempt(attempt.id);
      setNotice({ text: `Imported ${attempt.trackName ?? 'the race'}.`, raceResultId });
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 409
          ? 'That result was already imported.'
          : errorMessage(err, 'Failed to import the result.'),
      );
    } finally {
      setBusyId(null);
      load(status);
    }
  }

  async function handleIgnore(attempt: AutoImportAttempt) {
    setBusyId(attempt.id);
    setActionError(null);
    setNotice(null);
    try {
      await iracingAutoImportApi.ignoreAttempt(attempt.id);
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to ignore the result.'));
    } finally {
      setBusyId(null);
      load(status);
    }
  }

  return (
    <section aria-labelledby="ai-results" className="cut flex flex-col bg-ds-panel pb-1.5 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3">
        <h2 id="ai-results" className="h2">
          Results
        </h2>
        <div role="group" aria-label="Filter by status" className="seg seg-field">
          {FILTERS.map((f) => (
            <button key={f.status} type="button" aria-pressed={status === f.status} onClick={() => pickStatus(f.status)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p role="status" className={`${NOTICE_INFO} mx-5 mb-3`}>
          <span>{notice.text}</span>
          {notice.raceResultId && (
            <Link to={`/results/${notice.raceResultId}`} className="font-semibold text-w2w-red-ink hover:underline">
              View result
            </Link>
          )}
        </p>
      )}
      {actionError && (
        <p role="alert" className={`${NOTICE_ERROR} mx-5 mb-3`}>
          {actionError}
        </p>
      )}
      {loadError && (
        <p role="alert" className={`${NOTICE_ERROR} mx-5 mb-3`}>
          {loadError}
        </p>
      )}

      {attempts === null ? (
        <p role="status" className="m-0 border-t border-ds-line px-6 py-6 text-sm text-ds-muted">
          Loading...
        </p>
      ) : attempts.length === 0 ? (
        !loadError && (
          <p className="m-0 border-t border-ds-line px-6 py-8 text-center text-ds-muted">{EMPTY_TEXT[status]}</p>
        )
      ) : (
        <ul aria-label={`${ATTEMPT_CHIP[status].label} results`} className="m-0 flex list-none flex-col p-0">
          {attempts.map((attempt) => {
            const chip = ATTEMPT_CHIP[attempt.status];
            const actionable = attempt.status === 'FOUND' || attempt.status === 'FAILED';
            const busy = busyId === attempt.id;
            return (
              <li
                key={attempt.id}
                className="row-hover flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-ds-line px-6 py-3.5"
              >
                <div className="flex min-w-0 flex-[2_1_240px] flex-col">
                  <span className="font-bold text-ds-ink">
                    {attempt.seriesName ?? 'Unknown series'} · {attempt.trackName ?? 'Unknown track'}
                  </span>
                  <span className="text-[13px] text-ds-muted">
                    {attempt.teamName}
                    {attempt.carName ? ` · ${attempt.carName}` : ''} · Session {attempt.subsessionId}
                  </span>
                </div>

                <div className="flex min-w-0 flex-[1_1_170px] flex-col text-sm text-ds-ink-soft">
                  {finishLine(attempt)}
                  <span className="text-[13px] text-ds-muted">
                    {attempt.lapsComplete !== null ? (
                      <>
                        <span className="num">{attempt.lapsComplete}</span> laps
                      </>
                    ) : (
                      'Laps unknown'
                    )}
                    {' · Ended '}
                    {formatDateTime(attempt.endTime ?? attempt.startTime)}
                  </span>
                </div>

                <div className="flex flex-none flex-wrap items-center gap-2">
                  <span className={`chip chip-sm ${chip.className}`}>{chip.label}</span>
                  {attempt.status === 'IMPORTED' && attempt.raceResultId && (
                    <Link
                      to={`/results/${attempt.raceResultId}`}
                      className="text-[13px] font-semibold text-w2w-red-ink hover:underline"
                    >
                      View result
                    </Link>
                  )}
                  {actionable && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleImport(attempt)}
                        disabled={busy}
                        className="btn-primary btn-sm"
                      >
                        {busy ? 'Working...' : 'Import'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleIgnore(attempt)}
                        disabled={busy}
                        className="btn-secondary btn-sm"
                      >
                        Ignore
                      </button>
                    </>
                  )}
                </div>

                {attempt.status === 'FAILED' && (
                  <p className="m-0 basis-full text-[13px] text-ds-warn">
                    Tried <span className="num">{attempt.tries}</span>× {attempt.lastError ? `· ${attempt.lastError}` : ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
