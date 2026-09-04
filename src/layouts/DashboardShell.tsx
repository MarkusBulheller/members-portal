import { Outlet } from 'react-router-dom';
import NavSidebar from '../components/NavSidebar';

export default function DashboardShell() {
  return (
    <div className="min-h-screen bg-w2w-black">
      <NavSidebar />
      <main className="md:ml-60 min-h-screen pt-14 md:pt-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
