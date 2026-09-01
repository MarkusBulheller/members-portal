import { useSearchParams } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { discordLoginUrl } from '../../lib/api';

const DiscordIcon = () => (
  <svg viewBox="0 0 20 19" className="h-5 w-5 fill-current">
    <path d="M16.224 3.768a14.5 14.5 0 0 0-3.67-1.153c-.158.286-.343.67-.47.976a13.5 13.5 0 0 0-4.067 0c-.128-.306-.317-.69-.476-.976A14.4 14.4 0 0 0 3.868 3.77C1.546 7.28.916 10.703 1.231 14.077a14.7 14.7 0 0 0 4.5 2.306q.545-.748.965-1.587a9.5 9.5 0 0 1-1.518-.74q.191-.14.372-.293c2.927 1.369 6.107 1.369 8.999 0q.183.152.372.294-.723.437-1.52.74.418.838.963 1.588a14.6 14.6 0 0 0 4.504-2.308c.37-3.911-.63-7.302-2.644-10.309m-9.13 8.234c-.878 0-1.599-.82-1.599-1.82 0-.998.705-1.82 1.6-1.82.894 0 1.614.82 1.599 1.82.001 1-.705 1.82-1.6 1.82m5.91 0c-.878 0-1.599-.82-1.599-1.82 0-.998.705-1.82 1.6-1.82.893 0 1.614.82 1.599 1.82 0 1-.706 1.82-1.6 1.82" />
  </svg>
);

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Discord sign-in failed or was cancelled. Please try again.',
};

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  return (
    <AuthLayout>
      <h1 className="font-display font-black text-2xl uppercase text-center text-w2w-white mb-2">
        Member Sign-In
      </h1>
      <p className="text-center text-white/65 text-sm mb-8">
        Sign in with the Discord account linked to the team's server.
      </p>

      {error && (
        <p className="mb-6 text-sm text-w2w-red bg-w2w-red/10 border border-w2w-red/30 px-4 py-3">
          {ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.'}
        </p>
      )}

      <a
        href={discordLoginUrl()}
        className="flex items-center justify-center gap-3 w-full px-6 py-3.5 bg-[#5865F2] hover:bg-[#4752c4] text-on-accent font-heading font-bold tracking-wide uppercase text-sm transition-colors clip-corner"
      >
        <DiscordIcon />
        Sign in with Discord
      </a>
    </AuthLayout>
  );
}
