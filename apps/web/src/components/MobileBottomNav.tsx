/** Operational mobile navigation. Creators use CreatorNavigation on every screen. */
import { useLocation, useNavigate } from 'react-router-dom';

import { Calendar, ClipboardList, Activity, Users, Zap, Home as HomeIcon } from 'lucide-react';
import { useAuthStore } from '../store/auth.store';

function lucideIcon(Icon: typeof Calendar) {
  return (active: boolean) => <Icon size={22} strokeWidth={1.8} color={active ? '#5A9BCB' : '#555'} />;
}

const HOME_TAB = { id: 'home', label: 'Home', path: '/dashboard', icon: lucideIcon(HomeIcon) };
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

const TABS_BY_ROLE: Record<string, typeof STUDIO_ADMIN_TABS> = {
  STUDIO_ADMIN: STUDIO_ADMIN_TABS,
  ENGINEER: ENGINEER_TABS,
};

export default function MobileBottomNav() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();


  const TABS = user?.role ? TABS_BY_ROLE[user.role] : undefined;
  // Creators share the same responsive navigation on every screen.
  if (user?.role === 'ARTIST' || user?.role === 'PRODUCER') return null;
  if (!TABS) return null;

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
