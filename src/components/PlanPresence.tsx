import { useState } from 'react';
import { resolveAssetUrl } from '../lib/api';
import { initials } from '../lib/initials';
import type { PresenceUser } from '../lib/useLivePlan';

/** Avatars shown before the rest collapse into "+N" (the current user's included). */
const MAX_AVATARS = 4;

const ADMIN_NOTE = 'Changes from others appear live; edits to the same field may overwrite each other.';

const idKey = (users: PresenceUser[]) => users.map((u) => u.userId).join('|');

/** "Alex joined" / "Bea and Cy left" / "Alex joined, Bea left". Empty for the first snapshot (nothing
 * to compare with), after a disconnect, and when only the current user's own presence changed. */
function describeChange(prev: PresenceUser[], next: PresenceUser[], meId: string | undefined): string {
  if (prev.length === 0 || next.length === 0) return '';
  const before = new Set(prev.map((u) => u.userId));
  const after = new Set(next.map((u) => u.userId));
  const list = (users: PresenceUser[]) => {
    const names = users.map((u) => u.name);
    return names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  };
  const joined = next.filter((u) => !before.has(u.userId) && u.userId !== meId);
  const left = prev.filter((u) => !after.has(u.userId) && u.userId !== meId);
  const parts: string[] = [];
  if (joined.length > 0) parts.push(`${list(joined)} joined`);
  if (left.length > 0) parts.push(`${list(left)} left`);
  return parts.join(', ');
}

function Avatar({ user, isMe }: { user: PresenceUser; isMe: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = isMe ? `${user.name} (you)` : user.name;
  const showImage = Boolean(user.avatarUrl) && !imageFailed;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`cut-xs flex h-7 w-7 flex-none items-center justify-center overflow-hidden text-[11px] font-extrabold leading-none ${
        isMe ? 'bg-w2w-red text-on-accent' : 'bg-ds-control text-ds-ink-soft'
      } ${showImage && isMe ? 'p-[2px]' : ''}`}
    >
      {showImage ? (
        <img
          src={resolveAssetUrl(user.avatarUrl as string)}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className={`h-full w-full object-cover ${isMe ? 'cut-xs' : ''}`}
        />
      ) : (
        initials(user.name)
      )}
    </span>
  );
}

/**
 * "Who's on the plan right now": a compact avatar stack (current user first, accented), a quiet
 * screen-reader announcement when someone joins or leaves, and — for admins — a warning when two or
 * more admins have the plan open. Renders only the (always-mounted) live region while you are alone.
 */
export default function PlanPresence({
  presence,
  currentUserId,
  isAdmin,
}: {
  presence: PresenceUser[];
  currentUserId: string | undefined;
  isAdmin: boolean;
}) {
  // Derive the announcement during render from the previous list (no effect, no extra render pass
  // beyond the state bump). The first snapshot, and the first one after a reconnect, are silent.
  const [tracked, setTracked] = useState<{ users: PresenceUser[]; message: string }>({ users: [], message: '' });
  if (idKey(tracked.users) !== idKey(presence)) {
    setTracked({ users: presence, message: describeChange(tracked.users, presence, currentUserId) });
  }

  const me = presence.find((u) => u.userId === currentUserId);
  const ordered = me ? [me, ...presence.filter((u) => u !== me)] : presence;
  const visible = ordered.length > MAX_AVATARS ? ordered.slice(0, MAX_AVATARS) : ordered;
  const rest = ordered.slice(visible.length);
  const adminCount = presence.filter((u) => u.isAdmin).length;
  const alone = presence.length < 2;

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {tracked.message}
      </span>
      {!alone && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div
            role="group"
            aria-label={`${presence.length} people viewing this plan`}
            className="flex items-center gap-1"
          >
            {visible.map((user) => (
              <Avatar key={user.userId} user={user} isMe={user.userId === currentUserId} />
            ))}
            {rest.length > 0 && (
              <span
                role="img"
                aria-label={`${rest.length} more: ${rest.map((u) => u.name).join(', ')}`}
                title={rest.map((u) => u.name).join(', ')}
                className="cut-xs num flex h-7 min-w-7 flex-none items-center justify-center bg-ds-control px-1.5 text-[11px] text-ds-ink-soft"
              >
                +{rest.length}
              </span>
            )}
          </div>
          {isAdmin && adminCount >= 2 && (
            <span className="chip chip-sm chip-warn" title={ADMIN_NOTE}>
              {adminCount} admins editing
              <span className="sr-only">. {ADMIN_NOTE}</span>
            </span>
          )}
        </div>
      )}
    </>
  );
}
