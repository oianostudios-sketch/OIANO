/**
 * MobileBottomNav — sticky bottom tab bar, one set per role (<768px).
 * ARTIST: Home · Book · Passport · Workrooms (original, hand-drawn icons — unchanged)
 * STUDIO_ADMIN: Home · Calendar · Runsheet · Pulse (mirrors AdminDashboardPage's own quick links)
 * ENGINEER: Home · Calendar · Runsheet · Workrooms (mirrors EngineerDashboardPage's own top nav)
 * PRODUCER: Home · Discover · Producers · Passport (mirrors ProducerNav's own links)
 * Hidden on desktop via CSS media query. Not shown for OIANO_ADMIN (internal ops role).
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, ClipboardList, Activity, Compass, Handshake, Users, Zap, Home as HomeIcon } from 'lucide-react';
import { useAuthStore } from '../store/auth.store';

const ARTIST_TABS = [
  {
    id: 'home',
    label: 'Home',
    path: '/dashboard',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#5A9BCB' : 'none'}
        stroke={active ? '#5A9BCB' : '#555'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    id: 'book',
    label: 'Book',
    path: '/book',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active ? '#5A9BCB' : '#555'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
    accent: true,
  },
  {
    id: 'passport',
    label: 'Passport',
    path: '/artist/passport',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active ? '#5A9BCB' : '#555'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="12" cy="10" r="3"/>
        <path d="M7 21v-1a5 5 0 0 1 10 0v1"/>
      </svg>
    ),
  },
  {
    id: 'inbox',
    label: 'Comms',
    path: '/communications',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active ? '#5A9BCB' : '#555'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    badge: true,
  },
  {
    id: 'contributions',
    label: 'Contribute',
    path: '/contributions',
    icon: (active: boolean) => <Handshake size={22} strokeWidth={1.8} color={active ? '#5A9BCB' : '#555'} />,
  },
];

// Lucide-backed icon factory for the newer role tab sets — kept visually
// consistent with the artist tabs' stroke weight/active color without
// hand-rolling more raw SVG paths.
function lucideIcon(Icon: typeof Calendar) {
  return (active: boolean) => <Icon size={22} strokeWidth={1.8} color={active ? '#5A9BCB' : '#555'} />;
}

const HOME_TAB = { id: 'home', label: 'Home', path: '/dashboard', icon: lucideIcon(HomeIcon) };
const CONTRIBUTIONS_TAB = { id: 'contributions', label: 'Contribute', path: '/contributions', icon: lucideIcon(Handshake) };
// Replaces Contribute for the two roles physically present at a studio —
// reporting a dead mic mid-session is a higher mobile priority than the
// contribution inbox, which stays reachable via the Command Palette instead.
const FACILITIES_TAB = { id: 'facilities', label: 'Facilities', path: '/facilities', icon: lucideIcon(Zap) };

const STUDIO_ADMIN_TABS = [
  HOME_TAB,
  { id: 'calendar', label: 'Calendar', path: '/calendar', icon: lucideIcon(Calendar) },
  { id: 'runsheet', label: 'Runsheet', path: '/runsheet', icon: lucideIcon(ClipboardList) },
  { id: 'pulse', label: 'Pulse', path: '/pulse', icon: lucideIcon(Activity) },
  FACILITIES_TAB,
];

const ENGINEER_TABS = [
  HOME_TAB,
  { id: 'calendar', label: 'Calendar', path: '/calendar', icon: lucideIcon(Calendar) },
  { id: 'runsheet', label: 'Runsheet', path: '/runsheet', icon: lucideIcon(ClipboardList) },
  { id: 'communications', label: 'Comms', path: '/communications', icon: lucideIcon(Users) },
  FACILITIES_TAB,
];

const PRODUCER_TABS = [
  HOME_TAB,
  { id: 'discover', label: 'Discover', path: '/discover', icon: lucideIcon(Compass) },
  { id: 'producers', label: 'Producers', path: '/producers', icon: lucideIcon(Users) },
  { id: 'passport', label: 'Passport', path: '/producer/passport', icon: lucideIcon(ClipboardList) },
  CONTRIBUTIONS_TAB,
];

const TABS_BY_ROLE: Record<string, typeof ARTIST_TABS> = {
  ARTIST: ARTIST_TABS,
  STUDIO_ADMIN: STUDIO_ADMIN_TABS,
  ENGINEER: ENGINEER_TABS,
  PRODUCER: PRODUCER_TABS,
};

export default function MobileBottomNav() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const TABS = user?.role ? TABS_BY_ROLE[user.role] : undefined;
  if (!TABS) return null;

  // Pull notification count from shared React Query cache — no extra fetch
  const notifs: any[] = qc.getQueryData(['notifications']) ?? [];
  const unread = notifs.filter((n: any) => !n.read_at).length;

  function isActive(path: string) {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  }

  return (
    <>
      {/* Spacer so page content isn't hidden behind the nav */}
      <div className="mobile-bottom-nav-spacer" />

      <nav className="mobile-bottom-nav" role="navigation" aria-label="Main navigation">
        {TABS.map(tab => {
          const active = isActive(tab.path);
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`mobile-bottom-nav-tab ${active ? 'active' : ''}`}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
            >
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                {tab.icon(active)}
                {'badge' in tab && tab.badge && unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -6,
                    minWidth: 16, height: 16, borderRadius: 8,
                    background: '#ef4444', color: '#fff',
                    fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px', lineHeight: 1,
                  }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              <span className="mobile-bottom-nav-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        .mobile-bottom-nav {
          display: none;
        }

        @media (max-width: 767px) {
          .mobile-bottom-nav {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 100;
            background: #0d0d0d;
            border-top: 1px solid #1a1a1a;
            padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
            justify-content: space-around;
            align-items: center;
          }

          .mobile-bottom-nav-spacer {
            display: block;
            height: calc(64px + env(safe-area-inset-bottom));
          }

          .mobile-bottom-nav-tab {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 8px;
            transition: background 0.15s;
            -webkit-tap-highlight-color: transparent;
          }

          .mobile-bottom-nav-tab:active {
            background: rgba(201, 168, 76, 0.08);
          }

          .mobile-bottom-nav-label {
            font-size: 9px;
            font-family: 'JetBrains Mono', monospace;
            letter-spacing: 0.06em;
            color: #555;
            text-transform: uppercase;
            transition: color 0.15s;
          }

          .mobile-bottom-nav-tab.active .mobile-bottom-nav-label {
            color: #5A9BCB;
          }

          /* Hide desktop footer on mobile */
          .db-desktop-footer {
            display: none !important;
          }

          /* Shrink header on mobile */
          .db-header {
            padding: 10px 16px !important;
          }
        }
      `}</style>
    </>
  );
}
