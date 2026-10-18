import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ChunkErrorBoundary from '../components/ChunkErrorBoundary';
import MobileNav from '../components/MobileNav';
import NavSidebar from '../components/NavSidebar';
import RouteFallback from '../components/RouteFallback';
import { useAuth } from '../context/AuthContext';
import { GlobalSearchProvider } from '../context/GlobalSearchContext';
import { useNavData } from '../lib/useNavData';

/** 260px sidebar + main column from md up. Main pads clamp(16px, 3vw, 44px) and holds a centred
 * 1200px column that pages fill with their own content (no page-level padding or min-height).
 * Below md the sidebar is replaced by MobileNav: a fixed top bar (wordmark, search, profile) and a
 * bottom tab bar, so main clears both. Global search (Ctrl/Cmd+K) lives here so every page and
 * both navs can open it. */
export default function DashboardShell() {
  const { user } = useAuth();
  const navData = useNavData(user);
  const { pathname } = useLocation();

  return (
    <GlobalSearchProvider>
      <div className="min-h-screen bg-ds-page text-ds-ink">
        <NavSidebar {...navData} />
        <MobileNav {...navData} />
        <main className="md:ml-[260px] min-h-screen box-border pt-20 md:pt-7 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-16 px-[clamp(16px,3vw,44px)]">
          <div className="max-w-[1200px] mx-auto">
            <ChunkErrorBoundary resetKey={pathname}>
              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </main>
      </div>
    </GlobalSearchProvider>
  );
}
