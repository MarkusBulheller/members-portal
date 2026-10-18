import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthLayout from '../../layouts/AuthLayout';
import { authApi } from '../../lib/api/auth';

export type AuthTone = 'accent' | 'amber' | 'red' | 'neutral';

const ICONS = {
  clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2',
  x: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM9 9l6 6M15 9l-6 6',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  door: 'M14 3h5v18h-5M10 8l4 4-4 4M14 12H3',
  alert: 'M12 3l9.5 17h-19zM12 10v4M12 17v.5',
} as const;

const TONE_TEXT: Record<AuthTone, string> = {
  accent: 'text-w2w-red-ink',
  amber: 'text-ds-warn',
  red: 'text-ds-danger',
  neutral: 'text-ds-ink-soft',
};

const TONE_TILE: Record<AuthTone, string> = {
  accent: 'bg-w2w-red/15 text-w2w-red-ink',
  amber: 'bg-ds-warn/12 text-ds-warn',
  red: 'bg-ds-danger/15 text-ds-danger',
  neutral: 'bg-ds-control text-ds-ink-soft',
};

/** Shared body of the Account status board (icon tile, tag, title, copy, then `children` for actions).
 * `spinning` swaps the icon for a progress spinner (the board's "in progress" state); `live` marks the
 * body as a live region so screen readers announce it. */
export function AuthStatusBody({
  icon,
  spinning = false,
  live,
  tone,
  tag,
  title,
  body,
  children,
}: {
  icon?: keyof typeof ICONS;
  spinning?: boolean;
  live?: 'status' | 'alert';
  tone: AuthTone;
  tag: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div role={live} className="flex flex-col items-center gap-[18px] text-center">
      <span className={`cut-sm flex h-16 w-16 items-center justify-center ${TONE_TILE[tone]}`}>
        {spinning ? (
          <span
            aria-hidden="true"
            className="box-border h-6 w-6 animate-spin border-[3px] border-ds-control-hover border-t-w2w-red [animation-duration:0.9s] motion-reduce:animate-none"
          />
        ) : (
          icon && (
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="square"
              strokeLinejoin="miter"
              aria-hidden="true"
            >
              <path d={ICONS[icon]} />
            </svg>
          )
        )}
      </span>
      <div className="flex flex-col items-center gap-2.5">
        <span className={`chip py-[3px] ${TONE_TEXT[tone]}`}>{tag}</span>
        <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] text-ds-ink">{title}</h1>
        <p className="m-0 text-[15px] text-ds-muted">{body}</p>
      </div>
      {children}
    </div>
  );
}

const COPY: Record<
  string,
  { tag: string; title: string; body: string; icon: keyof typeof ICONS; tone: AuthTone }
> = {
  PENDING: {
    tag: 'Almost there',
    title: 'Awaiting approval',
    body: 'You’re signed in with Discord and your account is created. A team admin needs to approve you before you can get into the members area.',
    icon: 'clock',
    tone: 'accent',
  },
  REJECTED: {
    tag: 'Access request',
    title: 'Request not approved',
    body: 'Your access request wasn’t approved. If you think that’s a mistake, reach out to a team admin on Discord.',
    icon: 'x',
    tone: 'red',
  },
  SUSPENDED: {
    tag: 'Account',
    title: 'Access suspended',
    body: 'Your access to the members area is suspended. Reach out to a team admin on Discord if you have questions.',
    icon: 'lock',
    tone: 'red',
  },
};

const PENDING_STEPS = ['Signed in with Discord', 'Admin approval', 'Members area'];

export default function PendingApprovalPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') ?? 'PENDING';
  const copy = COPY[status] ?? COPY.PENDING;
  const isPending = copy === COPY.PENDING;
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // The Discord invite link is optional server config; the button simply stays hidden without it.
  useEffect(() => {
    if (!isPending) return;
    let cancelled = false;
    authApi.config().then(
      (config) => {
        if (!cancelled) setInviteUrl(config.discordInviteUrl);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [isPending]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // Nothing to undo client-side — fall through to the sign-in screen either way.
    }
    navigate('/login', { replace: true });
  }

  return (
    <AuthLayout>
      <AuthStatusBody icon={copy.icon} tone={copy.tone} tag={copy.tag} title={copy.title} body={copy.body}>
        {isPending ? (
          <>
          <ol className="cut-sm m-0 mt-1 box-border flex w-full list-none flex-col bg-ds-field px-4 py-1 text-left">
            {PENDING_STEPS.map((label, i) => {
              const done = i === 0;
              const current = i === 1;
              return (
                <li
                  key={label}
                  className={`flex items-center gap-3 py-2.5 text-[13px] ${
                    i === 0 ? '' : 'border-t border-ds-line'
                  } ${done || current ? 'font-semibold text-ds-ink' : 'text-ds-dim'}`}
                >
                  <span
                    className={`cut-xs num flex h-[26px] w-[26px] flex-none items-center justify-center text-[13px] ${
                      done
                        ? 'bg-w2w-red text-on-accent'
                        : current
                          ? 'bg-ds-control text-w2w-red-ink shadow-[inset_0_-2px_0_var(--color-w2w-red-bright)]'
                          : 'bg-ds-raised text-ds-dim'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>
          {inviteUrl && (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary box-border min-h-12 w-full"
            >
              Ask in Discord
            </a>
          )}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-w2w-red-ink hover:underline disabled:cursor-default disabled:opacity-60"
          >
            Sign out
          </button>
          </>
        ) : (
          <Link to="/login" className="btn-secondary box-border min-h-12 w-full">
            Back to sign-in
          </Link>
        )}
      </AuthStatusBody>
    </AuthLayout>
  );
}
