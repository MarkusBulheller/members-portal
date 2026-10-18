import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter, Routes, useLocation } from 'react-router-dom';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import RouteFallback from './components/RouteFallback';
import { AccentProvider } from './context/AccentContext';
import { AuthProvider } from './context/AuthContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { ThemeProvider } from './context/ThemeContext';
import DashboardShell from './layouts/DashboardShell';
import RequireAdmin from './routing/RequireAdmin';
import RequireAuth from './routing/RequireAuth';

// Every page is its own chunk; the shell, providers and route guards stay in the entry chunk.
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const NotInServerPage = lazy(() => import('./pages/auth/NotInServerPage'));
const PendingApprovalPage = lazy(() => import('./pages/auth/PendingApprovalPage'));
const ContactInquiriesAdminPage = lazy(() => import('./pages/admin/ContactInquiriesAdminPage'));
const MembersQueuePage = lazy(() => import('./pages/admin/MembersQueuePage'));
const SettingsAdminPage = lazy(() => import('./pages/admin/SettingsAdminPage'));
const CarDetailPage = lazy(() => import('./pages/cars/CarDetailPage'));
const CarFormPage = lazy(() => import('./pages/cars/CarFormPage'));
const CarsListPage = lazy(() => import('./pages/cars/CarsListPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const AdminEditMemberSettingsPage = lazy(() => import('./pages/drivers/AdminEditMemberSettingsPage'));
const DriverDetailPage = lazy(() => import('./pages/drivers/DriverDetailPage'));
const DriverFormPage = lazy(() => import('./pages/drivers/DriverFormPage'));
const DriversListPage = lazy(() => import('./pages/drivers/DriversListPage'));
const EditMyProfilePage = lazy(() => import('./pages/drivers/EditMyProfilePage'));
const EventDetailPage = lazy(() => import('./pages/events/EventDetailPage'));
const EventFormPage = lazy(() => import('./pages/events/EventFormPage'));
const EventsListPage = lazy(() => import('./pages/events/EventsListPage'));
const EventTeamBuildingPage = lazy(() => import('./pages/events/EventTeamBuildingPage'));
const EventTeamPlanPage = lazy(() => import('./pages/events/EventTeamPlanPage'));
const IracingOAuthCallbackPage = lazy(() => import('./pages/iracing/IracingOAuthCallbackPage'));
const RaceResultDetailPage = lazy(() => import('./pages/results/RaceResultDetailPage'));
const RaceResultFormPage = lazy(() => import('./pages/results/RaceResultFormPage'));
const RaceResultsListPage = lazy(() => import('./pages/results/RaceResultsListPage'));
const SharedRaceResultPage = lazy(() => import('./pages/results/SharedRaceResultPage'));
const SeriesDetailPage = lazy(() => import('./pages/series/SeriesDetailPage'));
const SeriesListPage = lazy(() => import('./pages/series/SeriesListPage'));
const TrackDetailPage = lazy(() => import('./pages/tracks/TrackDetailPage'));
const TrackFormPage = lazy(() => import('./pages/tracks/TrackFormPage'));
const TracksListPage = lazy(() => import('./pages/tracks/TracksListPage'));

/** Public routes (login, shared results, ...) and the shell's own routes sit under this one
 * boundary + Suspense; the shell adds a second pair around its <Outlet> so it stays mounted. */
function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <ChunkErrorBoundary resetKey={pathname} className="min-h-screen">
      <Suspense fallback={<RouteFallback className="min-h-screen" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pending-approval" element={<PendingApprovalPage />} />
          <Route path="/not-in-server" element={<NotInServerPage />} />
          <Route path="/api/auth/callback/iracing" element={<IracingOAuthCallbackPage />} />
          <Route path="/share/results/:token" element={<SharedRaceResultPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<DashboardShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />

              <Route path="/drivers" element={<DriversListPage />} />
              <Route path="/drivers/me/edit" element={<EditMyProfilePage />} />
              <Route path="/drivers/:id" element={<DriverDetailPage />} />

              <Route path="/events" element={<EventsListPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/events/:id/teams/:teamId/plan" element={<EventTeamPlanPage />} />

              <Route path="/cars" element={<CarsListPage />} />
              <Route path="/cars/:id" element={<CarDetailPage />} />

              <Route path="/tracks" element={<TracksListPage />} />
              <Route path="/tracks/:id" element={<TrackDetailPage />} />

              <Route path="/series" element={<SeriesListPage />} />
              <Route path="/series/:seasonId" element={<SeriesDetailPage />} />

              <Route path="/results" element={<RaceResultsListPage />} />
              <Route path="/results/:id" element={<RaceResultDetailPage />} />

              <Route element={<RequireAdmin />}>
                <Route path="/events/new" element={<EventFormPage />} />
                <Route path="/events/:id/edit" element={<EventFormPage />} />
                <Route path="/events/:id/teams" element={<EventTeamBuildingPage />} />
                <Route path="/cars/new" element={<CarFormPage />} />
                <Route path="/cars/:id/edit" element={<CarFormPage />} />
                <Route path="/tracks/new" element={<TrackFormPage />} />
                <Route path="/tracks/:id/edit" element={<TrackFormPage />} />
                <Route path="/drivers/new" element={<DriverFormPage />} />
                <Route path="/drivers/:id/edit" element={<DriverFormPage />} />
                <Route path="/drivers/:id/edit-settings" element={<AdminEditMemberSettingsPage />} />
                <Route path="/results/new" element={<RaceResultFormPage />} />
                <Route path="/admin/members" element={<MembersQueuePage />} />
                <Route path="/admin/contact-inquiries" element={<ContactInquiriesAdminPage />} />
                <Route path="/admin/settings/:tab" element={<SettingsAdminPage />} />
                <Route path="/admin/achievements" element={<Navigate to="/admin/settings/achievements" replace />} />
                <Route path="/admin/iracing-teams" element={<Navigate to="/admin/settings/iracing-teams" replace />} />
                <Route path="/admin/team-highlights" element={<Navigate to="/admin/settings/team-highlights" replace />} />
                <Route path="/admin/discord-bot" element={<Navigate to="/admin/settings/discord-bot" replace />} />
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AccentProvider>
        <BrowserRouter>
          <AuthProvider>
            <ConfirmProvider>
              <AppRoutes />
            </ConfirmProvider>
          </AuthProvider>
        </BrowserRouter>
      </AccentProvider>
    </ThemeProvider>
  );
}

export default App;
