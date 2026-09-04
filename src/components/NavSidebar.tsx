import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import AccentPicker from './AccentPicker';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../lib/api';
import { adminApi } from '../lib/api/admin';
import { contactInquiriesApi } from '../lib/api/contactInquiries';
import { driversApi } from '../lib/api/drivers';

const links = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Drivers', to: '/drivers' },
  { label: 'Events', to: '/events' },
  { label: 'Cars', to: '/cars' },
  { label: 'Tracks', to: '/tracks' },
  { label: 'Series', to: '/series' },
  { label: 'Results', to: '/results' },
];

const adminLinks = [
  { label: 'Members', to: '/admin/members', badgeKey: 'pendingMembers' as const },
  { label: 'Contact Inquiries', to: '/admin/contact-inquiries', badgeKey: 'unreviewedInquiries' as const },
  { label: 'Settings', to: '/admin/settings/achievements', activePrefix: '/admin/settings' },
];

const BADGE_POLL_INTERVAL_MS = 60_000;

function linkClasses(isActive: boolean): string {
  return `block px-4 py-2.5 font-heading text-sm tracking-wide uppercase transition-colors ${
    isActive
      ? 'bg-w2w-red/15 text-w2w-red border-l-2 border-w2w-red'
      : 'text-white/60 border-l-2 border-transparent hover:text-white hover:bg-white/5'
  }`;
}

export default function NavSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<{ pendingMembers: number; unreviewedInquiries: number }>({
    pendingMembers: 0,
    unreviewedInquiries: 0,
  });
  const [ownAvatarUrl, setOwnAvatarUrl] = useState<string | null>(null);

  // Closing on every route change covers both an in-sidebar link click and any other in-app
  // navigation (e.g. a "Back to results" link on a detail page) — simpler than wiring onClick
  // onto every single nav link individually, and harmless on desktop where the drawer is always
  // visible regardless of `open`.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    void driversApi.getOwn().then((profile) => setOwnAvatarUrl(profile.avatarUrl));
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;

    let cancelled = false;
    async function loadCounts() {
      const [pending, inquiries] = await Promise.all([
        adminApi.listMembers('PENDING'),
        contactInquiriesApi.list(),
      ]);
      if (cancelled) return;
      setBadgeCounts({
        pendingMembers: pending.length,
        unreviewedInquiries: inquiries.filter((inquiry) => !inquiry.reviewed).length,
      });
    }

    void loadCounts();
    const interval = setInterval(() => void loadCounts(), BADGE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.role]);

  return (
    <>
      {/* Mobile-only top bar — the sidebar itself becomes a slide-in drawer below md, so this is
          the only persistently-visible chrome (logo + toggle) at that width. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-w2w-black-soft border-b border-white/10 flex items-center justify-between px-4">
        <span className="font-display font-black text-lg tracking-widest text-w2w-white">
          W<span className="text-w2w-red">2</span>W
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-col gap-1.5 p-2"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="member-sidebar"
        >
          <span className={`h-[3px] w-6 rounded-full bg-white transition-transform ${open ? 'rotate-45 translate-y-[7px]' : ''}`} />
          <span className={`h-[3px] w-6 rounded-full bg-white transition-opacity ${open ? 'opacity-0' : ''}`} />
          <span className={`h-[3px] w-6 rounded-full bg-white transition-transform ${open ? '-rotate-45 -translate-y-[7px]' : ''}`} />
        </button>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="member-sidebar"
        className={`fixed inset-y-0 left-0 w-60 bg-w2w-black-soft border-r border-white/10 flex flex-col z-50 transition-transform duration-200 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      <div className="h-20 flex items-center px-6 border-b border-white/10">
        <span className="font-display font-black text-xl tracking-widest text-w2w-white">
          W<span className="text-w2w-red">2</span>W
        </span>
        <span className="ml-2 font-heading text-[10px] tracking-[0.3em] text-white/65 uppercase">
          Members
        </span>
      </div>

      <nav className="flex-1 py-6 space-y-1">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => linkClasses(isActive)}>
            {link.label}
          </NavLink>
        ))}

        {user?.role === 'ADMIN' && (
          <>
            <p className="px-4 pt-6 pb-2 font-heading text-[10px] tracking-[0.3em] text-white/65 uppercase">
              Admin
            </p>
            {adminLinks.map((link) => {
              const count = link.badgeKey ? badgeCounts[link.badgeKey] : 0;
              const isActive = location.pathname.startsWith(link.activePrefix ?? link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`${linkClasses(isActive)} flex items-center justify-between`}
                >
                  <span>{link.label}</span>
                  {count > 0 && (
                    <span className="ml-2 min-w-[1.25rem] px-1.5 py-0.5 rounded-full bg-w2w-red text-white text-[10px] font-heading text-center leading-none">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase">Theme</span>
          <ThemeToggle />
        </div>
        <div className="px-2 mb-3">
          <span className="block font-heading text-[10px] tracking-[0.2em] text-white/65 uppercase mb-1.5">
            Accent
          </span>
          <AccentPicker />
        </div>
        <Link to="/drivers/me/edit" className="flex items-center gap-3 px-2 mb-3 group">
          {ownAvatarUrl || user?.discordAvatarUrl ? (
            <img
              src={ownAvatarUrl ? resolveAssetUrl(ownAvatarUrl) : user!.discordAvatarUrl!}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-w2w-charcoal-light flex items-center justify-center font-heading text-xs text-white/60">
              {user?.discordUsername.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="text-sm text-white/70 group-hover:text-white truncate">
            {user?.discordGlobalName ?? user?.discordUsername}
          </span>
        </Link>
        <button
          onClick={() => void logout()}
          className="w-full text-left px-2 py-2 font-heading text-xs tracking-wide uppercase text-white/65 hover:text-w2w-red transition-colors"
        >
          Log out
        </button>
      </div>
      </aside>
    </>
  );
}
