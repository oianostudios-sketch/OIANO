import { ArrowRight, CircleDot, Network, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NETWORK_POLES, networkActionsForRole, networkPoleForRole, type NetworkPoleId } from '../lib/networkPoles';
import { useAuthStore } from '../store/auth.store';
import NetworkMetrics from '../components/NetworkMetrics';

const ORDER: NetworkPoleId[] = ['ARTIST', 'STUDIO', 'CREATIVE', 'COLLABORATOR', 'OIANO'];

export default function EcosystemNetworkPage() {
  const role = useAuthStore(state => state.user?.role);
  const active = networkPoleForRole(role);
  const activeActions = networkActionsForRole(role);

  return (
    <main className="min-h-screen bg-studio-bg px-5 py-10 text-zinc-100 md:px-8">
      <div className="mx-auto max-w-[1380px]">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-white/[.06] pb-8"><div><p className="text-[9px] font-mono uppercase tracking-[.28em] text-[#5A9BCB]">The OIANO network</p><h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight text-white md:text-5xl">Every contribution should return measurable value.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">Artists, studios and creative professionals are the poles. Projects create the connection. OIANO preserves the trusted record between them.</p></div><div className="rounded-2xl border border-white/[.06] bg-white/[.02] px-4 py-3"><p className="text-[8px] font-mono uppercase tracking-wider text-zinc-700">You are viewing as</p><p className="mt-1 text-xs" style={{color:active.accent}}>{active.label}</p></div></header>

        <section className="relative mt-8 grid gap-3 xl:grid-cols-5" aria-label="OIANO network poles">
          <div className="pointer-events-none absolute left-[10%] right-[10%] top-9 hidden h-px bg-gradient-to-r from-[#5A9BCB]/20 via-[#C9A84C]/30 to-emerald-400/20 xl:block"/>
          {ORDER.map(id => { const pole=NETWORK_POLES[id]; const isActive=pole.id===active.id; return <article key={id} className={`card-lift metric-enter relative rounded-3xl border p-5 ${isActive?'bg-white/[.045]':'bg-studio-surface'}`} style={{borderColor:isActive?`${pole.accent}45`:'rgba(255,255,255,.06)'}}><div className="relative z-10 grid h-9 w-9 place-items-center rounded-full border bg-studio-surface" style={{borderColor:`${pole.accent}50`,color:pole.accent}}><CircleDot size={15}/></div><p className="mt-5 text-[8px] font-mono uppercase tracking-[.18em]" style={{color:pole.accent}}>{pole.label}</p><h2 className="mt-2 min-h-12 text-sm font-semibold leading-5 text-zinc-200">{pole.statement}</h2><div className="mt-5 border-t border-white/[.05] pt-4"><p className="text-[7px] font-mono uppercase tracking-wider text-zinc-700">Contributes</p><p className="mt-2 text-[10px] leading-4 text-zinc-500">{pole.contributes}</p></div><div className="mt-4"><p className="text-[7px] font-mono uppercase tracking-wider text-zinc-700">Receives</p><p className="mt-2 text-[10px] leading-4 text-zinc-500">{pole.receives}</p></div>{isActive&&<span className="mt-5 inline-flex rounded-full border px-2 py-1 text-[7px] font-mono uppercase tracking-wider" style={{borderColor:`${pole.accent}30`,color:pole.accent}}>Your active pole</span>}</article>; })}
        </section>

        <section className="mt-4 rounded-3xl border border-white/[.065] bg-studio-surface p-6"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[8px] font-mono uppercase tracking-[.2em]" style={{color:active.accent}}>Live value returned</p><h2 className="mt-2 text-base font-semibold">Your measurable network outcomes</h2></div><span className="text-[8px] font-mono uppercase tracking-wider text-zinc-700">Database-backed · scoped to your access</span></div><NetworkMetrics accent={active.accent}/></section>

        <section className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
          <article className="card-lift rounded-3xl border border-white/[.065] bg-studio-surface p-6"><div className="flex items-center gap-3"><Network size={17} className="text-[#5A9BCB]"/><div><h2 className="text-sm font-semibold">Build your side of the network</h2><p className="mt-1 text-[10px] text-zinc-700">Actions appropriate to your current responsibility</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-3">{activeActions.map(action=><Link key={action.path} to={action.path} className="flex items-center justify-between rounded-xl border border-white/[.06] px-4 py-3 text-[10px] text-zinc-400 no-underline hover:border-white/[.12] hover:text-white">{action.label}<ArrowRight size={12}/></Link>)}</div></article>
          <article className="rounded-3xl border border-emerald-400/10 bg-emerald-400/[.025] p-6"><div className="flex gap-3"><ShieldCheck size={17} className="shrink-0 text-emerald-400"/><div><h2 className="text-sm font-semibold">The shared-win rule</h2><p className="mt-2 text-xs leading-5 text-zinc-500">OIANO coordinates the work and protects the record. Artists, studios and contributors retain ownership of their identity, creations and professional relationships.</p></div></div></article>
        </section>
      </div>
    </main>
  );
}
