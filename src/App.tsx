import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AccentProvider } from './context/AccentContext';
import { AuthProvider } from './context/AuthContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { ThemeProvider } from './context/ThemeContext';
import DashboardShell from './layouts/DashboardShell';
import LoginPage from './pages/auth/LoginPage';
import NotInServerPage from './pages/auth/NotInServerPage';
import PendingApprovalPage from './pages/auth/PendingApprovalPage';
import ContactInquiriesAdminPage from './pages/admin/ContactInquiriesAdminPage';
import MembersQueuePage from './pages/admin/MembersQueuePage';
import SettingsAdminPage from './pages/admin/SettingsAdminPage';
import CarDetailPage from './pages/cars/CarDetailPage';
import CarFormPage from './pages/cars/CarFormPage';
import CarsListPage from './pages/cars/CarsListPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import AdminEditMemberSettingsPage from './pages/drivers/AdminEditMemberSettingsPage';
import DriverDetailPage from './pages/drivers/DriverDetailPage';
import DriverFormPage from './pages/drivers/DriverFormPage';
import DriversListPage from './pages/drivers/DriversListPage';
import EditMyProfilePage from './pages/drivers/EditMyProfilePage';
import EventDetailPage from './pages/events/EventDetailPage';
import EventFormPage from './pages/events/EventFormPage';
import EventsListPage from './pages/events/EventsListPage';
import EventTeamBuildingPage from './pages/events/EventTeamBuildingPage';
import EventTeamPlanPage from './pages/events/EventTeamPlanPage';
import IracingOAuthCallbackPage from './pages/iracing/IracingOAuthCallbackPage';
import RaceResultDetailPage from './pages/results/RaceResultDetailPage';
import RaceResultFormPage from './pages/results/RaceResultFormPage';
import RaceResultsListPage from './pages/results/RaceResultsListPage';
import SharedRaceResultPage from './pages/results/SharedRaceResultPage';
import SeriesDetailPage from './pages/series/SeriesDetailPage';
import SeriesListPage from './pages/series/SeriesListPage';
import TrackDetailPage from './pages/tracks/TrackDetailPage';
import TrackFormPage from './pages/tracks/TrackFormPage';
import TracksListPage from './pages/tracks/TracksListPage';
import RequireAdmin from './routing/RequireAdmin';
import RequireAuth from './routing/RequireAuth';

function App() {
  return (
    <ThemeProvider>
      <AccentProvider>
      <BrowserRouter>
        <AuthProvider>
          <ConfirmProvider>
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
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
      </AccentProvider>
    </ThemeProvider>
  );
}

export default App;
