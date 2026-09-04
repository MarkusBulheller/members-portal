import { useEffect, useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { adminApi } from '../../lib/api/admin';
import { ApiError } from '../../lib/api';
import type { Role, User, UserStatus } from '../../types/user';

const STATUS_STYLES: Record<UserStatus, string> = {
  PENDING: 'bg-white/10 text-white/60',
  APPROVED: 'bg-w2w-red/15 text-w2w-red',
  REJECTED: 'bg-white/5 text-white/65',
  SUSPENDED: 'bg-white/5 text-white/65',
};

const FILTERS: Array<UserStatus | 'ALL'> = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

export default function MembersQueuePage() {
  const confirm = useConfirm();
  const [members, setMembers] = useState<User[] | null>(null);
  const [filter, setFilter] = useState<UserStatus | 'ALL'>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void adminApi.listMembers(filter === 'ALL' ? undefined : filter).then(setMembers);
  };

  useEffect(load, [filter]);

  async function withBusy(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That action failed — please try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function withConfirm(message: string, id: string, action: () => Promise<unknown>) {
    if (!(await confirm(message, { confirmLabel: 'Confirm' }))) return;
    await withBusy(id, action);
  }

  return (
    <div>
      <p className="font-heading text-xs tracking-[0.3em] text-w2w-red uppercase mb-2">Admin</p>
      <h1 className="font-display font-black text-3xl uppercase text-w2w-white mb-6">Members</h1>

      <div className="flex gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors ${
              filter === f ? 'bg-w2w-red text-on-accent' : 'bg-w2w-charcoal text-white/65 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-4 text-w2w-red text-sm">
          {error}
        </p>
      )}

      {members === null ? (
        <p role="status" className="text-white/65 text-sm">Loading...</p>
      ) : members.length === 0 ? (
        <p className="text-white/65 text-sm">No members in this filter.</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-w2w-charcoal border border-white/10 px-5 py-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                {member.discordAvatarUrl ? (
                  <img src={member.discordAvatarUrl} alt="" className="h-9 w-9 rounded-full" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-w2w-charcoal-light flex items-center justify-center font-heading text-xs text-white/65">
                    {member.discordUsername.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-heading font-semibold text-white text-sm">
                    {member.discordGlobalName ?? member.discordUsername}
                  </p>
                  <p className="text-white/65 text-xs">@{member.discordUsername}</p>
                </div>
                <span className={`ml-2 px-2 py-0.5 text-[11px] font-heading uppercase tracking-wide ${STATUS_STYLES[member.status]}`}>
                  {member.status}
                </span>
                <span className="px-2 py-0.5 text-[11px] font-heading uppercase tracking-wide bg-white/5 text-white/65">
                  {member.role}
                </span>
              </div>

              <div className="flex gap-2 flex-wrap sm:shrink-0">
                {member.status === 'PENDING' && (
                  <>
                    <ActionButton
                      label="Approve"
                      onClick={() => withBusy(member.id, () => adminApi.approve(member.id))}
                      disabled={busyId === member.id}
                      variant="primary"
                    />
                    <ActionButton
                      label="Reject"
                      onClick={() =>
                        withConfirm(
                          `Reject ${member.discordGlobalName ?? member.discordUsername}'s membership request?`,
                          member.id,
                          () => adminApi.reject(member.id),
                        )
                      }
                      disabled={busyId === member.id}
                    />
                  </>
                )}
                {member.status === 'APPROVED' && (
                  <>
                    <ActionButton
                      label={member.role === 'ADMIN' ? 'Make Member' : 'Make Admin'}
                      onClick={() =>
                        withBusy(member.id, () =>
                          adminApi.updateRole(member.id, (member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN') as Role),
                        )
                      }
                      disabled={busyId === member.id}
                    />
                    <ActionButton
                      label="Suspend"
                      onClick={() =>
                        withConfirm(
                          `Suspend ${member.discordGlobalName ?? member.discordUsername}? They'll immediately lose access.`,
                          member.id,
                          () => adminApi.suspend(member.id),
                        )
                      }
                      disabled={busyId === member.id}
                    />
                  </>
                )}
                {(member.status === 'REJECTED' || member.status === 'SUSPENDED') && (
                  <ActionButton
                    label="Approve"
                    onClick={() => withBusy(member.id, () => adminApi.approve(member.id))}
                    disabled={busyId === member.id}
                    variant="primary"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 font-heading text-xs uppercase tracking-wide transition-colors disabled:opacity-50 ${
        variant === 'primary'
          ? 'bg-w2w-red hover:bg-w2w-red-bright text-on-accent'
          : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
      }`}
    >
      {label}
    </button>
  );
}
