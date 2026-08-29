import { BadgeCheck, BriefcaseBusiness, Compass, Network, Orbit } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { accountProfileForRole, type UserRole } from '../lib/accountArchitecture';
import { networkPoleForRole } from '../lib/networkPoles';
import { useAuthStore } from '../store/auth.store';

type JourneyItem = {
  label: 'Now' | 'Work' | 'Network' | 'Record';
  description: string;
  to: string;
  icon: typeof Compass;
};

const JOURNEYS: Record<UserRole, JourneyItem[]> = {
  ARTIST: [
    { label: 'Now', description: 'Your next move', to: '/dashboard', icon: Compass },
    { label: 'Work', description: 'Projects and sessions', to: '/projects', icon: BriefcaseBusiness },
    { label: 'Network', description: 'Studios and creators', to: '/discover', icon: Network },
    { label: 'Record', description: 'Your verified Passport', to: '/artist/passport', icon: BadgeCheck },
  ],
  PRODUCER: [
    { label: 'Now', description: 'Your next move', to: '/dashboard', icon: Compass },
    { label: 'Work', description: 'Projects you lead', to: '/producer', icon: BriefcaseBusiness },
    { label: 'Network', description: 'Artists and producers', to: '/discover', icon: Network },
    { label: 'Record', description: 'Your professional proof', to: '/producer/passport', icon: BadgeCheck },
  ],
  ENGINEER: [
    { label: 'Now', description: 'Your next move', to: '/dashboard', icon: Compass },
    { label: 'Work', description: 'Runsheet and sessions', to: '/runsheet', icon: BriefcaseBusiness },
    { label: 'Network', description: 'Studios and creators', to: '/network', icon: Network },
    { label: 'Record', description: 'Credits and contributions', to: '/contributions', icon: BadgeCheck },
  ],
  STUDIO_ADMIN: [
    { label: 'Now', description: 'Business command', to: '/dashboard', icon: Compass },
    { label: 'Work', description: 'Live studio operations', to: '/pulse', icon: BriefcaseBusiness },
    { label: 'Network', description: 'Artists and professionals', to: '/network', icon: Network },
    { label: 'Record', description: 'Policies and performance', to: '/admin', icon: BadgeCheck },
  ],
  OIANO_ADMIN: [
    { label: 'Now', description: 'Network command', to: '/maintenance', icon: Compass },
    { label: 'Work', description: 'Systems and incidents', to: '/maintenance/health', icon: BriefcaseBusiness },
    { label: 'Network', description: 'Studios and creators', to: '/maintenance/studios', icon: Network },
    { label: 'Record', description: 'Governance and audit', to: '/maintenance/audit', icon: BadgeCheck },
  ],
};

function isCurrent(pathname: string, item: JourneyItem) {
  if (['/dashboard', '/maintenance', '/producer', '/admin'].includes(item.to)) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function EcosystemNetworkPanel() {
  const user = useAuthStore(state => state.user);
  const location = useLocation();
  const role = (user?.role ?? 'ARTIST') as UserRole;
  const pole = networkPoleForRole(role);
  const profile = accountProfileForRole(role);

  return (
    <aside className="border-b border-white/[.065] bg-[#080a0b]/95 text-zinc-100 backdrop-blur-xl" aria-label="OIANO experience navigation">
      <div className="mx-auto flex max-w-[1380px] items-stretch gap-3 px-3 sm:px-5 md:px-8">
        <Link to="/access" className="flex min-w-[170px] shrink-0 items-center gap-3 border-r border-white/[.055] py-3 pr-4 no-underline md:min-w-[230px]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border" style={{ borderColor: `${pole.accent}35`, background: `${pole.accent}0d`, color: pole.accent }}><Orbit size={16}/></span>
          <span className="min-w-0">
            <span className="block truncate text-[8px] font-mono uppercase tracking-[.2em]" style={{ color: pole.accent }}>{profile.label}</span>
            <span className="mt-1 block truncate text-[10px] text-zinc-600">{profile.eyebrow} · Active</span>
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-stretch overflow-x-auto" aria-label="Now, work, network and record">
          {JOURNEYS[role].map(item => {
            const active = isCurrent(location.pathname, item);
            const Icon = item.icon;
            return (
              <Link key={item.label} to={item.to} aria-current={active ? 'page' : undefined} className={`group relative flex min-w-[116px] flex-1 items-center gap-2.5 px-3 py-3 no-underline transition md:px-5 ${active ? 'bg-white/[.035] text-white' : 'text-zinc-600 hover:bg-white/[.018] hover:text-zinc-300'}`}>
                <Icon size={14} style={active ? { color: pole.accent } : undefined}/>
                <span><b className="block text-[10px] font-medium">{item.label}</b><span className="mt-0.5 hidden text-[8px] text-zinc-700 lg:block">{item.description}</span></span>
                {active && (
                  <i className="absolute inset-x-3 bottom-0 h-px" style={{ background: pole.accent }} />
                )}
              </Link>
            );
          })}
        </nav>

        <Link to="/access" className="hidden max-w-[190px] shrink-0 items-center border-l border-white/[.055] py-3 pl-4 text-right no-underline xl:flex">
          <span className="min-w-0"><span className="block truncate text-[9px] text-zinc-400">{user?.email}</span><span className="mt-1 block text-[8px] text-zinc-700">Identity & permissions</span></span>
        </Link>
      </div>
    </aside>
  );
}
