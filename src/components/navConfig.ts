import type { NavIconName } from './NavIcon';

export type BadgeKey = 'openSignups' | 'pendingMembers' | 'unreviewedInquiries';

export interface NavItem {
  label: string;
  to: string;
  icon: NavIconName;
  badgeKey?: BadgeKey;
  /** Path prefix that should also light this item up (e.g. every /admin/settings/* tab). */
  activePrefix?: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** Grouped by what members are doing rather than one flat list — racing (things with dates),
 * team (people and machinery) and library (reference data synced from iRacing). Shared by the
 * desktop sidebar and the mobile "More" sheet so the two can never drift apart. */
export const navGroups: NavGroup[] = [
  { label: null, items: [{ label: 'Dashboard', to: '/dashboard', icon: 'dashboard' }] },
  {
    label: 'Racing',
    items: [
      { label: 'Events', to: '/events', icon: 'events', badgeKey: 'openSignups' },
      { label: 'Results', to: '/results', icon: 'results' },
      { label: 'Recap', to: '/recap', icon: 'recap' },
    ],
  },
  {
    label: 'Team',
    items: [
      { label: 'Drivers', to: '/drivers', icon: 'drivers' },
      { label: 'Cars', to: '/cars', icon: 'cars' },
    ],
  },
  {
    label: 'Library',
    items: [
      { label: 'Tracks', to: '/tracks', icon: 'tracks' },
      { label: 'Series', to: '/series', icon: 'series' },
    ],
  },
];

export const adminNavItems: NavItem[] = [
  { label: 'Members', to: '/admin/members', icon: 'members', badgeKey: 'pendingMembers' },
  { label: 'Inquiries', to: '/admin/contact-inquiries', icon: 'inquiries', badgeKey: 'unreviewedInquiries' },
  { label: 'Settings', to: '/admin/settings/achievements', icon: 'settings', activePrefix: '/admin/settings' },
];

export type BadgeCounts = Record<BadgeKey, number>;

export const EMPTY_BADGE_COUNTS: BadgeCounts = { openSignups: 0, pendingMembers: 0, unreviewedInquiries: 0 };

/** The four destinations pinned to the mobile tab bar (the fifth tab is "More"). */
export const MOBILE_TAB_PATHS = ['/dashboard', '/events', '/drivers', '/results'] as const;

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.activePrefix) return pathname.startsWith(item.activePrefix);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** Everything the mobile tab bar doesn't show directly, keeping the sidebar's grouping. Admin items
 * are appended as their own "Admin" group only for admins. */
export function overflowNavGroups(isAdmin: boolean): NavGroup[] {
  const pinned: readonly string[] = MOBILE_TAB_PATHS;
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !pinned.includes(item.to)) }))
    .filter((group) => group.items.length > 0);
  if (isAdmin) groups.push({ label: 'Admin', items: adminNavItems });
  return groups;
}

export function badgeLabel(key: BadgeKey): string {
  return key === 'openSignups' ? 'open signups' : 'waiting';
}
