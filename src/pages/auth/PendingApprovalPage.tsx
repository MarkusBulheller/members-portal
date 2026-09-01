import { useSearchParams } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';

const COPY: Record<string, { title: string; body: string }> = {
  PENDING: {
    title: 'Awaiting Approval',
    body: "You're signed in with Discord, and your account has been created. A team admin needs to approve you before you can access the members area — check back soon.",
  },
  REJECTED: {
    title: 'Request Not Approved',
    body: 'Your access request was not approved. If you think this is a mistake, reach out to a team admin on Discord.',
  },
  SUSPENDED: {
    title: 'Access Suspended',
    body: 'Your access to the members area has been suspended. Reach out to a team admin on Discord if you have questions.',
  },
};

export default function PendingApprovalPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') ?? 'PENDING';
  const copy = COPY[status] ?? COPY.PENDING;

  return (
    <AuthLayout>
      <h1 className="font-display font-black text-2xl uppercase text-center text-w2w-white mb-3">
        {copy.title}
      </h1>
      <p className="text-center text-white/65 text-sm leading-relaxed">{copy.body}</p>
    </AuthLayout>
  );
}
