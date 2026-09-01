import AuthLayout from '../../layouts/AuthLayout';
import { discordLoginUrl } from '../../lib/api';

export default function NotInServerPage() {
  return (
    <AuthLayout>
      <h1 className="font-display font-black text-2xl uppercase text-center text-w2w-white mb-3">
        Not In The Server
      </h1>
      <p className="text-center text-white/65 text-sm leading-relaxed mb-8">
        The members area is only for people in the W2W Racing Discord server. Join the server
        first, then sign in again.
      </p>
      <a
        href={discordLoginUrl()}
        className="block text-center w-full px-6 py-3.5 border border-white/20 text-white font-heading font-bold tracking-wide uppercase text-sm hover:border-w2w-red hover:text-w2w-red transition-colors clip-corner"
      >
        Try Again
      </a>
    </AuthLayout>
  );
}
