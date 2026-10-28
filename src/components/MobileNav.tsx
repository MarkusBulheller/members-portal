import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import AccentPicker from './AccentPicker';
import NavIcon, { type NavIconName } from './NavIcon';
import ThemeToggle from './ThemeToggle';
import {
  badgeLabel,
  isNavItemActive,
  overflowNavGroups,
  type BadgeCounts,
  type NavItem,
} from './navConfig';
import { useAuth } from '../context/AuthContext';
import { useGlobalSearch } from '../context/GlobalSearchContext';
import { resolveAssetUrl } from '../lib/api';
import { useDialogA11y } from '../lib/useDialogA11y';

interface Props {
  badgeCounts: BadgeCounts;
  ownAvatarUrl: string | null;
}

/** The four pinned tabs; the fifth, "More", opens the sheet with everything else. */
const TABS: { label: string; to: string; icon: NavIconName; badge?: boolean }[] = [
  { label: 'Home', to: '/dashboard', icon: 'dashboard' },
  { label: 'Events', to: '/events', icon: 'events', badge: true },
  { label: 'Drivers', to: '/drivers', icon: 'drivers' },
  { label: 'Results', to: '/results', icon: 'results' },
];

/** The profile pages live under /drivers but belong to the More sheet, not the Drivers tab. */
const PROFILE_PATH = '/drivers/me';

function isProfilePath(pathname: string): boolean {
  return pathname === PROFILE_PATH || pathname.startsWith(`${PROFILE_PATH}/`);
}

function UserAvatar({ ownAvatarUrl, className }: { ownAvatarUrl: string | null; className: string }) {
  const { user } = useAuth();
  if (ownAvatarUrl || user?.discordAvatarUrl) {
    return (
      <img
        src={ownAvatarUrl ? resolveAssetUrl(ownAvatarUrl) : user!.discordAvatarUrl!}
        alt=""
        className={`cut-xs object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`cut-xs flex items-center justify-center bg-w2w-red text-on-accent italic font-black ${className}`}
    >
      {user?.discordUsername.slice(0, 2).toUpperCase()}
    </span>
  );
}

function CountBadge({ count, srLabel, hot }: { count: number; srLabel: string; hot: boolean }) {
  return (
    <span
      className={`slant box-border flex h-[15px] min-w-5 items-center justify-center px-1.5 text-[10px] font-extrabold italic leading-none ${
        hot ? 'bg-w2w-red text-on-accent' : 'bg-ds-badge text-ds-ink'
      }`}
    >
      {count}
      <span className="sr-only"> {srLabel}</span>
    </span>
  );
}

/** Mobile top bar (wordmark, search, profile) — shown below md only. */
function MobileHeader({ ownAvatarUrl }: { ownAvatarUrl: string | null }) {
  const { openSearch } = useGlobalSearch();
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between bg-ds-page px-4 md:hidden">
      <Link
        to="/dashboard"
        aria-label="W2W home"
        className="font-logo text-xl font-black tracking-[0.14em] text-ds-ink"
      >
        W<span className="text-w2w-red">2</span>W
      </Link>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search"
          aria-haspopup="dialog"
          className="cut-xs flex h-11 w-11 items-center justify-center bg-ds-panel text-ds-ink transition-colors hover:bg-ds-control-hover"
        >
          <NavIcon name="search" className="h-[19px] w-[19px]" />
        </button>
        <Link to="/drivers/me/edit" aria-label="My profile" className="block h-11 w-11">
          <UserAvatar ownAvatarUrl={ownAvatarUrl} className="h-11 w-11 text-[15px]" />
        </Link>
      </div>
    </header>
  );
}

function MoreIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect x="3.5" y="10.5" width="3" height="3" fill="currentColor" />
      <rect x="10.5" y="10.5" width="3" height="3" fill="currentColor" />
      <rect x="17.5" y="10.5" width="3" height="3" fill="currentColor" />
    </svg>
  );
}

function MoreSheet({
  badgeCounts,
  ownAvatarUrl,
  onClose,
}: Props & { onClose: () => void }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogA11y(sheetRef, onClose);

  // Don't let the page scroll behind the sheet.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const groups = overflowNavGroups(user?.role === 'ADMIN');
  const displayName = user?.discordGlobalName ?? user?.discordUsername;

  function renderItem(item: NavItem) {
    const active = isNavItemActive(item, location.pathname);
    const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? 'page' : undefined}
        className={`cut-xs flex min-h-12 items-center gap-3 px-3 text-[15px] font-semibold transition-colors ${
          active
            ? 'bg-ds-active text-ds-ink shadow-[inset_3px_0_0_var(--color-w2w-red)]'
            : 'text-ds-ink-soft hover:bg-ds-hover'
        }`}
      >
        <NavIcon name={item.icon} className={`h-5 w-5 ${active ? 'text-w2w-red-ink' : 'text-ds-muted'}`} />
        <span className="flex-1">{item.label}</span>
        {count > 0 && item.badgeKey && (
          <CountBadge count={count} srLabel={badgeLabel(item.badgeKey)} hot={item.badgeKey === 'openSignups'} />
        )}
      </Link>
    );
  }

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-sheet-title"
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col bg-ds-sidebar text-ds-ink [clip-path:polygon(14px_0,100%_0,100%_100%,0_100%,0_14px)]"
      >
        <div className="flex flex-none items-center justify-between px-4 pb-2 pt-4">
          <h2 id="more-sheet-title" className="h2">
            More
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="cut-xs flex h-11 w-11 items-center justify-center text-ds-muted transition-colors hover:bg-ds-raised hover:text-ds-ink"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="square"
              aria-hidden="true"
            >
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          <nav aria-label="More" className="flex flex-col gap-0.5">
            {groups.map((group) => (
              <div key={group.label ?? 'rest'} className="flex flex-col gap-0.5">
                {group.label && <p className="m-0 px-3 pb-1.5 pt-3 text-xs font-semibold text-ds-dim">{group.label}</p>}
                {group.items.map(renderItem)}
              </div>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-3 border-t border-ds-line pt-4">
            <div className="cut-sm flex items-center gap-2.5 bg-ds-raised p-2.5">
              <Link to="/drivers/me/edit" className="flex min-w-0 flex-1 items-center gap-2.5 text-ds-ink">
                <UserAvatar ownAvatarUrl={ownAvatarUrl} className="h-10 w-10 shrink-0 text-sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-semibold">{displayName}</span>
                  <span className="truncate text-xs text-ds-muted">
                    {user?.role === 'ADMIN' ? 'Admin · ' : ''}Edit profile
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Log out"
                title="Log out"
                className="cut-xs flex h-11 w-11 shrink-0 items-center justify-center text-ds-muted transition-colors hover:bg-ds-active hover:text-ds-ink"
              >
                <NavIcon name="logout" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
              <ThemeToggle />
              <AccentPicker />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Everything the shell shows below md: the top bar, the bottom tab bar (Home / Events / Drivers /
 * Results / More) and the "More" sheet. The sidebar takes over from md up. */
export default function MobileNav({ badgeCounts, ownAvatarUrl }: Props) {
  const { user } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // Any navigation (a link in the sheet, a search result, the back button) closes the sheet.
  // Adjusting state during render (instead of in an effect) avoids an extra render pass.
  const [sheetPath, setSheetPath] = useState(location.pathname);
  if (sheetPath !== location.pathname) {
    setSheetPath(location.pathname);
    setMoreOpen(false);
  }

  const profile = isProfilePath(location.pathname);
  const moreActive =
    moreOpen ||
    profile ||
    overflowNavGroups(user?.role === 'ADMIN').some((group) =>
      group.items.some((item) => isNavItemActive(item, location.pathname)),
    );

  const tabClass = (active: boolean) =>
    `relative flex min-h-[58px] flex-col items-center justify-center gap-[3px] text-xs transition-colors ${
      active
        ? 'font-bold text-ds-ink shadow-[inset_0_3px_0_var(--color-w2w-red)]'
        : 'font-semibold text-ds-muted hover:text-ds-ink'
    }`;

  return (
    <div className="md:hidden print:hidden">
      <MobileHeader ownAvatarUrl={ownAvatarUrl} />

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ds-line bg-ds-sidebar px-1.5 pb-[max(8px,env(safe-area-inset-bottom))]"
      >
        {TABS.map((tab) => {
          const count = tab.badge ? badgeCounts.openSignups : 0;
          const forceInactive = tab.to === '/drivers' && profile;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => tabClass(isActive && !forceInactive)}
            >
              {({ isActive }) => {
                const active = isActive && !forceInactive;
                return (
                  <>
                    <NavIcon name={tab.icon} className={`h-[22px] w-[22px] ${active ? 'text-w2w-red-ink' : ''}`} />
                    {tab.label}
                    {count > 0 && (
                      <span className="absolute left-[calc(50%+6px)] top-1.5">
                        <CountBadge count={count} srLabel="open signups" hot />
                      </span>
                    )}
                  </>
                );
              }}
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`border-0 bg-transparent ${tabClass(moreActive)}`}
        >
          <MoreIcon className={moreActive ? 'text-w2w-red-ink' : ''} />
          More
        </button>
      </nav>

      {moreOpen && <MoreSheet badgeCounts={badgeCounts} ownAvatarUrl={ownAvatarUrl} onClose={() => setMoreOpen(false)} />}
    </div>
  );
}
