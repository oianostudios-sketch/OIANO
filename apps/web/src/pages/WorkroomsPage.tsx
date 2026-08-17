import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell, CalendarDays, FolderKanban, MessageSquareText, Radio, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import SearchInput from '../components/SearchInput';

type Booking = {
  id: string; status: string; starts_at: string; updated_at?: string; notes?: string | null;
  artist?: { name?: string; alias?: string | null; avatar_url?: string | null } | null;
  studio?: { name?: string } | null; room?: { name?: string } | null;
  service?: { name?: string } | null; project?: { id: string; title: string } | null;
  engineer?: { name?: string } | null; messages?: Array<{ id: string; body: string; created_at: string }>;
};

type Project = {
  id: string; title: string; phase: string; is_active?: boolean; updated_at?: string;
  artist?: { name?: string; alias?: string | null } | null;
  producer?: { name?: string; alias?: string | null } | null;
  bookings?: Booking[]; participants?: Array<{ id: string }>;
};

function dateLabel(value?: string) {
  if (!value) return 'No date set';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function personName(booking: Booking) {
  return booking.artist?.alias ?? booking.artist?.name ?? booking.studio?.name ?? 'Studio team';
}

export default function WorkroomsPage() {
  const user = useAuthStore(state => state.user);
  const [query, setQuery] = useState('');
  const isArtist = user?.role === 'ARTIST';
  const isProducer = user?.role === 'PRODUCER';

  const bookingsQuery = useQuery<Booking[]>({
    queryKey: ['workrooms', 'bookings'],
    queryFn: async () => {
      const response = await api.get('/bookings', { params: { limit: 100 } });
      return Array.isArray(response.data) ? response.data : response.data?.data ?? [];
    },
    enabled: !isProducer,
  });
  const projectsQuery = useQuery<Project[]>({
    queryKey: ['workrooms', 'projects', user?.role],
    queryFn: async () => (await api.get(isProducer ? '/producer/projects' : '/artist-projects')).data,
    enabled: isArtist || isProducer,
  });

  const bookings = bookingsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const linkedBookingIds = useMemo(() => new Set(projects.flatMap(project => project.bookings ?? []).map(booking => booking.id)), [projects]);
  const standalone = bookings.filter(booking => !booking.project && !linkedBookingIds.has(booking.id));
  const normalized = query.trim().toLowerCase();
  const matches = (text: string) => !normalized || text.toLowerCase().includes(normalized);
  const visibleProjects = projects.filter(project => matches(`${project.title} ${project.phase} ${project.artist?.name ?? ''} ${project.producer?.name ?? ''}`));
  const visibleBookings = standalone.filter(booking => matches(`${booking.service?.name ?? ''} ${booking.room?.name ?? ''} ${personName(booking)} ${booking.status}`));
  const urgentCount = bookings.filter(booking => booking.status === 'PENDING').length;
  const activeCount = projects.filter(project => project.is_active !== false && project.phase !== 'DELIVERED').length + bookings.filter(booking => booking.status === 'IN_PROGRESS').length;
  const loading = bookingsQuery.isLoading || projectsQuery.isLoading;

  return (
    <div className="min-h-screen bg-[#090b0d] text-zinc-100 pb-28">
      <header className="sticky top-0 z-20 border-b border-white/[.07] bg-[#090b0d]/95 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link to="/dashboard" className="text-xs text-zinc-500 hover:text-white">← Home</Link>
          <div><p className="text-[9px] font-mono uppercase tracking-[.2em] text-dome">Oiano communications</p><h1 className="text-xl font-medium">Workrooms</h1></div>
          <Link to="/notifications" className="ml-auto flex items-center gap-2 rounded-lg border border-white/[.08] px-3 py-2 text-xs text-zinc-400 hover:text-white"><Bell size={13}/> Updates</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <section className="overflow-hidden rounded-3xl border border-dome/15 bg-[radial-gradient(circle_at_15%_0%,rgba(90,155,203,.14),transparent_36%),linear-gradient(140deg,rgba(17,21,25,.98),rgba(8,10,12,.98))] p-6 md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div><div className="mb-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.18em] text-emerald-400"><Radio size={12}/> Context stays with the work</div><h2 className="max-w-2xl text-3xl font-medium md:text-4xl">One professional conversation from booking to delivery.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">Messages, collaborators, sessions and decisions remain attached to the project or booking they belong to.</p></div>
            <div className="grid grid-cols-2 gap-2"><div className="min-w-28 rounded-xl border border-white/[.07] bg-black/20 p-4"><strong className="text-2xl">{activeCount}</strong><span className="mt-1 block text-[9px] uppercase tracking-widest text-zinc-600">Active rooms</span></div><div className="min-w-28 rounded-xl border border-white/[.07] bg-black/20 p-4"><strong className={urgentCount ? 'text-amber-300 text-2xl' : 'text-2xl'}>{urgentCount}</strong><span className="mt-1 block text-[9px] uppercase tracking-widest text-zinc-600">Need action</span></div></div>
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Find a project, artist, room or session" className="mt-7 max-w-xl" />
        </section>

        {loading ? <div className="grid min-h-72 place-items-center text-[10px] font-mono tracking-widest text-zinc-600">OPENING WORKROOMS…</div> : <>
          {visibleProjects.length > 0 && <section className="mt-9"><div className="mb-4 flex items-end justify-between"><div><p className="text-[9px] font-mono uppercase tracking-[.18em] text-dome">Long-running context</p><h2 className="mt-1 text-xl">Project workrooms</h2></div><span className="text-[10px] text-zinc-700">{visibleProjects.length} room{visibleProjects.length === 1 ? '' : 's'}</span></div><div className="grid gap-3 lg:grid-cols-2">{visibleProjects.map(project => { const lastBooking = project.bookings?.[0]; const destination = isProducer ? `/producer/projects/${project.id}` : `/projects?project=${project.id}`; return <Link key={project.id} to={destination} className="group rounded-2xl border border-white/[.07] bg-white/[.018] p-5 transition hover:-translate-y-0.5 hover:border-dome/25 hover:bg-dome/[.035]"><div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-dome/15 bg-dome/[.07] text-dome"><FolderKanban size={18}/></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="text-[9px] font-mono uppercase tracking-widest text-dome">{project.phase.replaceAll('_', ' ')}</span><span className="text-[9px] text-zinc-700">{dateLabel(project.updated_at)}</span></div><h3 className="mt-2 truncate text-base font-semibold">{project.title}</h3><p className="mt-1 truncate text-xs text-zinc-600">{isProducer ? (project.artist?.alias ?? project.artist?.name ?? 'Artist pending') : (project.producer?.alias ?? project.producer?.name ?? 'Producer pending')}</p><div className="mt-5 flex flex-wrap gap-3 text-[10px] text-zinc-600"><span className="flex items-center gap-1.5"><CalendarDays size={12}/>{project.bookings?.length ?? 0} sessions</span><span className="flex items-center gap-1.5"><Users size={12}/>{(project.participants?.length ?? 0) + 2} people</span><span className="ml-auto text-dome opacity-70 group-hover:opacity-100">Open workroom →</span></div>{lastBooking && <p className="mt-3 border-t border-white/[.05] pt-3 text-[10px] text-zinc-700">Latest session · {lastBooking.service?.name ?? 'Studio session'} · {dateLabel(lastBooking.starts_at)}</p>}</div></div></Link>; })}</div></section>}

          <section className="mt-9"><div className="mb-4"><p className="text-[9px] font-mono uppercase tracking-[.18em] text-gold">Immediate coordination</p><h2 className="mt-1 text-xl">Session workrooms</h2></div>{visibleBookings.length ? <div className="space-y-2">{visibleBookings.map(booking => <Link key={booking.id} to={`/bookings/${booking.id}`} className="group flex flex-wrap items-center gap-4 rounded-xl border border-white/[.065] bg-white/[.015] p-4 hover:border-gold/20"><div className="grid h-10 w-10 place-items-center rounded-full bg-gold/[.08] text-gold"><MessageSquareText size={16}/></div><div className="min-w-48 flex-1"><div className="flex items-center gap-2"><h3 className="text-sm font-medium">{booking.service?.name ?? 'Studio session'}</h3><span className={`rounded-full px-2 py-0.5 text-[8px] font-mono ${booking.status === 'PENDING' ? 'bg-amber-500/10 text-amber-300' : booking.status === 'IN_PROGRESS' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/[.05] text-zinc-600'}`}>{booking.status.replaceAll('_', ' ')}</span></div><p className="mt-1 text-[10px] text-zinc-600">{personName(booking)} · {booking.room?.name ?? 'Room'} · {dateLabel(booking.starts_at)}</p></div><span className="text-xs text-zinc-700 group-hover:text-gold">Open thread →</span></Link>)}</div> : <div className="rounded-2xl border border-dashed border-white/[.08] p-10 text-center"><MessageSquareText className="mx-auto text-zinc-800" size={28}/><h3 className="mt-4 text-sm text-zinc-400">No standalone session workrooms</h3><p className="mt-2 text-xs text-zinc-700">Sessions linked to a project stay inside that project’s workroom.</p>{isArtist && <Link to="/book" className="mt-5 inline-block rounded-lg bg-dome px-4 py-2 text-xs font-semibold text-black">Book a session</Link>}</div>}</section>
        </>}
      </main>
    </div>
  );
}
