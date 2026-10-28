import { useEffect, useState } from 'react';
import { ApiError, apiUrl } from '../../lib/api';
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

const INTERACTIONS_URL = apiUrl('/discord/interactions');

export default function DiscordBotSettingsPage() {
  const [settings, setSettings] = useState<DiscordBotSettings | null>(null);
  const [botToken, setBotToken] = useState('');
  const [eventsChannelId, setEventsChannelId] = useState('');
  const [resultsChannelId, setResultsChannelId] = useState('');
  const [eventCategoryId, setEventCategoryId] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [alertUserId, setAlertUserId] = useState('');
  const [copied, setCopied] = useState(false);
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
      setResultsChannelId(s.resultsChannelId ?? '');
      setEventCategoryId(s.eventCategoryId ?? '');
      setAlertUserId(s.alertUserId ?? '');
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
        resultsChannelId: resultsChannelId.trim(),
        eventCategoryId: eventCategoryId.trim(),
        publicKey: publicKey.trim() || undefined,
        alertUserId: alertUserId.trim(),
      });
      setSettings(updated);
      setBotToken('');
      setPublicKey('');
      setResultsChannelId(updated.resultsChannelId ?? '');
      setEventCategoryId(updated.eventCategoryId ?? '');
      setAlertUserId(updated.alertUserId ?? '');
      setSaved(true);
      loadStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings');
    } finally {
      setBusy(false);
    }
  }

  async function copyInteractionsUrl() {
    try {
      await navigator.clipboard.writeText(INTERACTIONS_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the URL is selectable in the read-only field.
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

        <label className="flex flex-col gap-1.5">
          <span className="lbl">Results channel ID</span>
          <input
            type="text"
            value={resultsChannelId}
            onChange={(e) => setResultsChannelId(e.target.value)}
            placeholder="e.g. 1135558244635516998"
            inputMode="numeric"
            className="input tabular-nums"
          />
          <span className="text-xs text-ds-dim">
            Where imported results are announced. Same steps as above (Copy Channel ID); the bot needs Send Messages
            permission there too. Leave empty to skip announcements.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="lbl">Event category ID</span>
          <input
            type="text"
            value={eventCategoryId}
            onChange={(e) => setEventCategoryId(e.target.value)}
            placeholder="e.g. 1135558244635516998"
            inputMode="numeric"
            className="input tabular-nums"
          />
          <span className="text-xs text-ds-dim">
            The category where the <b>Discord channel</b> button on an event page creates a new channel. Right-click the
            category in Discord → Copy Category ID. The bot needs the Manage Channels permission (on the server or on
            that category). Until it is set, the button asks you to set it.
          </span>
        </label>

        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-base font-extrabold text-ds-ink">Sign-up buttons</h3>
          <span className="text-[13px] text-ds-muted">
            Lets members sign up straight from the event post in Discord.
          </span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="lbl">Interactions endpoint URL</span>
          <span className="flex gap-2">
            <input
              type="text"
              readOnly
              value={INTERACTIONS_URL}
              onFocus={(e) => e.currentTarget.select()}
              className="input min-w-0 flex-1 tabular-nums"
            />
            <button type="button" onClick={() => void copyInteractionsUrl()} className="btn-secondary flex-none">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
          <span className="text-xs text-ds-dim">
            Paste this into Discord Developer Portal → your app → General Information → Interactions Endpoint URL.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="lbl">Application public key</span>
          <input
            type="text"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder={settings.publicKeySet ? '••••••••••••••••••••' : 'Not set'}
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className="input tabular-nums"
          />
          <span className="text-xs text-ds-dim">
            {settings.publicKeySet
              ? 'A public key is saved. Paste a new one to replace it. '
              : ''}
            Discord Developer Portal → your app → General Information → Public Key (64 characters).
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="lbl">Alert user ID</span>
          <input
            type="text"
            value={alertUserId}
            onChange={(e) => setAlertUserId(e.target.value)}
            placeholder="e.g. 1135558244635516998"
            inputMode="numeric"
            className="input tabular-nums"
          />
          <span className="text-xs text-ds-dim">
            Your Discord user ID (gets a DM when someone who isn't linked tries to sign up).
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
