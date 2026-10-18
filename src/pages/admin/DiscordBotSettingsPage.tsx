import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { discordBotSettingsApi } from '../../lib/api/discordBotSettings';
import type { DiscordBotSettings, DiscordBotStatus } from '../../types/discordBotSettings';

function StatusRow({
  label,
  state,
  okLabel,
  badLabel,
  unknownLabel,
}: {
  label: string;
  state: boolean | null;
  okLabel: string;
  badLabel: string;
  unknownLabel: string;
}) {
  const color = state === true ? 'text-[#4ade80]' : state === false ? 'text-ds-warn' : 'text-ds-dim';
  const badge =
    state === true
      ? 'bg-[rgba(34,197,94,0.15)] text-[#4ade80]'
      : state === false
        ? 'bg-ds-warn/15 text-ds-warn'
        : 'bg-ds-raised text-ds-dim';
  const mark = state === true ? '✓' : state === false ? '!' : '?';
  const text = state === true ? okLabel : state === false ? badLabel : unknownLabel;
  return (
    <div className="flex items-center gap-3 border-t border-ds-line px-5 py-3">
      <span
        className={`cut-xs flex h-[30px] w-[30px] flex-none items-center justify-center font-extrabold ${badge}`}
        aria-hidden="true"
      >
        {mark}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold text-ds-ink">{label}</span>
        <span className={`text-[13px] ${color}`}>{text}</span>
      </span>
    </div>
  );
}

export default function DiscordBotSettingsPage() {
  const [settings, setSettings] = useState<DiscordBotSettings | null>(null);
  const [botToken, setBotToken] = useState('');
  const [eventsChannelId, setEventsChannelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<DiscordBotStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = () =>
    void discordBotSettingsApi.get().then((s) => {
      setSettings(s);
      setEventsChannelId(s.eventsChannelId ?? '');
    });

  const loadStatus = () => {
    setStatusLoading(true);
    setStatusError(null);
    void discordBotSettingsApi
      .checkStatus()
      .then(setStatus)
      .catch((err: unknown) => setStatusError(err instanceof ApiError ? err.message : 'Failed to check bot status'))
      .finally(() => setStatusLoading(false));
  };

  useEffect(load, []);
  useEffect(loadStatus, []);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await discordBotSettingsApi.update({
        botToken: botToken.trim() || undefined,
        eventsChannelId,
      });
      setSettings(updated);
      setBotToken('');
      setSaved(true);
      loadStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <p role="status" className="m-0 text-sm text-ds-muted">Loading...</p>;
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section
        aria-labelledby="bot-cfg"
        className="cut flex min-w-0 flex-[3_1_420px] flex-col gap-[18px] bg-ds-panel px-6 py-[22px]"
      >
        <div className="flex flex-col gap-1">
          <h2 id="bot-cfg" className="h2">Discord bot</h2>
          <span className="text-[13px] text-ds-muted">
            Posts an announcement to Discord whenever an event is published.
          </span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="lbl">Bot token</span>
          <input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={settings.hasToken ? '••••••••••••••••••••' : 'Not set'}
            autoComplete="new-password"
            className="input"
          />
          <span className="text-xs text-ds-dim">
            {settings.hasToken
              ? 'A token is saved. Paste a new one to replace it.'
              : 'From the Discord Developer Portal → your app → Bot → Reset Token.'}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="lbl">Events channel ID</span>
          <input
            type="text"
            value={eventsChannelId}
            onChange={(e) => setEventsChannelId(e.target.value)}
            placeholder="e.g. 1135558244635516998"
            className="input tabular-nums"
          />
          <span className="text-xs text-ds-dim">
            Right-click the channel in Discord (Developer Mode must be on) → Copy Channel ID. The bot must already
            have Send Messages permission there.
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="cut-sm m-0 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]"
          >
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="m-0 text-sm text-[#4ade80]">
            Saved.
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="btn-primary self-start"
        >
          {busy ? 'Saving...' : 'Save'}
        </button>
      </section>

      <section
        aria-labelledby="bot-status"
        className="cut flex min-w-0 flex-[2_1_300px] flex-col bg-ds-panel pb-1.5 pt-5"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-3">
          <h2 id="bot-status" className="h2">Live status</h2>
          <button type="button" onClick={loadStatus} disabled={statusLoading} className="btn-secondary btn-sm cut-xs !text-[13px]">
            {statusLoading ? 'Checking...' : 'Recheck'}
          </button>
        </div>

        {statusError && (
          <p role="alert" className="m-0 border-t border-ds-line px-5 py-3 text-[13px] text-ds-danger">
            {statusError}
          </p>
        )}

        {status && (
          <>
            <StatusRow
              label="Bot token"
              state={status.tokenValid}
              okLabel={status.botUsername ? `Valid (${status.botUsername})` : 'Valid'}
              badLabel="Invalid"
              unknownLabel="Unknown"
            />
            <StatusRow
              label="In the team server"
              state={status.inGuild}
              okLabel="Joined"
              badLabel="No"
              unknownLabel={status.guildConfigured ? 'Unknown' : 'Server not configured'}
            />
            <StatusRow
              label="Channel permissions"
              state={status.channelPermissionsOk}
              okLabel="OK"
              badLabel={status.missingPermissions.length > 0 ? `Missing: ${status.missingPermissions.join(', ')}` : 'Missing permissions'}
              unknownLabel={status.channelConfigured ? 'Unknown' : 'Channel not set'}
            />
          </>
        )}

        {status?.error && (
          <p className="m-0 border-t border-ds-line px-5 py-3 text-xs text-ds-warn">{status.error}</p>
        )}
      </section>
    </div>
  );
}
