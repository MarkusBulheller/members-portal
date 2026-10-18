import AuthLayout from '../../layouts/AuthLayout';
import { discordLoginUrl } from '../../lib/api';
import { AuthStatusBody } from './PendingApprovalPage';

export default function NotInServerPage() {
  return (
    <AuthLayout>
      <AuthStatusBody
        icon="door"
        tone="amber"
        tag="Discord"
        title="Not in the server yet"
        body="The members area is only for people in the W2W Racing Discord server. Join the server first, then sign in again."
      >
        <a href={discordLoginUrl()} className="btn-primary box-border min-h-12 w-full">
          Try again
        </a>
      </AuthStatusBody>
    </AuthLayout>
  );
}
