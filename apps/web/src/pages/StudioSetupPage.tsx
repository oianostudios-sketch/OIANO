import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, DoorOpen, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

// A studio's rooms and services: what artists can book, and the price each booking is
// charged. A booking needs one of each, so a studio with neither cannot be booked.

type Room = { id: string; name: string; capacity: number | null; description: string | null; hourly_rate: number | null; amenities: string[]; booking_count: number };
type Service = { id: string; name: string; category: string; description: string | null; unit: string; min_price_usd: number; max_price_usd: number; booking_count: number };
type Setup = { studio: { id: string; name: string; currency: string }; can_manage: boolean; bookable: boolean; rooms: Room[]; services: Service[] };

const CATEGORIES = ['RECORDING', 'FULL_DAY', 'MIX_MASTER', 'COACHING', 'EVENT', 'MEMBERSHIP'];
const UNITS: Record<string, string> = { hour: 'per hour', session: 'per session', track: 'per track', month: 'per month' };
const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');
const usd = (value: number) => `$${value.toFixed(value % 1 ? 2 : 0)}`;
const field = 'mt-2 w-full rounded-xl border border-white/[.08] bg-black/30 px-4 py-3 text-xs text-white outline-none focus:border-dome/50';
const caption = 'block text-[8px] uppercase tracking-wider text-zinc-600';

type RoomDraft = { name: string; capacity: string; description: string };
type ServiceDraft = { name: string; category: string; unit: string; price: string; upper: string; description: string };
const emptyRoom: RoomDraft = { name: '', capacity: '', description: '' };
const emptyService: ServiceDraft = { name: '', category: 'RECORDING', unit: 'hour', price: '', upper: '', description: '' };

function roomBody(draft: RoomDraft) {
  return { name: draft.name.trim(), capacity: draft.capacity ? Number(draft.capacity) : null, description: draft.description.trim() || null };
}
function serviceBody(draft: ServiceDraft) {
  return {
    name: draft.name.trim(), category: draft.category, unit: draft.unit, description: draft.description.trim() || null,
    min_price_usd: Number(draft.price), ...(draft.upper ? { max_price_usd: Number(draft.upper) } : {}),
  };
}

export default function StudioSetupPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery<Setup>({ queryKey: ['studio-setup'], queryFn: async () => (await api.get('/studio-setup')).data });
  const [room, setRoom] = useState<RoomDraft>(emptyRoom);
  const [roomEditing, setRoomEditing] = useState<string | null>(null);
  const [service, setService] = useState<ServiceDraft>(emptyService);
  const [serviceEditing, setServiceEditing] = useState<string | null>(null);

  // The booking page reads rooms and services through the studio, so refresh both.
  const refresh = () => { for (const key of ['studio-setup', 'studio', 'studio-options']) qc.invalidateQueries({ queryKey: [key] }); };
  const failed = (fallback: string) => (error: any) => toast.error(error?.response?.data?.error ?? fallback);

  const saveRoom = useMutation({
    mutationFn: () => roomEditing ? api.patch(`/studio-setup/rooms/${roomEditing}`, roomBody(room)) : api.post('/studio-setup/rooms', roomBody(room)),
    onSuccess: () => { toast.success(roomEditing ? 'Room updated' : 'Room added'); setRoom(emptyRoom); setRoomEditing(null); refresh(); },
    onError: failed('Room could not be saved'),
  });
  const deleteRoom = useMutation({
    mutationFn: (id: string) => api.delete(`/studio-setup/rooms/${id}`),
    onSuccess: () => { toast.success('Room removed'); refresh(); },
    onError: (error: any) => { refresh(); failed('Room could not be removed')(error); },
  });
  const saveService = useMutation({
    mutationFn: () => serviceEditing ? api.patch(`/studio-setup/services/${serviceEditing}`, serviceBody(service)) : api.post('/studio-setup/services', serviceBody(service)),
    onSuccess: () => { toast.success(serviceEditing ? 'Service updated' : 'Service added'); setService(emptyService); setServiceEditing(null); refresh(); },
    onError: failed('Service could not be saved'),
  });
  const deleteService = useMutation({
    mutationFn: (id: string) => api.delete(`/studio-setup/services/${id}`),
    onSuccess: () => { toast.success('Service removed'); refresh(); },
    onError: (error: any) => { refresh(); failed('Service could not be removed')(error); },
  });

  const canManage = Boolean(data?.can_manage);
  const priceValid = service.price !== '' && Number(service.price) >= 0 && (service.upper === '' || Number(service.upper) >= Number(service.price));

  return <main className="min-h-screen bg-studio-bg px-4 py-8 text-white md:px-8"><div className="mx-auto max-w-6xl">
    <Link to="/admin" className="inline-flex items-center gap-2 text-[10px] text-zinc-600 hover:text-white"><ArrowLeft size={13}/>Operator dashboard</Link>
    <div className="mt-8"><p className="text-[9px] font-mono uppercase tracking-[.25em] text-dome">What artists can book</p><h1 className="mt-3 font-display text-4xl">Rooms & services</h1>
      <p className="mt-3 max-w-xl text-xs leading-5 text-zinc-500">A booking takes one room and one service. The service sets the price: per hour, or once for a session, track or month. Changing a price affects the next booking, never one already made.</p></div>

    {isError && <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/[.05] p-5 text-xs text-red-300">Rooms and services could not be loaded. <button onClick={() => refetch()} className="ml-2 underline">Try again</button></div>}
    {data && !data.bookable && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[.06] p-5"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400"/><div><b className="block text-xs text-amber-200">{data.studio.name} cannot be booked yet</b><p className="mt-1 text-[11px] text-amber-200/70">Add at least one room and one service. Until then artists see the studio but cannot choose a session.</p></div></div>}
    {data && !canManage && <p className="mt-6 text-[11px] text-zinc-500">You can see these, but changing them needs the studio's standards permission. An owner or manager can grant it on the team page.</p>}

    <section className="mt-8 grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl border border-white/[.07] bg-studio-surface p-5">
        <div className="flex items-center gap-2"><DoorOpen size={15} className="text-dome"/><h2 className="text-sm">Rooms</h2><span className="ml-auto text-[10px] text-zinc-600">{data?.rooms.length ?? 0}</span></div>
        <div className="mt-5 space-y-2">{isLoading ? <div className="h-20 animate-pulse rounded-xl bg-white/[.03]"/> : data?.rooms.length ? data.rooms.map((r) => <div key={r.id} className="flex items-center gap-3 rounded-xl border border-white/[.055] bg-black/20 p-4">
          <div className="min-w-0 flex-1"><b className="block truncate text-xs">{r.name}</b><p className="mt-1 text-[10px] text-zinc-600">{r.capacity ? `Up to ${r.capacity} people` : 'Capacity not set'}{r.booking_count ? ` · ${r.booking_count} booking${r.booking_count === 1 ? '' : 's'}` : ''}</p></div>
          {canManage && <><button aria-label={`Edit ${r.name}`} onClick={() => { setRoomEditing(r.id); setRoom({ name: r.name, capacity: r.capacity ? String(r.capacity) : '', description: r.description ?? '' }); }} className="rounded-lg p-2 text-zinc-600 hover:bg-white/[.05] hover:text-white"><Pencil size={13}/></button>
          <button aria-label={`Remove ${r.name}`} disabled={r.booking_count > 0} title={r.booking_count > 0 ? 'Booked rooms stay on the studio\'s record; edit it instead' : undefined} onClick={() => confirm(`Remove ${r.name}?`) && deleteRoom.mutate(r.id)} className="rounded-lg p-2 text-zinc-700 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-700"><Trash2 size={13}/></button></>}
        </div>) : <p className="rounded-xl border border-dashed border-white/[.08] p-6 text-center text-[11px] text-zinc-600">No rooms yet.</p>}</div>
        {canManage && <form onSubmit={(e) => { e.preventDefault(); saveRoom.mutate(); }} className="mt-5 border-t border-white/[.05] pt-5">
          <p className="text-[10px] text-zinc-400">{roomEditing ? 'Edit room' : 'Add a room'}</p>
          <div className="mt-3 grid grid-cols-[1fr_7rem] gap-3"><label className={caption}>Name<input value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} maxLength={80} className={field}/></label>
            <label className={caption}>Capacity<input value={room.capacity} onChange={(e) => setRoom({ ...room, capacity: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={field}/></label></div>
          <label className={`${caption} mt-3`}>Description<input value={room.description} onChange={(e) => setRoom({ ...room, description: e.target.value })} maxLength={500} className={field}/></label>
          <div className="mt-4 flex gap-2"><button disabled={!room.name.trim() || saveRoom.isPending} className="flex items-center gap-2 rounded-xl bg-dome px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-40"><Plus size={13}/>{roomEditing ? 'Save room' : 'Add room'}</button>
            {roomEditing && <button type="button" onClick={() => { setRoomEditing(null); setRoom(emptyRoom); }} className="rounded-xl border border-white/[.08] px-4 py-2.5 text-xs text-zinc-400">Cancel</button>}</div>
        </form>}
      </article>

      <article className="rounded-2xl border border-white/[.07] bg-studio-surface p-5">
        <div className="flex items-center gap-2"><Tag size={15} className="text-dome"/><h2 className="text-sm">Services</h2><span className="ml-auto text-[10px] text-zinc-600">{data?.services.length ?? 0}</span></div>
        <div className="mt-5 space-y-2">{isLoading ? <div className="h-20 animate-pulse rounded-xl bg-white/[.03]"/> : data?.services.length ? data.services.map((s) => <div key={s.id} className="flex items-center gap-3 rounded-xl border border-white/[.055] bg-black/20 p-4">
          <div className="min-w-0 flex-1"><b className="block truncate text-xs">{s.name}</b><p className="mt-1 text-[10px] text-zinc-600">{label(s.category)} · <span className="font-mono text-zinc-400">{usd(s.min_price_usd)}{s.max_price_usd > s.min_price_usd ? `–${usd(s.max_price_usd)}` : ''}</span> {UNITS[s.unit] ?? s.unit}{s.booking_count ? ` · ${s.booking_count} booking${s.booking_count === 1 ? '' : 's'}` : ''}</p></div>
          {canManage && <><button aria-label={`Edit ${s.name}`} onClick={() => { setServiceEditing(s.id); setService({ name: s.name, category: s.category, unit: s.unit, price: String(s.min_price_usd), upper: s.max_price_usd > s.min_price_usd ? String(s.max_price_usd) : '', description: s.description ?? '' }); }} className="rounded-lg p-2 text-zinc-600 hover:bg-white/[.05] hover:text-white"><Pencil size={13}/></button>
          <button aria-label={`Remove ${s.name}`} disabled={s.booking_count > 0} title={s.booking_count > 0 ? 'Booked services stay on the studio\'s record; edit it instead' : undefined} onClick={() => confirm(`Remove ${s.name}?`) && deleteService.mutate(s.id)} className="rounded-lg p-2 text-zinc-700 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-700"><Trash2 size={13}/></button></>}
        </div>) : <p className="rounded-xl border border-dashed border-white/[.08] p-6 text-center text-[11px] text-zinc-600">No services yet.</p>}</div>
        {canManage && <form onSubmit={(e) => { e.preventDefault(); saveService.mutate(); }} className="mt-5 border-t border-white/[.05] pt-5">
          <p className="text-[10px] text-zinc-400">{serviceEditing ? 'Edit service' : 'Add a service'}</p>
          <label className={`${caption} mt-3`}>Name<input value={service.name} onChange={(e) => setService({ ...service, name: e.target.value })} maxLength={120} className={field}/></label>
          <div className="mt-3 grid grid-cols-2 gap-3"><label className={caption}>Kind<select value={service.category} onChange={(e) => setService({ ...service, category: e.target.value })} className={`${field} bg-[#0a0b0c]`}>{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></label>
            <label className={caption}>Charged<select value={service.unit} onChange={(e) => setService({ ...service, unit: e.target.value })} className={`${field} bg-[#0a0b0c]`}>{Object.entries(UNITS).map(([u, text]) => <option key={u} value={u}>{text}</option>)}</select></label></div>
          <div className="mt-3 grid grid-cols-2 gap-3"><label className={caption}>Price (USD)<input value={service.price} onChange={(e) => setService({ ...service, price: e.target.value })} inputMode="decimal" placeholder="50" className={`${field} font-mono`}/></label>
            <label className={caption}>Up to (optional)<input value={service.upper} onChange={(e) => setService({ ...service, upper: e.target.value })} inputMode="decimal" className={`${field} font-mono`}/></label></div>
          <p className="mt-2 text-[10px] text-zinc-600">A booking is charged the price{service.unit === 'hour' ? ' for each hour booked' : ' once'}. The upper figure is shown to artists for work that varies and is never charged.</p>
          <label className={`${caption} mt-3`}>Description<input value={service.description} onChange={(e) => setService({ ...service, description: e.target.value })} maxLength={500} className={field}/></label>
          <div className="mt-4 flex gap-2"><button disabled={!service.name.trim() || !priceValid || saveService.isPending} className="flex items-center gap-2 rounded-xl bg-dome px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-40"><Plus size={13}/>{serviceEditing ? 'Save service' : 'Add service'}</button>
            {serviceEditing && <button type="button" onClick={() => { setServiceEditing(null); setService(emptyService); }} className="rounded-xl border border-white/[.08] px-4 py-2.5 text-xs text-zinc-400">Cancel</button>}</div>
        </form>}
      </article>
    </section>
  </div></main>;
}
