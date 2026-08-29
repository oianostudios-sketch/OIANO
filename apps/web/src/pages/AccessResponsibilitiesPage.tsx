import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { accountProfileForRole, CREATIVE_PROJECT_ROLES, type UserRole } from '../lib/accountArchitecture';
import { useAuthStore } from '../store/auth.store';

type SafeUser = {
  id: string; email: string; role: UserRole; mfa_enabled?: boolean;
  studio_staff?: Array<{ id: string; studio_id: string; role: UserRole }>;
};

const RESPONSIBILITIES: Record<UserRole, string[]> = {
  ARTIST: ['Manage your Artist Passport', 'Book and manage your own sessions', 'Review your deliverables', 'Confirm credits, consent and rights'],
  PRODUCER: ['Manage producer-led projects', 'Invite project participants', 'Structure credits and rights proposals', 'Maintain your Creative Professional Passport'],
  ENGINEER: ['Access assigned studio sessions', 'Maintain session notes and deliverables', 'Use runsheets and project workrooms', 'Receive project-level credits'],
  STUDIO_ADMIN: ['Operate verified studio workspaces', 'Manage rooms, teams and bookings', 'Review studio finance and performance', 'Request artist visibility with consent'],
  OIANO_ADMIN: ['Monitor platform health and network operations', 'Review audit evidence and incidents', 'Oversee platform finance and growth', 'Operate within separated privileged permissions'],
};

export default function AccessResponsibilitiesPage() {
  const storedUser = useAuthStore(state => state.user);
  const { data } = useQuery<SafeUser>({ queryKey: ['auth-me-access'], queryFn: async () => (await api.get('/auth/me')).data });
  const user = data ?? storedUser;
  const role = (user?.role ?? 'ARTIST') as UserRole;
  const profile = accountProfileForRole(role);
  const studioMemberships = data?.studio_staff ?? [];

  return (
    <main className="min-h-screen bg-[#070809] px-5 py-10 text-zinc-100 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/[.06] pb-8">
          <div><p className="text-[9px] font-mono uppercase tracking-[.27em] text-[#5A9BCB]">Identity · Access · Responsibilities</p><h1 className="mt-3 font-display text-4xl text-white">One identity. Clear boundaries.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">See how OIANO understands your identity, which workspace is active and what you are trusted to do.</p></div>
          <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[.04] px-3 py-1.5 text-[8px] font-mono uppercase tracking-wider text-emerald-400">Authenticated</span>
        </header>

        <section className="mt-7 grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
          <article className="rounded-3xl border border-white/[.065] bg-[#0c0e10] p-6 md:p-8">
            <div className="flex items-start gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#5A9BCB]/[.08] text-[#79b4dd]"><UserRound size={20}/></div><div><p className="text-[8px] font-mono uppercase tracking-[.2em] text-zinc-600">Your OIANO identity</p><h2 className="mt-2 text-xl font-semibold text-white">{profile.label}</h2><p className="mt-1 text-xs text-zinc-600">{user?.email}</p></div></div>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">{[['Account family',profile.label],['Access model',profile.access.replace('_',' ').toLowerCase()],['Workspace status','Active']].map(([label,value])=><div key={label} className="rounded-2xl border border-white/[.05] bg-black/20 p-4"><p className="text-[8px] font-mono uppercase tracking-wider text-zinc-700">{label}</p><p className="mt-2 text-xs capitalize text-zinc-300">{value}</p></div>)}</div>
          </article>

          <article className="rounded-3xl border border-white/[.065] bg-[#0c0e10] p-6 md:p-8">
            <div className="flex items-center justify-between"><div><p className="text-[8px] font-mono uppercase tracking-[.2em] text-zinc-600">Security</p><h2 className="mt-2 text-base font-semibold">Account protection</h2></div><ShieldCheck size={18} className="text-emerald-400"/></div>
            <div className="mt-6 space-y-3"><div className="flex items-center gap-3 rounded-xl border border-white/[.05] p-3"><KeyRound size={15} className="text-zinc-500"/><div className="flex-1"><b className="text-xs font-medium">Password protected</b><p className="mt-1 text-[9px] text-zinc-700">Signed access tokens are versioned to your account.</p></div><Check size={13} className="text-emerald-400"/></div><div className="flex items-center gap-3 rounded-xl border border-white/[.05] p-3"><Fingerprint size={15} className="text-zinc-500"/><div className="flex-1"><b className="text-xs font-medium">Multi-factor authentication</b><p className="mt-1 text-[9px] text-zinc-700">{data?.mfa_enabled ? 'Active on this account.' : role === 'OIANO_ADMIN' ? 'Required for privileged access.' : 'Available as account protection expands.'}</p></div><span className={`text-[8px] font-mono ${data?.mfa_enabled?'text-emerald-400':'text-zinc-600'}`}>{data?.mfa_enabled?'ACTIVE':'STATUS'}</span></div></div>
            <Link to="/forgot-password" className="mt-5 flex items-center justify-between text-[10px] text-zinc-500 no-underline hover:text-white">Review password access <ChevronRight size={13}/></Link>
          </article>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/[.065] bg-[#0c0e10] p-6"><div className="flex items-center gap-3"><LockKeyhole size={17} className="text-[#C9A84C]"/><div><h2 className="text-sm font-semibold">Current responsibilities</h2><p className="mt-1 text-[10px] text-zinc-700">Actions available in your active workspace</p></div></div><div className="mt-5 space-y-2">{RESPONSIBILITIES[role].map(item=><div key={item} className="flex items-center gap-3 rounded-xl border border-white/[.045] px-4 py-3 text-xs text-zinc-400"><Check size={12} className="text-[#5A9BCB]"/>{item}</div>)}</div></article>
          <article className="rounded-3xl border border-white/[.065] bg-[#0c0e10] p-6"><div className="flex items-center gap-3"><UsersRound size={17} className="text-violet-300"/><div><h2 className="text-sm font-semibold">Flexible project roles</h2><p className="mt-1 text-[10px] text-zinc-700">A project role adds responsibility without creating another account</p></div></div><div className="mt-5 flex flex-wrap gap-2">{CREATIVE_PROJECT_ROLES.map(item=><span key={item} className="rounded-full border border-white/[.06] bg-white/[.025] px-3 py-1.5 text-[9px] text-zinc-500">{item}</span>)}</div>{studioMemberships.length>0&&<p className="mt-5 border-t border-white/[.05] pt-4 text-[10px] text-zinc-600">Connected to {studioMemberships.length} studio workspace{studioMemberships.length===1?'':'s'}.</p>}</article>
        </section>
      </div>
    </main>
  );
}
