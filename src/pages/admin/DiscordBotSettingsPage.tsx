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
  const color = state === true ? 'text-emerald-400' : state === false ? 'text-w2w-red' : 'text-white/40';
  const dot = state === true ? 'bg-emerald-400' : state === false ? 'bg-w2w-red' : 'bg-white/40';
  const text = state === true ? okLabel : state === false ? badLabel : unknownLabel;
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-white/65">{label}</span>
      <span className={`flex items-center gap-1.5 font-heading text-xs uppercase tracking-wide ${color}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
        {text}
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
    return <p className="text-white/65 text-sm">Loading...</p>;
  }

  return (
    <div className="max-w-xl">
      <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Admin</p>
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-2">Discord Bot</h1>
      <p className="text-white/65 text-sm mb-8">
        Controls the bot that posts an announcement to Discord whenever an event is published.
      </p>

      <div className="bg-w2w-charcoal border border-white/10 p-6 space-y-5">
        <label className="flex flex-col gap-2">
          <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Bot Token</span>
          <input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={settings.hasToken ? 'Set — leave blank to keep it' : 'Not set'}
            autoComplete="new-password"
            className="input"
          />
          <span className="block text-white/70 text-[11px]">
            From the Discord Developer Portal → your app → Bot → Reset Token. Never shown again once saved —
            leave this blank to keep the current one.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Events Channel ID</span>
          <input
            type="text"
            value={eventsChannelId}
            onChange={(e) => setEventsChannelId(e.target.value)}
            placeholder="e.g. 1135558244635516998"
            className="input"
          />
          <span className="block text-white/70 text-[11px]">
            Right-click the channel in Discord (Developer Mode must be on) → Copy Channel ID. The bot must
            already have Send Messages permission there.
          </span>
        </label>

        {error && <p className="text-w2w-red text-sm">{error}</p>}
        {saved && !error && <p className="text-emerald-400 text-sm">Saved.</p>}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="px-5 py-2.5 bg-w2w-red hover:bg-w2w-red-bright disabled:opacity-50 text-on-accent font-heading font-bold tracking-wide uppercase text-xs transition-colors clip-corner"
        >
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="mt-6 bg-w2w-charcoal border border-white/10 p-6">
        <div className="flex items-center justify-between mb-1">
          <p className="font-heading text-xs tracking-[0.2em] uppercase text-white/65">Live Status</p>
          <button
            type="button"
            onClick={loadStatus}
            disabled={statusLoading}
            className="text-white/50 hover:text-white text-[11px] font-heading uppercase tracking-wide disabled:opacity-40"
          >
            {statusLoading ? 'Checking...' : 'Recheck'}
          </button>
        </div>

        {statusError && <p className="text-w2w-red text-sm mt-2">{statusError}</p>}

        {status && (
          <div className="mt-2 divide-y divide-white/5">
            <StatusRow
              label="Bot token"
              state={status.tokenValid}
              okLabel={status.botUsername ? `Valid (${status.botUsername})` : 'Valid'}
              badLabel="Invalid"
              unknownLabel="Unknown"
            />
            <StatusRow
              label="In the team's server"
              state={status.inGuild}
              okLabel="Yes"
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
          </div>
        )}

        {status?.error && <p className="text-amber-400 text-xs mt-3">{status.error}</p>}
      </div>
    </div>
  );
}
