import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { useSSE } from './hooks/useSSE';
import { useStudioState } from './context/StudioState';
import MobileBottomNav from './components/MobileBottomNav';
import StudioTicker from './components/StudioTicker';
import StudioPulseWidget from './components/StudioPulseWidget';
import ArtistStatusToggle from './components/ArtistStatusToggle';
import { StudioStateProvider } from './context/StudioState';
import CommandPalette from './components/CommandPalette';
import SessionLiveBar from './components/SessionLiveBar';
import ErrorBoundary from './components/ErrorBoundary';
import FeedbackWidget from './components/FeedbackWidget';
import './styles/artist-experience.css';

const EnterPage = lazy(() => import('./pages/EnterPage'));
const OnboardingSequencePage = lazy(() => import('./pages/OnboardingSequencePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const PulseDashboard = lazy(() => import('./pages/PulseDashboard'));
const EngineerDashboardPage = lazy(() => import('./pages/EngineerDashboardPage'));
const RunsheetPage = lazy(() => import('./pages/RunsheetPage'));
const ProducerDashboardPage = lazy(() => import('./pages/ProducerDashboardPage'));
const ProducerPassportPage = lazy(() => import('./pages/ProducerPassportPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const ArtistProfilePage = lazy(() => import('./pages/ArtistProfilePage'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const BookingDetailPage = lazy(() => import('./pages/BookingDetailPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const PassportPage = lazy(() => import('./pages/PassportPage'));
const PublicPassportPage = lazy(() => import('./pages/PublicPassportPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const ProducerDiscoverPage = lazy(() => import('./pages/ProducerDiscoverPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ConnectPage = lazy(() => import('./pages/ConnectPage'));
const ArtistProjectsPage = lazy(() => import('./pages/ArtistProjectsPage'));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'));
const MaintenanceStudiosPage = lazy(() => import('./pages/MaintenanceStudiosPage'));
const MaintenanceCreatorsPage = lazy(() => import('./pages/MaintenanceCreatorsPage'));
const MaintenanceBookingsPage = lazy(() => import('./pages/MaintenanceBookingsPage'));
const MaintenanceFinancePage = lazy(() => import('./pages/MaintenanceFinancePage'));
const MaintenanceHealthPage = lazy(() => import('./pages/MaintenanceHealthPage'));
const MaintenanceAuditPage = lazy(() => import('./pages/MaintenanceAuditPage'));
const MaintenanceGrowthPage = lazy(() => import('./pages/MaintenanceGrowthPage'));
const MaintenanceOperatorsPage = lazy(() => import('./pages/MaintenanceOperatorsPage'));
const StudioPassportPage = lazy(() => import('./pages/StudioPassportPage'));
const WorkroomsPage = lazy(() => import('./pages/WorkroomsPage'));

function RequireAuth({ children, role, roles }: { children: JSX.Element; role?: string; roles?: string[] }) {
  const { token, user } = useAuthStore();
  const { pathname, search } = useLocation();
  if (!token) return <Navigate to={`/enter?next=${encodeURIComponent(pathname + search)}`} replace />;
  if (role && user?.role !== role) return <Navigate to="/dashboard" replace />;
  if (roles && !roles.includes(user?.role ?? '')) return <Navigate to="/dashboard" replace />;
  return children;
}

function SmartDashboard() {
  const { user } = useAuthStore();
  if (user?.role === 'STUDIO_ADMIN') return <AdminDashboardPage />;
  if (user?.role === 'ENGINEER') return <EngineerDashboardPage />;
  if (user?.role === 'PRODUCER') return <ProducerDashboardPage />;
  if (user?.role === 'OIANO_ADMIN') return <MaintenancePage />;
  return <DashboardPage />;
}

function SSEProvider() {
  useSSE();
  return null;
}

// The onboarding sequence (Screens 1-5) must read as "no navigation chrome
// visible" per the wireframe spec — hide the app's persistent widgets/nav
// while on those routes instead of threading a flag through each of them.
const CHROME_FREE_ROUTES = ['/enter', '/onboarding'];
function Chrome() {
  const { pathname } = useLocation();
  const { user } = useAuthStore();
  if (CHROME_FREE_ROUTES.includes(pathname) || pathname.startsWith('/p/')) return null;
  const artistDashboard = pathname === '/dashboard' && user?.role === 'ARTIST';
  return (
    <>
      {!artistDashboard && <StudioTicker />}
      {!artistDashboard && <SessionLiveBar />}
      {!artistDashboard && <StudioPulseWidget />}
      {!artistDashboard && <ArtistStatusToggle />}
      <MobileBottomNav />
      <CommandPalette />
    </>
  );
}

// ── Route transition wrapper ──────────────────────────────────────────────────
// Each pathname change swaps the key, triggering the page-enter CSS animation
function AnimatedRoutes() {
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user);
  const routeClass = pathname === '/dashboard' ? 'artist-route-home'
    : pathname.startsWith('/projects') ? 'artist-route-projects'
    : pathname.startsWith('/book') ? 'artist-route-booking'
      : pathname.includes('passport') ? 'artist-route-passport'
        : pathname.startsWith('/discover') || pathname.startsWith('/producers') ? 'artist-route-discover'
          : pathname.startsWith('/calendar') ? 'artist-route-calendar'
            : pathname.startsWith('/notifications') ? 'artist-route-inbox'
              : pathname.startsWith('/workrooms') ? 'artist-route-inbox'
              : 'artist-route-default';
  return (
    <div key={pathname} className={`page-enter ${user?.role === 'ARTIST' ? `artist-experience ${routeClass}` : ''}`} style={{ minHeight: '100%' }}>
      <Suspense fallback={<div className="min-h-screen grid place-items-center text-zinc-500"><div className="text-center"><div className="mx-auto mb-4 h-8 w-8 rounded-full border border-dome/20 border-t-dome animate-spin" /><p className="text-xs font-mono tracking-widest uppercase">Opening your space</p></div></div>}><ErrorBoundary><Routes>
        <Route path="/onboarding"   element={<RequireAuth role="ARTIST"><OnboardingSequencePage /></RequireAuth>} />
        <Route path="/enter"        element={<EnterPage />} />
        <Route path="/p/:code"      element={<PublicPassportPage />} />
        <Route path="/s/:slug"      element={<StudioPassportPage />} />
        <Route path="/login"        element={<Navigate to="/enter" replace />} />
        <Route path="/signup"       element={<Navigate to="/enter" replace />} />
        <Route path="/dashboard"    element={<RequireAuth><SmartDashboard /></RequireAuth>} />
        <Route path="/discover"     element={<RequireAuth roles={['ARTIST', 'PRODUCER']}><DiscoverPage /></RequireAuth>} />
        <Route path="/producers"   element={<RequireAuth><ProducerDiscoverPage /></RequireAuth>} />
        <Route path="/artists/:id"  element={<RequireAuth><ArtistProfilePage /></RequireAuth>} />
        <Route path="/book"         element={<RequireAuth role="ARTIST"><BookingPage /></RequireAuth>} />
        <Route path="/bookings/:id" element={<RequireAuth><BookingDetailPage /></RequireAuth>} />
        <Route path="/receipt/:id"  element={<RequireAuth><ReceiptPage /></RequireAuth>} />
        <Route path="/artist/passport" element={<RequireAuth role="ARTIST"><PassportPage /></RequireAuth>} />
        <Route path="/projects" element={<RequireAuth role="ARTIST"><ArtistProjectsPage /></RequireAuth>} />
        <Route path="/passport"     element={<Navigate to="/artist/passport" replace />} />
        <Route path="/calendar"     element={<RequireAuth><CalendarPage /></RequireAuth>} />
        <Route path="/admin"        element={<RequireAuth role="STUDIO_ADMIN"><AdminDashboardPage /></RequireAuth>} />
        <Route path="/maintenance"  element={<RequireAuth role="OIANO_ADMIN"><MaintenancePage /></RequireAuth>} />
        <Route path="/maintenance/studios" element={<RequireAuth role="OIANO_ADMIN"><MaintenanceStudiosPage /></RequireAuth>} />
        <Route path="/maintenance/creators" element={<RequireAuth role="OIANO_ADMIN"><MaintenanceCreatorsPage /></RequireAuth>} />
        <Route path="/maintenance/bookings" element={<RequireAuth role="OIANO_ADMIN"><MaintenanceBookingsPage /></RequireAuth>} />
        <Route path="/maintenance/finance" element={<RequireAuth role="OIANO_ADMIN"><MaintenanceFinancePage /></RequireAuth>} />
        <Route path="/maintenance/health" element={<RequireAuth role="OIANO_ADMIN"><MaintenanceHealthPage /></RequireAuth>} />
        <Route path="/maintenance/audit" element={<RequireAuth role="OIANO_ADMIN"><MaintenanceAuditPage /></RequireAuth>} />
        <Route path="/maintenance/growth" element={<RequireAuth role="OIANO_ADMIN"><MaintenanceGrowthPage /></RequireAuth>} />
        <Route path="/maintenance/operators" element={<RequireAuth role="OIANO_ADMIN"><MaintenanceOperatorsPage /></RequireAuth>} />
        <Route path="/pulse"        element={<RequireAuth role="STUDIO_ADMIN"><PulseDashboard /></RequireAuth>} />
        <Route path="/runsheet"     element={<RequireAuth roles={['STUDIO_ADMIN','ENGINEER']}><RunsheetPage /></RequireAuth>} />
        <Route path="/producer"     element={<RequireAuth role="PRODUCER"><ProducerDashboardPage /></RequireAuth>} />
        <Route path="/producer/passport" element={<RequireAuth role="PRODUCER"><ProducerPassportPage /></RequireAuth>} />
        <Route path="/producer/projects/:id" element={<RequireAuth role="PRODUCER"><ProjectDetailPage /></RequireAuth>} />
        <Route path="/notifications"  element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/workrooms" element={<RequireAuth roles={['ARTIST','PRODUCER','STUDIO_ADMIN','ENGINEER']}><WorkroomsPage /></RequireAuth>} />
        <Route path="/connect/:artistId" element={<RequireAuth role="ARTIST"><ConnectPage /></RequireAuth>} />
        <Route path="/profile"         element={<Navigate to="/artist/passport" replace />} />
        <Route path="/"             element={<Navigate to="/dashboard" replace />} />
      </Routes></ErrorBoundary></Suspense>
    </div>
  );
}

// ── Body padding sync — adds/removes class when live bar appears ──────────────
function LiveBarSync() {
  const { isLive } = useStudioState();
  useEffect(() => {
    if (isLive) document.body.classList.add('has-live-bar');
    else document.body.classList.remove('has-live-bar');
    return () => document.body.classList.remove('has-live-bar');
  }, [isLive]);
  return null;
}

export default function App() {
  return (
    <StudioStateProvider>
      <SSEProvider />
      <LiveBarSync />
      <Chrome />
      <AnimatedRoutes />
      <FeedbackWidget />
    </StudioStateProvider>
  );
}
