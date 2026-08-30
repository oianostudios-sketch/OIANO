import { Activity, AlertTriangle, Building2, CalendarCheck, ChevronRight, CircleDollarSign, Radio, Search, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import MaintenanceShell, { maintenanceSections } from '../components/MaintenanceShell';
import MaintenanceMetricCard from '../components/MaintenanceMetricCard';

type Summary = {
  generated_at: string;
  network: { studios: number; artists: number; producers: number; creators: number; studio_staff: number; live_sessions: number };
  business: { bookings: number; completed_bookings: number; gmv_paid_usd: number; platform_revenue_usd: number; failed_payments: number; new_creators_30d: number; bookings_30d: number; pending_bookings: number; processing_payments: number };
  activity: Array<{ date: string; creators: number; bookings: number }>;
  system: { api: string; database: string };
};

type SearchHit = { id: string; type: string; name?: string; alias?: string | null; email?: string; passport_code?: string | null; slug?: string; status?: string; starts_at?: string; artist_name?: string; studio_name?: string };
type SearchResults = { query: string; results: { artists: SearchHit[]; producers: SearchHit[]; studios: SearchHit[]; booking: SearchHit | null } };

const SEARCH_DESTINATION: Record<string, string> = { artist: '/maintenance/creators', producer: '/maintenance/creators', studio: '/maintenance/studios', booking: '/maintenance/bookings' };

const nav = maintenanceSections;

export default function MaintenancePage() {
  const navigate = useNavigate();
  const [searchOpen,setSearchOpen]=useState(false);
  const [search,setSearch]=useState('');
  const { data, isLoading, error } = useQuery<Summary>({ queryKey:['maintenance-summary'], queryFn:async()=>(await api.get('/maintenance/summary')).data, refetchInterval:30_000 });
  const maxActivity = Math.max(1, ...(data?.activity.flatMap(d => [d.creators,d.bookings]) ?? [1]));
  const attention = data ? [
    ...(data.business.failed_payments ? [{severity:'Critical', title:`${data.business.failed_payments} failed payment${data.business.failed_payments === 1 ? '' : 's'}`, detail:'Review payment exceptions and recovery status.', tone:'#ef4444',href:'/maintenance/finance'}] : []),
    ...(data.business.pending_bookings ? [{severity:'Review', title:`${data.business.pending_bookings} pending booking${data.business.pending_bookings === 1 ? '' : 's'}`, detail:'Studio confirmation is still required.', tone:'#f59e0b',href:'/maintenance/bookings'}] : []),
    ...(data.business.processing_payments ? [{severity:'Monitor', title:`${data.business.processing_payments} payment${data.business.processing_payments === 1 ? '' : 's'} processing`, detail:'Watch for delayed provider confirmation.', tone:'#5A9BCB',href:'/maintenance/finance'}] : []),
  ] : [];
  const destinations=useMemo(()=>nav.filter(item=>item.to&&item.label.toLowerCase().includes(search.toLowerCase())),[search]);
  const trimmedSearch = search.trim();
  const { data: searchData } = useQuery<SearchResults>({
    queryKey: ['maintenance-search', trimmedSearch],
    queryFn: async () => (await api.get('/maintenance/search', { params: { q: trimmedSearch } })).data,
    enabled: searchOpen && trimmedSearch.length >= 2,
  });
  const searchHits: SearchHit[] = trimmedSearch.length >= 2 && searchData ? [
    ...searchData.results.artists,
    ...searchData.results.producers,
    ...searchData.results.studios,
    ...(searchData.results.booking ? [searchData.results.booking] : []),
  ] : [];

  return <MaintenanceShell toolbar={<button onClick={()=>setSearchOpen(true)} className="flex w-[360px] items-center gap-2 rounded-xl border border-white/[.055] bg-white/[.018] px-3 py-2.5 text-zinc-700 transition hover:border-white/[.1] hover:text-zinc-500"><Search size={14}/><span className="text-xs">Go to a control area</span><kbd className="ml-auto rounded border border-white/[.06] px-1.5 py-0.5 text-[8px]">⌘ K</kbd></button>}>

    <section className="mx-auto max-w-[1380px] px-5 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 text-[9px] font-mono uppercase tracking-[.28em] text-dome">Network command centre</p><h1 className="font-display text-3xl md:text-4xl">Good oversight creates trust.</h1><p className="mt-3 text-sm text-zinc-600">Live business intelligence across the OIANO creator network.</p></div><div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider ${error?'border-red-500/20 bg-red-500/[.06] text-red-400':'border-emerald-500/20 bg-emerald-500/[.06] text-emerald-400'}`}><Radio size={10}/>{error?'Attention required':'Systems operational'}</div></div>

      {isLoading?<p className="mt-14 text-[10px] font-mono uppercase tracking-widest text-zinc-700">Reading the network…</p>:error||!data?<div role="alert" className="mt-10 rounded-xl border border-red-500/20 bg-red-500/[.05] p-5 text-sm text-red-300">Maintenance intelligence is unavailable.</div>:<>
        <div className="mt-8 flex flex-wrap items-center gap-2"><span className="mr-2 text-[9px] font-mono uppercase tracking-[.18em] text-zinc-700">Today</span><button onClick={()=>navigate('/maintenance/bookings')} className="rounded-full border border-white/[.06] bg-white/[.02] px-3 py-1.5 text-[10px] text-zinc-500 hover:text-white">{data.business.pending_bookings} bookings awaiting review</button><button onClick={()=>navigate('/maintenance/finance')} className="rounded-full border border-white/[.06] bg-white/[.02] px-3 py-1.5 text-[10px] text-zinc-500 hover:text-white">{data.business.failed_payments} payment exceptions</button><button onClick={()=>navigate('/maintenance/health')} className="rounded-full border border-emerald-500/10 bg-emerald-500/[.025] px-3 py-1.5 text-[10px] text-emerald-500">Infrastructure healthy</button></div>
        <article className="relative mt-9 overflow-hidden rounded-2xl border border-dome/[.16] bg-[radial-gradient(circle_at_75%_35%,rgba(90,155,203,.14),transparent_34%),linear-gradient(135deg,#0b0e11,#08090b)] p-6 md:p-8">
          <div className="absolute right-[-45px] top-[-70px] h-56 w-56 rounded-full border border-dome/10"/><div className="absolute right-[8px] top-[-18px] h-36 w-36 rounded-full border border-dome/10"/>
          <div className="relative flex flex-wrap items-center justify-between gap-8"><div><div className="flex items-center gap-2"><i className={`signal-dot${data.network.live_sessions>0?' signal-pulse':''}`} style={{'--signal':data.network.live_sessions>0?'#4ade80':'#52525b'} as CSSProperties}/><p className="text-[9px] font-mono uppercase tracking-[.22em] text-emerald-400">OIANO network live</p></div><p className="mt-5 font-display text-2xl">{data.network.studios} studios · {data.network.live_sessions} live sessions · {data.network.creators} creators</p><p className="mt-2 text-xs text-zinc-600">API operational · Database connected · Updated every 30 seconds</p></div><div className="grid grid-cols-3 gap-7 text-center"><div><b className="text-xl">{data.network.studios}</b><p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-700">Studios</p></div><div><b className="text-xl text-dome">{data.network.live_sessions}</b><p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-700">Live</p></div><div><b className="text-xl text-[#C9A84C]">{data.business.new_creators_30d}</b><p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-700">New 30d</p></div></div></div>
        </article>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MaintenanceMetricCard onClick={()=>navigate('/maintenance/studios')} icon={Building2} label="Studios" value={data.network.studios} detail={`${data.network.studio_staff} studio team members`} tone="dome" live={data.network.live_sessions>0}/><MaintenanceMetricCard onClick={()=>navigate('/maintenance/creators')} icon={Users} label="Creators" value={data.network.creators} detail={`${data.network.artists} artists · ${data.network.producers} producers`} tone="gold"/><MaintenanceMetricCard onClick={()=>navigate('/maintenance/bookings')} icon={CalendarCheck} label="Bookings" value={data.business.bookings.toLocaleString()} detail={`${data.business.bookings_30d} created in 30 days`} tone="dome"/><MaintenanceMetricCard onClick={()=>navigate('/maintenance/finance')} icon={CircleDollarSign} label="GMV" value={`$${data.business.gmv_paid_usd.toLocaleString()}`} detail="Gross paid booking value (not revenue)" tone="gold"/><MaintenanceMetricCard onClick={()=>navigate('/maintenance/finance')} icon={CircleDollarSign} label="Platform revenue" value={`$${data.business.platform_revenue_usd.toLocaleString()}`} detail="OIANO's actual fee take" tone="amber"/></div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[1.45fr_1fr]">
          <article className="rounded-2xl border border-white/[.065] bg-studio-surface p-6"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Network activity</h2><p className="mt-1 text-xs text-zinc-700">Creator registrations and booking demand</p></div><Activity size={16} className="text-dome"/></div><div className="mt-8 flex h-40 items-end gap-3">{data.activity.map(day=><div key={day.date} className="flex h-full flex-1 flex-col justify-end gap-1"><div className="rounded-t bg-dome/70" style={{height:`${Math.max(3,day.bookings/maxActivity*100)}%`}}/><div className="rounded-t bg-[#C9A84C]/70" style={{height:`${Math.max(3,day.creators/maxActivity*100)}%`}}/><span className="mt-2 text-center text-[8px] font-mono text-zinc-800">{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'})}</span></div>)}</div><div className="mt-5 flex gap-5 text-[9px] text-zinc-700"><span><i className="mr-2 inline-block h-2 w-2 rounded-sm bg-dome/70"/>Bookings</span><span><i className="mr-2 inline-block h-2 w-2 rounded-sm bg-[#C9A84C]/70"/>Creators</span></div></article>
          <article className="rounded-2xl border border-white/[.065] bg-studio-surface p-6"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Attention queue</h2><p className="mt-1 text-xs text-zinc-700">Items requiring platform oversight</p></div><AlertTriangle size={16} className={attention.length?'text-amber-400':'text-emerald-500'}/></div><div className="mt-6 space-y-2">{attention.length?attention.map(item=><button key={item.title} className="flex w-full items-start gap-3 rounded-xl border border-white/[.05] bg-white/[.018] p-4 text-left"><i className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{background:item.tone}}/><span className="min-w-0 flex-1"><span className="block text-[9px] font-mono uppercase tracking-wider" style={{color:item.tone}}>{item.severity}</span><b className="mt-1 block text-xs font-medium">{item.title}</b><small className="mt-1 block text-[10px] leading-4 text-zinc-700">{item.detail}</small></span><ChevronRight size={13} className="mt-1 text-zinc-800"/></button>):<div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[.03] p-5"><p className="text-xs text-emerald-400">No urgent platform actions</p><p className="mt-2 text-[10px] text-zinc-700">Payments, bookings and systems are within normal conditions.</p></div>}</div></article>
        </div><p className="mt-5 text-right text-[8px] font-mono text-zinc-800">Updated {new Date(data.generated_at).toLocaleString()}</p>
      </>}
    </section>
    {searchOpen&&<div role="dialog" aria-modal="true" aria-label="Control area search" onMouseDown={()=>setSearchOpen(false)} className="fixed inset-0 z-50 flex justify-center bg-black/75 px-4 pt-[12vh] backdrop-blur-sm"><div onMouseDown={event=>event.stopPropagation()} className="h-fit w-full max-w-xl overflow-hidden rounded-2xl border border-white/[.1] bg-studio-surface shadow-2xl"><div className="flex items-center gap-3 border-b border-white/[.07] px-5"><Search size={16} className="text-dome"/><input autoFocus value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search control areas, or a Passport code / email / booking ID…" className="w-full bg-transparent py-5 text-sm outline-none placeholder:text-zinc-700"/><button onClick={()=>setSearchOpen(false)} className="text-[9px] font-mono text-zinc-700">ESC</button></div><div className="max-h-[50vh] overflow-y-auto p-2">
      {trimmedSearch.length>=2&&<>
        <p className="px-4 pb-1 pt-2 text-[9px] font-mono uppercase tracking-[.16em] text-zinc-700">Network records</p>
        {searchHits.map(hit=><button key={`${hit.type}-${hit.id}`} onClick={()=>{navigate(SEARCH_DESTINATION[hit.type] ?? '/maintenance');setSearchOpen(false);}} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-xs text-zinc-400 hover:bg-white/[.04] hover:text-white">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[.035] text-[8px] font-mono uppercase text-dome">{hit.type.slice(0,2)}</span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-xs font-medium text-zinc-200">{hit.type==='booking'?`Booking · ${hit.artist_name} @ ${hit.studio_name}`:hit.name ?? hit.alias ?? hit.slug}</b>
            <small className="mt-0.5 block truncate text-[10px] text-zinc-700">{hit.type==='booking'?`${hit.status} · starts ${hit.starts_at?new Date(hit.starts_at).toLocaleString():''}`:[hit.passport_code,hit.email].filter(Boolean).join(' · ')}</small>
          </span>
          <ChevronRight size={13} className="text-zinc-800"/>
        </button>)}
        {!searchHits.length&&<p className="p-5 text-center text-xs text-zinc-700">No matching network record.</p>}
        <div className="my-2 h-px bg-white/[.05]"/>
      </>}
      <p className="px-4 pb-1 pt-2 text-[9px] font-mono uppercase tracking-[.16em] text-zinc-700">Control areas</p>
      {destinations.map(({label,icon:Icon,to})=><button key={label} onClick={()=>to&&navigate(to)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-xs text-zinc-400 hover:bg-white/[.04] hover:text-white"><Icon size={15} className="text-dome"/>{label}<ChevronRight size={13} className="ml-auto text-zinc-800"/></button>)}{!destinations.length&&<p className="p-5 text-center text-xs text-zinc-700">No control area found.</p>}</div></div></div>}
  </MaintenanceShell>;
}
