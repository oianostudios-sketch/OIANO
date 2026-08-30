import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Building2, CalendarCheck, MapPin, Music2, ShieldCheck, Star, Users } from 'lucide-react';
import { api } from '../lib/api';
import ArtistAvatar from '../components/ArtistAvatar';

export default function StudioPassportPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: studio, isLoading, isError } = useQuery({
    queryKey: ['studio-passport', slug],
    queryFn: async () => (await api.get(`/studio/passport/${slug}`)).data,
    enabled: !!slug,
  });

  if (isLoading) return <main className="min-h-screen grid place-items-center bg-studio-bg text-zinc-600">Verifying studio…</main>;
  if (isError || !studio) return <main className="min-h-screen grid place-items-center bg-studio-bg text-zinc-500">Studio Passport unavailable.</main>;

  const proof = studio.proof;
  return (
    <main className="min-h-screen bg-studio-bg text-white">
      <section className="relative isolate min-h-[430px] overflow-hidden border-b border-white/[.07]">
        {studio.image_url && <img src={studio.image_url} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-40" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/80 to-black/20" />
        <div className="mx-auto flex min-h-[430px] max-w-6xl flex-col justify-end px-6 py-14">
          <div className="mb-5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.22em] text-emerald-400"><ShieldCheck size={14}/> OIANO verified studio</div>
          <h1 className="max-w-3xl text-4xl font-medium tracking-tight sm:text-6xl">{studio.name}</h1>
          <p className="mt-4 flex items-center gap-2 text-sm text-zinc-400"><MapPin size={14}/>{studio.address ?? 'Location available on booking'}</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link to={`/book?studio=${studio.id}`} className="rounded-full bg-[#C9A84C] px-6 py-3 text-xs font-semibold text-black">Book this studio</Link><span className="rounded-full border border-white/10 px-5 py-3 text-xs text-zinc-400">{studio.timezone}</span></div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.07] md:grid-cols-4">
          {[
            [CalendarCheck, proof.completed_sessions, 'Verified sessions'],
            [Users, proof.artists_served, 'Artists served'],
            [Building2, studio.rooms.length, 'Active rooms'],
            [Star, proof.average_rating ?? 'New', proof.average_rating ? `${proof.verified_reviews} verified reviews` : 'Rating building'],
          ].map(([Icon, value, label]: any) => <div key={label} className="metric-enter bg-studio-surface p-6"><Icon size={15} className="mb-5 text-[#C9A84C]"/><strong className="block text-2xl">{value}</strong><span className="mt-1 block text-[10px] text-zinc-600">{label}</span></div>)}
        </section>

        <section><p className="mb-4 text-[10px] font-mono uppercase tracking-[.2em] text-zinc-600">Rooms & capability</p><div className="grid gap-4 md:grid-cols-2">{studio.rooms.map((room: any) => <article key={room.id} className="overflow-hidden rounded-2xl border border-white/[.07] bg-studio-surface">{room.image_url && <img src={room.image_url} alt={room.name} className="h-48 w-full object-cover"/>}<div className="p-5"><h2 className="text-lg">{room.name}</h2><p className="mt-2 text-xs leading-5 text-zinc-500">{room.description ?? 'Professionally managed production space.'}</p><div className="mt-4 flex flex-wrap gap-2">{room.amenities?.map((item: string) => <span key={item} className="rounded-full border border-white/[.07] px-3 py-1 text-[9px] text-zinc-500">{item}</span>)}</div></div></article>)}</div></section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]"><div><p className="mb-4 text-[10px] font-mono uppercase tracking-[.2em] text-zinc-600">Services</p><div className="space-y-2">{studio.services.map((service: any) => <div key={service.id} className="flex items-center justify-between rounded-xl border border-white/[.06] bg-studio-surface p-4"><div><strong className="text-sm font-medium">{service.name}</strong><p className="mt-1 text-[10px] text-zinc-600">{service.description ?? service.category.replaceAll('_',' ')}</p></div><span className="text-xs text-[#C9A84C]">from ${Number(service.min_price_usd).toFixed(0)} / {service.unit}</span></div>)}</div></div><div><p className="mb-4 text-[10px] font-mono uppercase tracking-[.2em] text-zinc-600">Studio Circle</p><div className="rounded-2xl border border-white/[.06] bg-studio-surface p-5">{studio.circle.length ? <div className="grid grid-cols-3 gap-4">{studio.circle.map((member: any, index: number) => <div key={`${member.artist.name}-${index}`} className="text-center"><ArtistAvatar name={member.artist.name} src={member.artist.avatar_url} size={48}/><p className="mt-2 truncate text-[10px] text-zinc-400">{member.artist.name}</p>{member.session_count && <p className="text-[8px] text-zinc-700">{member.session_count} sessions</p>}</div>)}</div> : <p className="text-xs leading-5 text-zinc-600">Artists appear here only after explicitly joining this studio’s Circle.</p>}</div></div></section>

        <footer className="flex items-center justify-between border-t border-white/[.06] py-8 text-[10px] text-zinc-700"><span className="flex items-center gap-2"><Music2 size={13}/> OIANO Studio Passport</span><span>Operational proof · artist-controlled visibility</span></footer>
      </div>
    </main>
  );
}
