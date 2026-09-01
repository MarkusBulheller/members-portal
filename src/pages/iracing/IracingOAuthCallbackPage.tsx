import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import {
  completeIracingCarSync,
  completeIracingLink,
  completeIracingSeriesSync,
  completeIracingTeamSync,
  completeIracingTrackSync,
  peekIracingOAuthPurpose,
} from '../../lib/iracing';

export default function IracingOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');
    const purpose = peekIracingOAuthPurpose();

    if (oauthError) {
      setError(`iRacing sign-in was cancelled or failed (${oauthError}).`);
      return;
    }
    if (!code || !state) {
      setError('Missing code or state in the redirect from iRacing.');
      return;
    }

    if (purpose === 'sync-cars') {
      completeIracingCarSync(code, state)
        .then(({ synced }) => navigate(`/cars/new?synced=${synced}`, { replace: true }))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to sync the iRacing car catalog.');
        });
      return;
    }

    if (purpose === 'sync-tracks') {
      completeIracingTrackSync(code, state)
        .then(({ synced }) => navigate(`/tracks/new?synced=${synced}`, { replace: true }))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to sync the iRacing track catalog.');
        });
      return;
    }

    if (purpose === 'sync-series') {
      completeIracingSeriesSync(code, state)
        .then(({ synced }) => navigate(`/series?synced=${synced}`, { replace: true }))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to sync the iRacing series catalog.');
        });
      return;
    }

    if (purpose === 'sync-team') {
      completeIracingTeamSync(code, state)
        .then(({ teamsSynced }) => navigate(`/admin/iracing-teams?synced=${teamsSynced}`, { replace: true }))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to sync iRacing teams.');
        });
      return;
    }

    completeIracingLink(code, state)
      .then(() => navigate('/drivers/me/edit?iracing=linked', { replace: true }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to link your iRacing account.');
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <AuthLayout>
        <h1 className="font-display font-black text-2xl uppercase text-center text-w2w-white mb-3">
          Failed
        </h1>
        <p className="text-center text-white/65 text-sm leading-relaxed mb-6">{error}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="block mx-auto text-xs text-w2w-red hover:text-w2w-red-bright"
        >
          ← Back to dashboard
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="font-display font-black text-2xl uppercase text-center text-w2w-white mb-3">
        Signing In
      </h1>
      <p role="status" className="text-center text-white/65 text-sm">
        Talking to iRacing...
      </p>
    </AuthLayout>
  );
}
