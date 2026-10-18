import { useSearchParams } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { discordLoginUrl } from '../../lib/api';

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="fill-current">
    <path d="M19.6 5.3A17 17 0 0 0 15.4 4l-.5 1.1a15.7 15.7 0 0 0-4.8 0L9.6 4a17 17 0 0 0-4.2 1.3C2.7 9.3 2 13.2 2.3 17a17 17 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.7-.8l.4-.3a12.2 12.2 0 0 0 10.4 0l.4.3-1.7.8 1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.3-3.1-11.7zM8.9 14.7c-1 0-1.9-.9-1.9-2s.8-2 1.9-2 1.9.9 1.9 2-.8 2-1.9 2zm6.2 0c-1 0-1.9-.9-1.9-2s.8-2 1.9-2 1.9.9 1.9 2-.8 2-1.9 2z" />
  </svg>
);

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Discord sign-in failed or was cancelled. Please try again.',
};

const STEPS = [
  'Join the W2W Racing Discord server',
  'Sign in here with that account',
  'A team admin approves you, then you’re in',
];

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  return (
    <AuthLayout bare>
      <div className="flex min-h-screen flex-wrap">
        <section
          aria-label="W2W Racing"
          className="relative box-border flex min-h-[420px] min-w-0 flex-[1_1_520px] flex-col justify-between gap-10 overflow-hidden border-r border-ds-edge bg-ds-sidebar p-[clamp(28px,5vw,64px)] pr-[clamp(150px,15vw,210px)]"
        >
          <div
            aria-hidden="true"
            className="absolute right-0 top-1/2 h-[280px] w-[clamp(120px,11vw,160px)] -translate-y-1/2"
            style={{
              background:
                'linear-gradient(110deg, transparent 0 28%, var(--color-w2w-red) 28% 40%, transparent 40% 50%, var(--color-w2w-red) 50% 100%)',
            }}
          />
          <span className="relative font-logo text-[28px] font-black tracking-[0.14em] text-ds-ink">
            W<span className="text-w2w-red">2</span>W
          </span>
          <div className="relative flex max-w-[520px] flex-col gap-4">
            <span className="chip chip-solid self-start py-[3px]">Endurance sportscar racing</span>
            <h1 className="m-0 text-[clamp(40px,4.6vw,62px)] font-extrabold leading-[0.98] text-ds-ink">
              Plan the stint.
              <br />
              Run the race.
            </h1>
            <p className="m-0 max-w-[420px] text-base text-ds-muted">
              Sign-ups, stint plans, setups and results for the W2W Racing team, in one place.
            </p>
          </div>
          <span className="relative text-xs text-ds-dim">W2W Racing · members only</span>
        </section>

        <section className="box-border flex min-w-0 flex-[1_1_420px] items-center justify-center p-[clamp(28px,5vw,64px)]">
          <div className="flex w-full max-w-[380px] flex-col gap-[22px]">
            <div className="flex flex-col gap-1.5">
              <h2 className="h2 text-[30px] leading-[1.1]">Member sign-in</h2>
              <p className="m-0 text-ds-muted">Use the Discord account that’s in the team’s server.</p>
            </div>

            {error && (
              <p
                role="alert"
                className="cut-sm m-0 flex items-start gap-2.5 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="square"
                  aria-hidden="true"
                  className="mt-px flex-none"
                >
                  <path d="M12 3l9.5 17h-19zM12 10v4M12 17v.5" />
                </svg>
                {ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.'}
              </p>
            )}

            <a
              href={discordLoginUrl()}
              className="cut-sm flex min-h-[52px] items-center justify-center gap-3 bg-[#5865F2] text-[15px] font-extrabold uppercase text-on-accent no-underline transition-colors hover:bg-[#4752c4]"
            >
              <DiscordIcon />
              Sign in with Discord
            </a>

            <ol className="m-0 flex list-none flex-col p-0 text-[13px] text-ds-muted">
              {STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-3 border-t border-ds-line py-2.5">
                  <span className="cut-xs num flex h-[26px] w-[26px] flex-none items-center justify-center bg-ds-panel text-[13px] text-ds-ink">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </AuthLayout>
  );
}
