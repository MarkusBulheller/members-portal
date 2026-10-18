import { useEffect, useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { adminApi } from '../../lib/api/admin';
import { ApiError } from '../../lib/api';
import { initials } from '../../lib/initials';
import { monthYear as formatMonthYear, relativeTime } from '../../lib/relativeTime';
import type { MemberStatusCounts, Role, User, UserStatus } from '../../types/user';

const STATUS_CHIP: Record<UserStatus, string> = {
  PENDING: 'chip text-ds-warn',
  APPROVED: 'chip chip-accent',
  REJECTED: 'chip',
  SUSPENDED: 'chip',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

const FILTERS: Array<UserStatus | 'ALL'> = ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED', 'ALL'];

function monthYear(iso: string | null): string {
  return iso ? formatMonthYear(iso) : '';
}

function whenLine(member: User): string {
  switch (member.status) {
    case 'PENDING':
      return `Requested ${relativeTime(member.createdAt)}`;
    case 'APPROVED':
      return `Member since ${monthYear(member.approvedAt ?? member.createdAt)}`;
    case 'SUSPENDED':
      return `Suspended ${monthYear(member.updatedAt)}`;
    case 'REJECTED':
      return `Rejected ${monthYear(member.updatedAt)}`;
  }
}

export default function MembersQueuePage() {
  const confirm = useConfirm();
  const [members, setMembers] = useState<User[] | null>(null);
  const [counts, setCounts] = useState<MemberStatusCounts | null>(null);
  const [filter, setFilter] = useState<UserStatus | 'ALL'>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void adminApi.listMembers(filter === 'ALL' ? undefined : filter).then(setMembers);
    // Badges are a nicety — if the counts request fails the tabs just render without them.
    adminApi.counts().then(setCounts, () => setCounts(null));
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

  async function withConfirm(message: string, confirmLabel: string, id: string, action: () => Promise<unknown>) {
    if (!(await confirm(message, { confirmLabel }))) return;
    await withBusy(id, action);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.1] text-ds-ink">Members</h1>
        <span className="text-ds-muted">
          Everyone who signed in with Discord. New sign-ins wait here until approved.
        </span>
      </header>

      <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1 border-b border-ds-line">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            role="tab"
            aria-selected={filter === f}
            className={`-mb-px flex min-h-[46px] cursor-pointer items-center border-0 bg-transparent px-3.5 text-sm font-extrabold uppercase transition-colors ${
              filter === f
                ? 'text-ds-ink shadow-[inset_0_-3px_0_var(--color-w2w-red)]'
                : 'text-ds-muted hover:text-ds-ink'
            }`}
          >
            {f === 'ALL' ? 'All' : STATUS_LABEL[f]}
            {counts && (
              <span
                className={`slant num ml-2 box-border min-w-[26px] px-[9px] py-0.5 text-center text-[11px] ${
                  f === 'PENDING' && counts[f] > 0 ? 'bg-w2w-red text-on-accent' : 'bg-ds-line text-ds-muted'
                }`}
              >
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="cut-sm m-0 bg-ds-danger/10 px-3.5 py-3 text-[13px] text-ds-danger shadow-[inset_3px_0_0_var(--color-ds-danger)]"
        >
          {error}
        </p>
      )}

      {members === null ? (
        <p role="status" className="m-0 text-sm text-ds-muted">Loading...</p>
      ) : (
        <section aria-label="Members" className="cut bg-ds-panel py-1">
          {members.length === 0 ? (
            <p className="m-0 px-4 py-9 text-center text-ds-muted">
              Nobody here. New sign-ins show up under Pending.
            </p>
          ) : (
            members.map((member, i) => (
              <div
                key={member.id}
                className={`row-hover box-border flex min-h-[68px] flex-wrap items-center gap-3.5 px-5 py-3 ${
                  i === 0 ? '' : 'border-t border-ds-line'
                }`}
              >
                {member.discordAvatarUrl ? (
                  <img src={member.discordAvatarUrl} alt="" className="cut-xs h-[42px] w-[42px] flex-none object-cover" />
                ) : (
                  <span className="cut-xs flex h-[42px] w-[42px] flex-none items-center justify-center bg-ds-control text-[15px] font-black italic text-ds-ink">
                    {initials(member.discordGlobalName ?? member.discordUsername)}
                  </span>
                )}
                <span className="flex min-w-0 flex-[1_1_200px] flex-col">
                  <span className="font-bold text-ds-ink">{member.discordGlobalName ?? member.discordUsername}</span>
                  <span className="text-[13px] text-ds-muted">
                    @{member.discordUsername} · {whenLine(member)}
                  </span>
                </span>
                <span className={STATUS_CHIP[member.status]}>{STATUS_LABEL[member.status]}</span>
                <span className="chip chip-muted">{member.role}</span>

                <span className="flex flex-wrap gap-2">
                  {member.status === 'PENDING' && (
                    <>
                      <ActionButton
                        label="Reject"
                        onClick={() =>
                          withConfirm(
                            `Reject ${member.discordGlobalName ?? member.discordUsername}'s membership request?`,
                            'Reject',
                            member.id,
                            () => adminApi.reject(member.id),
                          )
                        }
                        disabled={busyId === member.id}
                        variant="danger"
                      />
                      <ActionButton
                        label="Approve"
                        onClick={() => withBusy(member.id, () => adminApi.approve(member.id))}
                        disabled={busyId === member.id}
                        variant="primary"
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
                            'Suspend',
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
                      label="Restore access"
                      onClick={() => withBusy(member.id, () => adminApi.approve(member.id))}
                      disabled={busyId === member.id}
                    />
                  )}
                </span>
              </div>
            ))
          )}
        </section>
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
  variant?: 'default' | 'primary' | 'danger';
}) {
  const base =
    variant === 'primary'
      ? 'btn-primary px-5'
      : variant === 'danger'
        ? 'btn-danger px-[18px]'
        : 'btn-secondary px-[18px] text-ds-ink-soft';
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} min-h-10 text-[13px]`}>
      {label}
    </button>
  );
}
