import { useEffect } from 'react';
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
import EnterPage from './pages/EnterPage';
import OnboardingSequencePage from './pages/OnboardingSequencePage';
import DashboardPage from './pages/DashboardPage';
import ArtistProfilePage from './pages/ArtistProfilePage';
import BookingPage from './pages/BookingPage';
import BookingDetailPage from './pages/BookingDetailPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import PulseDashboard from './pages/PulseDashboard';
import EngineerDashboardPage from './pages/EngineerDashboardPage';
import ReceiptPage from './pages/ReceiptPage';
import PassportPage from './pages/PassportPage';
import CalendarPage from './pages/CalendarPage';
import RunsheetPage from './pages/RunsheetPage';
import DiscoverPage from './pages/DiscoverPage';
import ProducerDiscoverPage from './pages/ProducerDiscoverPage';
import NotificationsPage from './pages/NotificationsPage';
import ProducerDashboardPage from './pages/ProducerDashboardPage';
import ConnectPage from './pages/ConnectPage';
import ProducerPassportPage from './pages/ProducerPassportPage';

function RequireAuth({ children, role, roles }: { children: JSX.Element; role?: string; roles?: string[] }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/enter" replace />;
  if (role && user?.role !== role) return <Navigate to="/dashboard" replace />;
  if (roles && !roles.includes(user?.role ?? '')) return <Navigate to="/dashboard" replace />;
  return children;
}

function SmartDashboard() {
  const { user } = useAuthStore();
  if (user?.role === 'STUDIO_ADMIN') return <AdminDashboardPage />;
  if (user?.role === 'ENGINEER') return <EngineerDashboardPage />;
  if (user?.role === 'PRODUCER') return <ProducerDashboardPage />;
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
function Chrome({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  if (CHROME_FREE_ROUTES.includes(pathname)) return null;
  return <>{children}</>;
}

// ── Route transition wrapper ──────────────────────────────────────────────────
// Each pathname change swaps the key, triggering the page-enter CSS animation
function AnimatedRoutes() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter" style={{ minHeight: '100%' }}>
      <Routes>
        <Route path="/onboarding"   element={<RequireAuth role="ARTIST"><OnboardingSequencePage /></RequireAuth>} />
        <Route path="/enter"        element={<EnterPage />} />
        <Route path="/login"        element={<Navigate to="/enter" replace />} />
        <Route path="/signup"       element={<Navigate to="/enter" replace />} />
        <Route path="/dashboard"    element={<RequireAuth><ErrorBoundary><SmartDashboard /></ErrorBoundary></RequireAuth>} />
        <Route path="/discover"     element={<RequireAuth roles={['ARTIST', 'PRODUCER']}><DiscoverPage /></RequireAuth>} />
        <Route path="/producers"   element={<RequireAuth><ProducerDiscoverPage /></RequireAuth>} />
        <Route path="/artists/:id"  element={<RequireAuth><ErrorBoundary><ArtistProfilePage /></ErrorBoundary></RequireAuth>} />
        <Route path="/book"         element={<RequireAuth><BookingPage /></RequireAuth>} />
        <Route path="/bookings/:id" element={<RequireAuth><BookingDetailPage /></RequireAuth>} />
        <Route path="/receipt/:id"  element={<RequireAuth><ReceiptPage /></RequireAuth>} />
        <Route path="/passport"     element={<RequireAuth><PassportPage /></RequireAuth>} />
        <Route path="/calendar"     element={<RequireAuth><CalendarPage /></RequireAuth>} />
        <Route path="/admin"        element={<RequireAuth role="STUDIO_ADMIN"><AdminDashboardPage /></RequireAuth>} />
        <Route path="/pulse"        element={<RequireAuth role="STUDIO_ADMIN"><PulseDashboard /></RequireAuth>} />
        <Route path="/runsheet"     element={<RequireAuth roles={['STUDIO_ADMIN','ENGINEER']}><RunsheetPage /></RequireAuth>} />
        <Route path="/producer"     element={<RequireAuth role="PRODUCER"><ProducerDashboardPage /></RequireAuth>} />
        <Route path="/producer/passport" element={<RequireAuth role="PRODUCER"><ProducerPassportPage /></RequireAuth>} />
        <Route path="/notifications"  element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/connect/:artistId" element={<RequireAuth><ConnectPage /></RequireAuth>} />
        <Route path="/profile"         element={<Navigate to="/passport" replace />} />
        <Route path="/"             element={<Navigate to="/dashboard" replace />} />
      </Routes>
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
      <Chrome>
        <StudioTicker />
        <SessionLiveBar />
        <StudioPulseWidget />
        <ArtistStatusToggle />
        <MobileBottomNav />
        <CommandPalette />
      </Chrome>
      <AnimatedRoutes />
    </StudioStateProvider>
  );
}
