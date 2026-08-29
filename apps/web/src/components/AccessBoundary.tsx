import { ArrowLeft, Home, LockKeyhole, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { accountProfileForRole, homePathForRole, type UserRole } from '../lib/accountArchitecture';
import { useAuthStore } from '../store/auth.store';

function requiredWorkspace(roles: string[]): string {
  if (roles.includes('STUDIO_ADMIN')) return 'a verified Studio responsibility';
  if (roles.includes('OIANO_ADMIN')) return 'authorised OIANO Platform access';
  if (roles.includes('ARTIST')) return 'an Artist workspace';
  if (roles.includes('PRODUCER') || roles.includes('ENGINEER')) return 'a Creative Professional responsibility';
  return 'a different workspace responsibility';
}

export default function AccessBoundary({ roles }: { roles: string[] }) {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const profile = accountProfileForRole(user?.role as UserRole | undefined);

  return (
    <main className="min-h-screen bg-[#070809] px-5 py-16 text-zinc-100">
      <section className="mx-auto max-w-xl rounded-3xl border border-white/[.07] bg-[#0c0e10] p-7 shadow-2xl md:p-10">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-400/15 bg-amber-400/[.05] text-amber-300">
          <LockKeyhole size={20} />
        </div>
        <p className="mt-7 text-[9px] font-mono uppercase tracking-[.24em] text-amber-300/70">Access boundary</p>
        <h1 className="mt-3 font-display text-3xl leading-tight text-white">This workspace is outside your current access.</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-500">
          You are signed in through your <span className="text-zinc-300">{profile.label}</span> workspace. This area requires {requiredWorkspace(roles)}.
        </p>
        <div className="mt-7 rounded-2xl border border-white/[.055] bg-black/20 p-4">
          <p className="text-[9px] font-mono uppercase tracking-[.18em] text-zinc-600">Current context</p>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div><b className="text-sm font-medium text-zinc-200">{profile.label}</b><p className="mt-1 text-[10px] text-zinc-600">{user?.email}</p></div>
            <span className="rounded-full border border-emerald-400/15 px-2.5 py-1 text-[8px] font-mono uppercase tracking-wider text-emerald-400">Active</span>
          </div>
        </div>
        <div className="mt-7 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => navigate(-1)} className="flex items-center justify-center gap-2 rounded-xl border border-white/[.08] px-4 py-3 text-xs text-zinc-400 hover:text-white"><ArrowLeft size={14}/> Go back</button>
          <button type="button" onClick={() => navigate(homePathForRole(user?.role))} className="flex items-center justify-center gap-2 rounded-xl border border-white/[.08] px-4 py-3 text-xs text-zinc-400 hover:text-white"><Home size={14}/> My home</button>
          <button type="button" onClick={() => navigate('/access')} className="flex items-center justify-center gap-2 rounded-xl bg-[#5A9BCB] px-4 py-3 text-xs font-semibold text-black"><RefreshCw size={14}/> View access</button>
        </div>
      </section>
    </main>
  );
}
