import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { AuthStatusBody } from '../auth/PendingApprovalPage';
import {
  type IracingOAuthPurpose,
  completeIracingCarSync,
  completeIracingLink,
  completeIracingSeriesSync,
  completeIracingTeamSync,
  completeIracingTrackSync,
  peekIracingOAuthPurpose,
} from '../../lib/iracing';

/** Where the "back" action of the failure screen leads: the page the flow was started from. */
const BACK_TARGETS: Record<IracingOAuthPurpose, { to: string; label: string }> = {
  'link-profile': { to: '/drivers/me/edit', label: 'Back to my profile' },
  'sync-cars': { to: '/cars/new', label: 'Back to cars' },
  'sync-tracks': { to: '/tracks/new', label: 'Back to tracks' },
  'sync-series': { to: '/series', label: 'Back to series' },
  'sync-team': { to: '/admin/iracing-teams', label: 'Back to iRacing teams' },
};

export default function IracingOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Captured once up front: the complete* helpers below clear the stored purpose as they run, but
  // the failure screen still needs it to know where "back" should go.
  const [startedPurpose] = useState<IracingOAuthPurpose>(() => peekIracingOAuthPurpose() ?? 'link-profile');
  const isLink = startedPurpose === 'link-profile';
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
        .then(({ synced, failed, failedSeries }) =>
          navigate(`/series?synced=${synced}${failed ? `&failed=${failed}` : ''}`, {
            replace: true,
            state: { failedSeries: failedSeries ?? [] },
          }),
        )
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
    const back = BACK_TARGETS[startedPurpose];
    return (
      <AuthLayout>
        <AuthStatusBody
          live="alert"
          icon="alert"
          tone="amber"
          tag="iRacing"
          title={isLink ? 'Couldn’t link iRacing' : 'Couldn’t sync iRacing'}
          body={
            isLink
              ? 'iRacing didn’t confirm the sign-in. Nothing changed on your profile. Try again from your profile page.'
              : 'iRacing didn’t confirm the sign-in, so nothing was synced. Try again from the page you started on.'
          }
        >
          <p className="m-0 text-[13px] text-ds-dim">{error}</p>
          <Link to={back.to} replace className="btn-primary box-border min-h-12 w-full">
            {back.label}
          </Link>
          <Link to="/dashboard" className="text-[13px] font-semibold text-w2w-red-ink no-underline hover:underline">
            Go to dashboard
          </Link>
        </AuthStatusBody>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthStatusBody
        live="status"
        spinning
        tone="neutral"
        tag="iRacing"
        title={isLink ? 'Linking your account' : 'Syncing from iRacing'}
        body="Talking to iRacing. This only takes a moment."
      />
    </AuthLayout>
  );
}
