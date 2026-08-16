import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import ArtistAvatar from '../components/ArtistAvatar';
import ReleaseArtwork from '../components/ReleaseArtwork';
import TrustSignal from '../components/TrustSignal';
import OianoBrand from '../components/OianoBrand';

export default function PublicPassportPage() {
  const { code } = useParams();
  const viewer = useAuthStore((state) => state.user);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-passport', code],
    queryFn: async () => (await api.get(`/passport/public/${encodeURIComponent(code ?? '')}`)).data,
    enabled: !!code,
    retry: 1,
  });

  if (isLoading) return <main className="min-h-screen bg-[#070707] grid place-items-center text-zinc-500">Opening artist Passport…</main>;
  if (isError || !data?.artist) return <main className="min-h-screen bg-[#070707] grid place-items-center text-center px-6"><div><h1 className="text-2xl text-white mb-2">Passport unavailable</h1><p className="text-zinc-500">This link may be invalid or no longer public.</p></div></main>;

  const { artist, stats, score } = data;
  const passport = artist.passport ?? {};
  const dna = passport.creative_dna ?? {};
  const links = Object.entries(passport.social_links ?? {}) as [string, string][];
  const isOwner = viewer?.artist?.id === artist.id;
  const connectPath = `/connect/${artist.id}`;
  const collaborationHref = viewer?.role === 'ARTIST' ? connectPath : `/enter?next=${encodeURIComponent(connectPath)}`;

  return (
    <main className="min-h-screen bg-[#070707] text-white px-5 py-8 md:px-10 md:py-12">
      <style>{`@media print { .public-passport-actions { display:none !important } body { background:#070707 !important; print-color-adjust:exact; -webkit-print-color-adjust:exact } }`}</style>
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between gap-4 mb-12">
          <Link to="/enter" className="no-underline"><OianoBrand variant="compact" size={18}/></Link>
          <div className="flex items-center gap-4"><span className="font-mono text-[10px] text-zinc-600 tracking-[.15em]">OIANO PASSPORT · {passport.passport_code}</span><button type="button" onClick={() => window.print()} className="public-passport-actions text-[10px] text-[#C9A84C] border border-[#C9A84C]/30 rounded-lg px-3 py-2 bg-transparent">SAVE EPK</button></div>
        </header>

        <section className="grid md:grid-cols-[180px_1fr] gap-8 items-center pb-10 border-b border-zinc-900">
          <ArtistAvatar src={artist.avatar_url} name={artist.alias || artist.name} size={160} shape="portrait" />
          <div>
            <div className="flex flex-wrap gap-2 items-center mb-3"><span className="text-[10px] font-mono tracking-widest text-emerald-400">● {artist.status.replaceAll('_', ' ')}</span>{passport.location && <span className="text-xs text-zinc-500">· {passport.location}</span>}</div>
            <h1 className="font-display text-5xl md:text-7xl leading-none">{artist.alias || artist.name}</h1>
            {artist.alias && <p className="text-zinc-500 mt-2">{artist.name}</p>}
            {artist.bio && <p className="text-zinc-300 max-w-2xl mt-5 leading-7">{artist.bio}</p>}
            <div className="flex flex-wrap gap-2 mt-6">{links.map(([platform, url]) => <a key={platform} href={url} target="_blank" rel="noreferrer" className="px-3 py-2 border border-zinc-800 rounded-lg text-xs text-zinc-300 no-underline hover:border-[#C9A84C]">{platform.replace('_', ' ')} ↗</a>)}</div>
            <div className="public-passport-actions flex flex-wrap items-center gap-3 mt-7">
              {isOwner ? <Link to="/artist/passport" className="px-5 py-3 rounded-lg bg-[#C9A84C] text-black text-sm font-semibold no-underline">Manage my Passport</Link> : artist.status === 'UNAVAILABLE' ? <span className="px-5 py-3 rounded-lg border border-zinc-800 text-zinc-600 text-sm">Not accepting collaborations</span> : <Link to={collaborationHref} className="px-5 py-3 rounded-lg bg-[#C9A84C] text-black text-sm font-semibold no-underline">Connect with {artist.alias || artist.name}</Link>}
              {(passport.collaboration_interests?.length ?? 0) > 0 && <span className="text-xs text-zinc-500">Open to {passport.collaboration_interests.join(' · ')}</span>}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-px bg-zinc-900 border border-zinc-900 rounded-xl overflow-hidden my-8">
          {[[stats.releases,'Releases'],[stats.active_projects,'Active projects'],[stats.completed_projects,'Completed'],[stats.sessions,'Sessions'],[`${score}%`,'Passport']].map(([value,label]) => <div key={String(label)} className="bg-[#0c0c0c] p-5"><div className="text-2xl font-display text-[#C9A84C]">{value}</div><div className="text-[9px] uppercase tracking-widest text-zinc-600 mt-1">{label}</div></div>)}
        </section>
        <section className="mt-5 grid gap-2 md:grid-cols-3" aria-label="Passport trust signals">
          <TrustSignal kind="passport" />
          <TrustSignal kind="studio" />
          <TrustSignal kind="artist" />
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="border border-zinc-900 rounded-2xl p-6"><p className="text-[10px] uppercase tracking-[.2em] text-zinc-600 mb-5">Released work</p>{artist.releases.length ? <div className="space-y-3">{artist.releases.map((release: any) => <a key={release.id} href={release.external_url || undefined} target="_blank" rel="noreferrer" className={`flex gap-4 items-center p-3 bg-zinc-950 border rounded-xl no-underline ${release.is_featured ? 'border-[#C9A84C]/25' : 'border-zinc-900'}`}><ReleaseArtwork src={release.artwork_url} title={release.title} artist={artist.alias || artist.name} size={56} featured={release.is_featured} /><div><div className="text-white">{release.title}</div><div className="text-[10px] text-zinc-600 mt-1">{release.release_type}{release.is_featured ? ' · FEATURED RELEASE' : ''}</div></div></a>)}</div> : <p className="text-sm text-zinc-600">No public releases yet.</p>}</section>
          <section className="border border-zinc-900 rounded-2xl p-6"><p className="text-[10px] uppercase tracking-[.2em] text-zinc-600 mb-5">Currently creating</p>{artist.projects.length ? <div className="space-y-3">{artist.projects.map((project: any) => <div key={project.id} className="flex justify-between gap-4 p-3 bg-zinc-950 border border-zinc-900 rounded-xl"><span>{project.title}</span><span className="text-[10px] text-[#5A9BCB] font-mono">{project.phase.replaceAll('_', ' ')}</span></div>)}</div> : <p className="text-sm text-zinc-600">No public projects right now.</p>}</section>
        </div>

        <section className="mt-6 border border-zinc-900 rounded-2xl p-6"><p className="text-[10px] uppercase tracking-[.2em] text-zinc-600 mb-5">Creative DNA</p><div className="flex flex-wrap gap-2">{[...(dna.genres ?? []), ...(dna.key_themes ?? []), ...(passport.collaboration_interests ?? [])].map((item: string) => <span key={item} className="px-3 py-1.5 rounded-full border border-[#C9A84C]/20 text-[#C9A84C] text-xs">{item}</span>)}</div></section>
        <footer className="mt-14 flex flex-col items-center gap-4 text-center text-[10px] tracking-widest text-zinc-700"><img src={`/api/passport/public/${encodeURIComponent(passport.passport_code)}/qr.png`} alt="QR code for this Passport" width="108" height="108" className="rounded-lg bg-white p-2" /><span>OIANO-ISSUED CREATIVE PASSPORT · STUDIO ACTIVITY VERIFIED FROM OIANO RECORDS</span></footer>
      </div>
    </main>
  );
}
