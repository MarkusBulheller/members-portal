import { Link, NavLink, useLocation } from 'react-router-dom';
import AccentPicker from './AccentPicker';
import NavIcon from './NavIcon';
import ThemeToggle from './ThemeToggle';
import {
  adminNavItems,
  badgeLabel,
  isNavItemActive,
  navGroups,
  type BadgeCounts,
  type NavItem,
} from './navConfig';
import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../lib/api';

function itemClasses(isActive: boolean): string {
  return `cut-xs flex items-center gap-3 min-h-10 px-3 font-semibold text-[15px] transition-colors ${
    isActive
      ? 'bg-ds-active text-ds-ink shadow-[inset_3px_0_0_var(--color-w2w-red)]'
      : 'text-ds-muted hover:bg-ds-hover hover:text-ds-ink'
  }`;
}

function GroupLabel({ children }: { children: string }) {
  return <p className="px-3 pt-4 pb-1.5 text-xs font-semibold text-ds-dim">{children}</p>;
}

/** The desktop (md and up) sidebar. Below md the shell shows MobileNav (top bar + bottom tab bar)
 * instead, so this is simply hidden there. Both read the same nav config, badge counts and avatar
 * from the shell. */
export default function NavSidebar({
  badgeCounts,
  ownAvatarUrl,
}: {
  badgeCounts: BadgeCounts;
  ownAvatarUrl: string | null;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();

  function renderItem(item: NavItem) {
    const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
    // The member-facing badge (open signups) is the accent colour because it asks for action;
    // admin queue counts stay neutral so they don't compete with it.
    const badgeClass =
      item.badgeKey === 'openSignups' ? 'bg-w2w-red text-on-accent' : 'bg-ds-badge text-ds-ink';
    const content = (isActive: boolean) => (
      <>
        <NavIcon name={item.icon} className={`h-[18px] w-[18px] ${isActive ? 'text-w2w-red-ink' : ''}`} />
        <span className="flex-1">{item.label}</span>
        {count > 0 && item.badgeKey && (
          <span
            className={`slant italic min-w-6 h-[18px] px-[7px] box-border text-[11px] font-extrabold flex items-center justify-center ${badgeClass}`}
          >
            {count}
            <span className="sr-only"> {badgeLabel(item.badgeKey)}</span>
          </span>
        )}
      </>
    );

    if (item.activePrefix) {
      const isActive = isNavItemActive(item, location.pathname);
      return (
        <Link key={item.to} to={item.to} aria-current={isActive ? 'page' : undefined} className={itemClasses(isActive)}>
          {content(isActive)}
        </Link>
      );
    }
    return (
      <NavLink key={item.to} to={item.to} className={({ isActive }) => itemClasses(isActive)}>
        {({ isActive }) => content(isActive)}
      </NavLink>
    );
  }

  const displayName = user?.discordGlobalName ?? user?.discordUsername;

  return (
    <aside
      id="member-sidebar"
      className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col bg-ds-sidebar border-r border-ds-edge box-border px-3 py-[22px] md:flex"
    >
      <Link to="/dashboard" className="shrink-0 flex items-center gap-2.5 px-3 pb-5 text-ds-ink">
        <span className="font-logo font-black text-[22px] tracking-[0.14em]">
          W<span className="text-w2w-red">2</span>W
        </span>
        <span className="slant px-[9px] py-0.5 bg-ds-tag text-ds-muted font-bold text-[10px] uppercase">Members</span>
      </Link>

      <nav aria-label="Main" className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5">
        {navGroups.map((group) => (
          <div key={group.label ?? 'top'} className="flex flex-col gap-0.5">
            {group.label && <GroupLabel>{group.label}</GroupLabel>}
            {group.items.map(renderItem)}
          </div>
        ))}
        {user?.role === 'ADMIN' && (
          <div className="flex flex-col gap-0.5">
            <GroupLabel>Admin</GroupLabel>
            {adminNavItems.map(renderItem)}
          </div>
        )}
      </nav>

      <div className="shrink-0 pt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <ThemeToggle />
          <AccentPicker />
        </div>
        <div className="cut-sm flex items-center gap-2.5 p-2.5 bg-ds-raised">
          <Link to="/drivers/me/edit" className="flex items-center gap-2.5 flex-1 min-w-0 group text-ds-ink">
            {ownAvatarUrl || user?.discordAvatarUrl ? (
              <img
                src={ownAvatarUrl ? resolveAssetUrl(ownAvatarUrl) : user!.discordAvatarUrl!}
                alt=""
                className="cut-xs h-9 w-9 object-cover shrink-0"
              />
            ) : (
              <div className="cut-xs h-9 w-9 bg-w2w-red text-on-accent flex items-center justify-center italic font-black text-sm shrink-0">
                {user?.discordUsername.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold truncate">{displayName}</span>
              <span className="text-xs text-ds-muted group-hover:text-ds-ink truncate">
                {user?.role === 'ADMIN' ? 'Admin · ' : ''}Edit profile
              </span>
            </span>
          </Link>
          <button
            onClick={() => void logout()}
            aria-label="Log out"
            title="Log out"
            className="cut-xs h-9 w-9 shrink-0 flex items-center justify-center text-ds-muted hover:text-ds-ink hover:bg-ds-active transition-colors"
          >
            <NavIcon name="logout" />
          </button>
        </div>
      </div>
    </aside>
  );
}
