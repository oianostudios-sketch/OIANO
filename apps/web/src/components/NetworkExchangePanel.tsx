import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, Music2, Network, ShieldCheck, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

type SignalItem = { label: string; count: number };
type StudioData = {
  mode: 'STUDIO';
  market: { available_artists: number; new_artists_30d: number; qualified_profiles: number; unique_artists_30d: number };
  available_genres: SignalItem[];
  booked_genres: SignalItem[];
  booked_services: SignalItem[];
  signal_window_days: number;
};
type ArtistData = { mode: 'ARTIST'; studios: Array<{ id: string; name: string; currency: string; rooms: number; services: string[]; starting_from: number | null; artists_30d: number }> };

export default function NetworkExchangePanel({ compact = false }: { compact?: boolean }) {
  const nav = useNavigate();
  const { data, isLoading } = useQuery<StudioData | ArtistData>({ queryKey: ['network-exchange'], queryFn: async () => (await api.get('/network-exchange')).data, staleTime: 60_000 });
  if (isLoading) return <div className="h-32 animate-pulse rounded-2xl border border-white/[.06] bg-white/[.02]" />;
  if (!data) return null;
  if (data.mode === 'STUDIO') {
    const hasBookingSignals = data.booked_genres.length > 0;
    return <section className="overflow-hidden rounded-2xl border border-dome/15 bg-[radial-gradient(circle_at_90%_0%,rgba(90,155,203,.1),transparent_32%),#0b0d0f] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[.22em] text-dome"><Network size={12} />Oiano Network Exchange</p><h2 className="mt-3 font-display text-xl">Network movement around your studio.</h2><p className="mt-2 text-xs text-zinc-600">Availability across Oiano and verified booking activity from the last {data.signal_window_days} days.</p></div><span className="flex items-center gap-2 rounded-full border border-emerald-500/10 px-3 py-1 text-[8px] text-emerald-500"><ShieldCheck size={10} />AGGREGATED</span></div>
      <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">{[['Artists available', data.market.available_artists], ['New · 30 days', data.market.new_artists_30d], ['Passport ready', data.market.qualified_profiles], ['Booked here · 30d', data.market.unique_artists_30d]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/[.055] bg-black/20 p-4"><b className="text-xl">{value}</b><p className="mt-1 text-[8px] uppercase tracking-wider text-zinc-700">{label}</p></div>)}</div>
      {!compact && <div className="mt-4 grid gap-3 md:grid-cols-2"><Signal title={hasBookingSignals ? 'Genres booked here · 30d' : 'Available artist genres'} icon={Music2} items={hasBookingSignals ? data.booked_genres : data.available_genres} /><Signal title="Services booked · 30d" icon={Users} items={data.booked_services} /></div>}
    </section>;
  }
  return <section className="rounded-2xl border border-dome/15 bg-[#0b0d0f] p-5"><p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[.2em] text-dome"><Network size={12} />Studios opening their doors</p><div className="mt-4 grid gap-3">{data.studios.slice(0, compact ? 2 : 5).map(studio => <button key={studio.id} onClick={() => nav('/book')} className="flex items-center gap-4 rounded-xl border border-white/[.055] bg-black/20 p-4 text-left hover:border-dome/20"><span className="grid h-10 w-10 place-items-center rounded-xl bg-dome/[.08] text-dome"><Building2 size={17} /></span><span className="min-w-0 flex-1"><b className="block text-xs">{studio.name}</b><small className="mt-1 block truncate text-[9px] text-zinc-600">{studio.rooms} room{studio.rooms === 1 ? '' : 's'} · {studio.services.slice(0, 2).join(' · ')} · {studio.artists_30d} artists recently</small></span>{studio.starting_from !== null && <span className="text-[9px] text-[#C9A84C]">from {studio.starting_from} {studio.currency}</span>}<ArrowRight size={13} className="text-zinc-700" /></button>)}</div></section>;
}

function Signal({ title, icon: Icon, items }: { title: string; icon: typeof Music2; items: SignalItem[] }) {
  const max = Math.max(1, ...items.map(item => item.count));
  return <div className="rounded-xl border border-white/[.055] bg-black/20 p-4"><p className="flex items-center gap-2 text-[9px] uppercase text-zinc-600"><Icon size={12} />{title}</p><div className="mt-4 space-y-3">{items.length ? items.map(item => <div key={item.label}><div className="flex justify-between text-[9px]"><span>{item.label}</span><span className="text-zinc-600">{item.count}</span></div><div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[.04]"><div className="h-full rounded-full bg-gradient-to-r from-dome to-[#C9A84C]" style={{ width: `${Math.max(8, item.count / max * 100)}%` }} /></div></div>) : <p className="text-[9px] text-zinc-700">No verified activity in this window yet.</p>}</div></div>;
}
