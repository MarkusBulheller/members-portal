import { Outlet } from 'react-router-dom';
import NavSidebar from '../components/NavSidebar';

export default function DashboardShell() {
  return (
    <div className="min-h-screen bg-w2w-black">
      <NavSidebar />
      <main className="ml-60 min-h-screen">
        <div className="max-w-6xl mx-auto px-8 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
