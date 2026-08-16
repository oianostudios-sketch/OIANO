/**
 * /passport — Shareable artist identity page.
 * Premium full-screen treatment: card hero + stats + creative DNA + strength ring.
 */
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';
import ArtistPassportCard from '../components/ArtistPassportCard';
import StudioCircleConsentCenter from '../components/StudioCircleConsentCenter';
import ReleaseArtwork from '../components/ReleaseArtwork';
import TrustSignal from '../components/TrustSignal';
import { useToast } from '../components/Toast';
import ArtistEmptyState from '../components/ArtistEmptyState';
import { AtSign, ChevronRight, Copy, Disc3, Download, ExternalLink, FolderKanban, Globe2, Headphones, MoreHorizontal, Music2, Plus, Radio, Share2, Video, X } from 'lucide-react';

const API_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', Icon: AtSign, color: '#E1306C', fill: 'linear-gradient(135deg,#833AB4,#E1306C 52%,#FCAF45)' },
  { key: 'tiktok', label: 'TikTok', mark: 'TT', color: '#25F4EE', fill: 'linear-gradient(135deg,#25F4EE,#111 48%,#FE2C55)' },
  { key: 'youtube', label: 'YouTube', Icon: Video, color: '#FF0033', fill: 'rgba(255,0,51,.14)' },
  { key: 'spotify', label: 'Spotify', mark: 'S', color: '#1ED760', fill: 'rgba(30,215,96,.14)' },
  { key: 'apple_music', label: 'Apple Music', Icon: Music2, color: '#FA243C', fill: 'rgba(250,36,60,.14)' },
  { key: 'soundcloud', label: 'SoundCloud', Icon: Headphones, color: '#FF5500', fill: 'rgba(255,85,0,.14)' },
  { key: 'bandcamp', label: 'Bandcamp', Icon: Radio, color: '#1DA0C3', fill: 'rgba(29,160,195,.14)' },
  { key: 'website', label: 'Website', Icon: Globe2, color: '#5A9BCB', fill: 'rgba(90,155,203,.14)' },
] as const;

// ── Profile strength ring ─────────────────────────────────────────────────────

// ── DNA chip ──────────────────────────────────────────────────────────────────

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '0.05em', padding: '4px 12px', borderRadius: 20,
      border: `1px solid ${color}35`, color, background: `${color}0a`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PassportPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const authArtist = user?.artist;
  const qc = useQueryClient();
  const toast = useToast();
  const [editingLinks, setEditingLinks] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const socialDockRef = useRef<HTMLDivElement>(null);
  const [socialCanScroll, setSocialCanScroll] = useState(false);
  const [linksDraft, setLinksDraft] = useState<Record<string, string>>({});
  const [locationDraft, setLocationDraft] = useState('');
  const [collaborationDraft, setCollaborationDraft] = useState('');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);
  const [pendingDeleteRelease, setPendingDeleteRelease] = useState<any>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState('');
  const emptyRelease = { title: '', release_type: 'SINGLE', release_date: '', external_url: '', artwork_url: '', collaborators: '', is_featured: false };
  const [releaseDraft, setReleaseDraft] = useState(emptyRelease);

  function updateSocialScrollCue() {
    const dock = socialDockRef.current;
    if (dock) setSocialCanScroll(dock.scrollLeft + dock.clientWidth < dock.scrollWidth - 4);
  }

  const { data: portfolioData, isLoading: passportLoading, isError: passportError, refetch: refetchPassport } = useQuery({
    queryKey: ['passport', 'portfolio'],
    queryFn: async () => (await api.get('/passport/portfolio')).data,
    enabled: !!authArtist,
  });

  const { data: rawBookings = [] } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const res = await api.get('/bookings');
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
    enabled: !!authArtist,
  });
  const { data: analytics } = useQuery({
    queryKey: ['passport', 'analytics'],
    queryFn: async () => (await api.get('/passport/analytics')).data,
    enabled: !!authArtist,
  });
  useEffect(() => {
    updateSocialScrollCue();
    window.addEventListener('resize', updateSocialScrollCue);
    return () => window.removeEventListener('resize', updateSocialScrollCue);
  }, [passportLoading, portfolioData]);

  const saveLinks = useMutation({
    mutationFn: () => api.patch('/passport/portfolio', {
      social_links: Object.fromEntries(Object.entries(linksDraft).filter(([, value]) => value.trim())),
      location: locationDraft.trim(),
      collaboration_interests: collaborationDraft.split(',').map(value => value.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['passport'] }); setEditingLinks(false); toast.success('Links updated'); },
    onError: () => toast.error('Use complete links beginning with https://'),
  });
  const addRelease = useMutation({
    mutationFn: async () => {
      const response = editingReleaseId ? await api.patch(`/passport/releases/${editingReleaseId}`, {
      ...releaseDraft,
      release_date: releaseDraft.release_date ? new Date(`${releaseDraft.release_date}T00:00:00.000Z`).toISOString() : null,
      external_url: releaseDraft.external_url || null,
      artwork_url: releaseDraft.artwork_url || null,
      collaborators: releaseDraft.collaborators.split(',').map(value => value.trim()).filter(Boolean),
    }) : await api.post('/passport/releases', {
      ...releaseDraft,
      release_date: releaseDraft.release_date ? new Date(`${releaseDraft.release_date}T00:00:00.000Z`).toISOString() : null,
      external_url: releaseDraft.external_url || null,
      artwork_url: releaseDraft.artwork_url || null,
      collaborators: releaseDraft.collaborators.split(',').map(value => value.trim()).filter(Boolean),
      });
      if (artworkFile) {
        const form = new FormData();
        form.append('artwork', artworkFile);
        await api.patch(`/passport/releases/${response.data.id}/artwork`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      return response;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['passport'] });
      setReleaseOpen(false);
      setEditingReleaseId(null);
      setArtworkFile(null);
      setArtworkPreview('');
      setReleaseDraft(emptyRelease);
      toast.success(editingReleaseId ? 'Release updated' : 'Release added');
    },
    onError: () => toast.error('Check the release details and links'),
  });
  const setProjectVisibility = useMutation({
    mutationFn: ({ id, is_public }: { id: string; is_public: boolean }) => api.patch(`/passport/projects/${id}/visibility`, { is_public }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passport'] }),
    onError: () => toast.error('Could not update project visibility'),
  });
  const deleteRelease = useMutation({
    mutationFn: (id: string) => api.delete(`/passport/releases/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['passport'] }); toast.success('Release removed'); },
    onError: () => toast.error('Could not remove release'),
  });

  if (!authArtist) {
    return (
      <div style={{ minHeight: '100vh', background: '#060606', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#3a3a3a', fontSize: 13 }}>No artist profile found.</p>
      </div>
    );
  }

  if (passportLoading) {
    return <div className="min-h-screen bg-[#060606] grid place-items-center text-zinc-400 text-sm">Loading your passport…</div>;
  }

  if (passportError) {
    return (
      <div className="min-h-screen bg-[#060606] grid place-items-center px-6 text-center">
        <div>
          <p className="text-white mb-3">We couldn’t load your artist passport.</p>
          <button type="button" onClick={() => refetchPassport()} className="text-sm text-[#C9A84C] border border-[#C9A84C]/40 rounded-lg px-4 py-2">Try again</button>
        </div>
      </div>
    );
  }

  const artist = (portfolioData?.artist ?? authArtist) as any;
  const bookings = (Array.isArray(rawBookings) ? rawBookings : (rawBookings as any)?.data ?? []) as any[];
  const passport = artist?.passport;
  const dna = (passport as any)?.creative_dna ?? {};
  const genres: string[]  = dna.genres ?? [];
  const themes: string[]  = dna.key_themes ?? [];
  const vocalType: string | null   = dna.vocal_type ?? null;
  const energy: string | null      = dna.energy_profile ?? null;
  const strength: number           = portfolioData?.score ?? (passport as any)?.profile_strength ?? 0;
  const passportCode: string       = (passport as any)?.passport_code ?? '——';

  const sessions = portfolioData?.stats?.sessions ?? bookings.length;
  const releases: any[] = artist?.releases ?? [];
  const projects: any[] = artist?.projects ?? [];
  const socialLinks: Record<string, string> = (passport as any)?.social_links ?? {};
  const connectedSocials = SOCIAL_PLATFORMS.filter(({ key }) => Boolean(socialLinks[key]));
  function openProfessionalDetails() {
    setLinksDraft(socialLinks);
    setLocationDraft((passport as any)?.location ?? '');
    setCollaborationDraft(((passport as any)?.collaboration_interests ?? []).join(', '));
    setEditingLinks(true);
  }
  async function sharePassport() {
    const url = `${window.location.origin}/p/${passportCode}`;
    try {
      if (navigator.share) await navigator.share({ title: `${artist.alias || artist.name} · OIANO Passport`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Public Passport link copied'); }
    } catch (error: any) {
      if (error?.name !== 'AbortError') toast.error('Could not share Passport');
    }
  }
  async function copyPassportLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/p/${passportCode}`);
    toast.success('Public Passport link copied');
  }
  const hours = Math.round(bookings.reduce((sum, b) => {
    if (!b.starts_at || !b.ends_at) return sum;
    return sum + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000;
  }, 0));
  const memberSince = (artist as any).created_at
    ? new Date((artist as any).created_at).getFullYear()
    : new Date().getFullYear();

  const hasDNA = genres.length || themes.length || vocalType || energy;

  return (
    <div className="pp-shell">
      <style>{`
        .pp-shell {
          --pp-chrome-offset: 28px;
          --pp-card-sticky-top: 87px;
          min-height: 100vh;
          background: #060606;
          color: #f5f5f5;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 24px 100px;
          position: relative;
          overflow-x: clip;
        }
        .pp-glow {
          position: fixed; top: -100px; left: 50%;
          transform: translateX(-50%);
          width: 800px; height: 800px; border-radius: 50%;
          background: radial-gradient(circle, rgba(201,168,76,0.045) 0%, transparent 62%);
          pointer-events: none; z-index: 0;
        }
        .pp-topbar {
          width: calc(100% + 48px); max-width: none;
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px max(24px, calc((100vw - 1040px) / 2));
          position: sticky; top: var(--pp-chrome-offset); z-index: 30;
          background: rgba(6,6,6,.88); border-bottom: 1px solid rgba(255,255,255,.055);
          backdrop-filter: blur(18px);
          margin-top: calc(var(--pp-chrome-offset) * -1);
        }
        body.has-live-bar .pp-shell {
          --pp-chrome-offset: 60px;
          --pp-card-sticky-top: 119px;
        }
        .pp-topbar-btn {
          font-size: 11px; color: #777; background: none;
          border: none; cursor: pointer; font-family: inherit;
          letter-spacing: 0.04em; transition: color 0.15s;
        }
        .pp-topbar-btn:hover { color: #ddd; }
        .pp-topbar-actions { display: flex; align-items: center; gap: 14px; }
        .pp-mobile-more { display: none; position: relative; }
        .pp-mobile-more summary { list-style: none; width: 34px; height: 32px; display: grid; place-items: center; cursor: pointer; color: #888; border: 1px solid #252525; border-radius: 9px; }
        .pp-mobile-more summary::-webkit-details-marker { display: none; }
        .pp-mobile-menu { position: absolute; top: 39px; right: 0; width: 190px; padding: 7px; border-radius: 11px; background: #111; border: 1px solid #292929; box-shadow: 0 18px 48px rgba(0,0,0,.55); }
        .pp-mobile-menu button { width: 100%; display: flex; align-items: center; gap: 9px; padding: 10px; border: 0; border-radius: 7px; background: transparent; color: #bbb; font: 11px inherit; text-align: left; cursor: pointer; }
        .pp-mobile-menu button:hover { background: #191919; color: #fff; }
        .pp-passport-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; letter-spacing: 0.26em;
          color: #555; text-transform: uppercase;
        }
        .pp-body {
          width: 100%; max-width: 1040px;
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 52px;
          align-items: start;
          position: relative; z-index: 1;
          min-width: 0;
        }
        .pp-card-col {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          position: sticky; top: var(--pp-card-sticky-top);
        }
        .pp-flip-hint {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; letter-spacing: 0.26em;
          color: #454545; text-transform: uppercase;
        }
        .pp-right {
          display: flex; flex-direction: column; gap: 20px;
          padding-top: 6px;
          width: 100%; min-width: 0;
        }
        .pp-name {
          font-family: 'Playfair Display', serif;
          font-size: 38px; font-weight: 700;
          color: #f0ede8; line-height: 1.1;
          letter-spacing: -0.01em;
        }
        .pp-alias {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px; color: #C9A84C;
          letter-spacing: 0.14em; margin-top: 5px;
        }
        .pp-social-wrap { margin-top: 18px; }
        .pp-social-heading { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 9px; }
        .pp-social-title { color: #8a8a8a; font: 9px 'JetBrains Mono',monospace; letter-spacing: .15em; text-transform: uppercase; }
        .pp-social-count { color: #555; font-size: 10px; }
        .pp-social-rail { position: relative; min-width: 0; }
        .pp-social-dock { display: grid; grid-auto-flow: column; grid-auto-columns: 54px; gap: 8px; overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: inline proximity; scrollbar-width: thin; scrollbar-color: #343434 transparent; padding: 2px 2px 8px; }
        .pp-social-cue { position: absolute; z-index: 2; right: 0; top: 0; bottom: 8px; width: 50px; border: 0; border-radius: 0 12px 12px 0; display: flex; align-items: center; justify-content: flex-end; padding-right: 7px; color: #d7bd72; cursor: pointer; background: linear-gradient(90deg,transparent 0%,rgba(7,7,7,.82) 58%,#070707 100%); transition: opacity .2s ease; }
        .pp-social-cue svg { border-radius: 50%; background: rgba(201,168,76,.14); box-shadow: 0 0 0 1px rgba(201,168,76,.25); animation: pp-cue-pulse 1.8s ease-in-out infinite; }
        @keyframes pp-cue-pulse { 0%,100% { transform: translateX(0); opacity: .75; } 50% { transform: translateX(3px); opacity: 1; } }
        .pp-social-item { min-width: 54px; height: 50px; border-radius: 12px; display: grid; place-items: center; text-decoration: none; cursor: pointer; position: relative; scroll-snap-align: start; transition: transform .18s ease,border-color .18s ease,filter .18s ease,opacity .18s ease; color: var(--social-color); background: var(--social-fill); }
        .pp-social-item.connected { border: 1px solid color-mix(in srgb,var(--social-color) 52%,transparent); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .pp-social-item.missing { border: 1px dashed color-mix(in srgb,var(--social-color) 32%,transparent); opacity: .58; filter: saturate(.65); }
        .pp-social-item:hover { transform: translateY(-2px); opacity: 1; filter: saturate(1.1) brightness(1.08); }
        .pp-social-add { position: absolute; right: 4px; bottom: 4px; width: 12px; height: 12px; border-radius: 50%; background: #1d2930; color: #8fc0df; display: grid; place-items: center; }
        .pp-stats {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 1px; background: #141414;
          border-radius: 10px; overflow: hidden;
          border: 1px solid #141414;
        }
        .pp-stat {
          background: #0e0e0e; padding: 15px 10px; text-align: center;
        }
        .pp-stat-val {
          font-family: 'Playfair Display', serif;
          font-size: 26px; font-weight: 700; color: #C9A84C; line-height: 1;
        }
        .pp-stat-lbl {
          font-size: 9px; color: #595959;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.12em; text-transform: uppercase; margin-top: 5px;
        }
        .pp-panel {
          background: linear-gradient(145deg,#0e0e0e,#0b0b0b); border: 1px solid #202020;
          border-radius: 14px; padding: 20px;
          width: 100%; min-width: 0; max-width: 100%; overflow: hidden;
        }
        .pp-panel-label {
          font-size: 9px; color: #626262;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.2em; text-transform: uppercase;
          margin-bottom: 12px;
        }
        .pp-chips {
          display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;
        }
        .pp-dna-cells {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;
        }
        .pp-dna-cell {
          background: #0a0a0a; border-radius: 8px; padding: 10px 12px;
        }
        .pp-dna-cell-lbl {
          font-size: 9px; color: #2a2a2a;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.1em; margin-bottom: 4px;
        }
        .pp-dna-cell-val { font-size: 12px; color: #888; }
        .pp-strength-row {
          display: flex; align-items: center; gap: 16px;
        }
        .pp-strength-info { flex: 1; }
        .pp-strength-title {
          font-size: 10px; color: #C9A84C;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.14em; text-transform: uppercase;
          margin-bottom: 5px;
        }
        .pp-strength-desc { font-size: 11px; color: #444; line-height: 1.55; }
        .pp-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .pp-btn {
          flex: 1; min-width: 90px; padding: 11px 14px;
          border-radius: 9px; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: inherit; text-align: center;
          text-decoration: none; border: 1px solid #1e1e1e;
          color: #666; background: none; display: inline-block;
          transition: color 0.15s, border-color 0.15s;
        }
        .pp-btn:hover { color: #ccc; border-color: #333; }
        .pp-btn-primary {
          background: #C9A84C; color: #000 !important;
          border-color: transparent !important; font-weight: 700;
        }
        .pp-btn-primary:hover { background: #d9bb62 !important; }
        .pp-details { width: 100%; min-width: 0; border: 1px solid #202020; border-radius: 14px; background: linear-gradient(145deg,#0e0e0e,#0a0a0a); overflow: hidden; }
        .pp-details > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 18px 20px; cursor: pointer; }
        .pp-details > summary::-webkit-details-marker { display: none; }
        .pp-details-heading { min-width: 0; }
        .pp-details-title { color: #d8d5cf; font-size: 13px; font-weight: 600; }
        .pp-details-subtitle { margin-top: 4px; color: #555; font-size: 10px; line-height: 1.5; }
        .pp-details-score { flex-shrink: 0; color: #d3b35c; font: 12px 'JetBrains Mono',monospace; }
        .pp-details-content { display: grid; gap: 12px; padding: 0 12px 12px; }
        .pp-details-content > .pp-panel { border-color: #191919; background: #0a0a0a; }
        .pp-share-backdrop { position: fixed; inset: 0; z-index: 220; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.78); backdrop-filter: blur(8px); }
        .pp-share-sheet { width: 100%; max-width: 430px; border-radius: 18px; padding: 22px; background: #101010; border: 1px solid #2b2b2b; box-shadow: 0 30px 100px rgba(0,0,0,.65); }
        .pp-share-header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
        .pp-share-close { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; border: 1px solid #292929; background: transparent; color: #777; cursor: pointer; }
        .pp-share-qr { width: 164px; margin: 22px auto 18px; padding: 10px; border-radius: 15px; background: white; line-height: 0; }
        .pp-share-url { padding: 11px 12px; border-radius: 9px; background: #090909; border: 1px solid #202020; color: #707070; font: 10px monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pp-share-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
        .pp-share-action { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; border-radius: 9px; border: 1px solid #292929; background: #131313; color: #bbb; font: 11px inherit; cursor: pointer; }
        .pp-share-action.primary { background: #d3b35c; border-color: #d3b35c; color: #080808; font-weight: 700; }
        @media (max-width: 800px) {
          .pp-shell { padding-inline: 18px; }
          .pp-body {
            grid-template-columns: 1fr;
            justify-items: center;
            width: 100%; max-width: 100%; min-width: 0;
          }
          .pp-card-col { position: relative; top: auto; }
          .pp-card-col > div:first-child { width: min(320px, calc(100vw - 48px)) !important; }
          .pp-right { width: 100%; max-width: 100%; min-width: 0; }
          .pp-name { font-size: 28px; }
          .pp-stats { grid-template-columns: repeat(2, 1fr); }
          .pp-social-dock { grid-auto-columns: 56px; }
          .pp-topbar { width: calc(100% + 36px); padding-inline: 18px; }
          .pp-passport-code { display: none; }
          .pp-topbar-actions { gap: 8px; }
          .pp-topbar-share { color: #d6bd70; border: 1px solid rgba(201,168,76,.24); border-radius: 9px; padding: 8px 10px; }
          .pp-topbar-export { display: none; }
          .pp-mobile-more { display: block; }
          .pp-actions { width: 100%; min-width: 0; }
          .pp-stats, .pp-social-wrap, .pp-social-dock { width: 100%; min-width: 0; max-width: 100%; }
        }
        @media print {
          .pp-topbar, .pp-actions { display: none !important; }
          .pp-shell { padding: 20px; }
          .pp-glow { display: none; }
        }
      `}</style>

      <div className="pp-glow" />

      {/* Top bar */}
      <div className="pp-topbar">
        <button className="pp-topbar-btn" onClick={() => navigate(-1)}>← Back</button>
        <span className="pp-passport-code">OIANO · {passportCode}</span>
        <div className="pp-topbar-actions">
          <button className="pp-topbar-btn pp-topbar-share" onClick={() => setShareOpen(true)}>Share Passport ↗</button>
          <button className="pp-topbar-btn pp-topbar-export" onClick={() => window.print()}>Save professional EPK ↗</button>
          <details className="pp-mobile-more">
            <summary aria-label="More Passport actions"><MoreHorizontal size={17} /></summary>
            <div className="pp-mobile-menu"><button type="button" onClick={() => window.print()}><Download size={14} /> Save professional EPK</button></div>
          </details>
        </div>
      </div>

      {/* Body */}
      <div className="pp-body">

        {/* Left: card */}
        <div className="pp-card-col">
          <ArtistPassportCard
            artist={{
              id: artist.id,
              name: artist.name,
              alias: artist.alias,
              avatar_url: (artist as any).avatar_url,
              bio: (artist as any).bio,
              passport: {
                passport_code: passportCode,
                profile_strength: strength,
                creative_dna: dna,
              },
            }}
            editable
            size="md"
          />
          <p className="pp-flip-hint">Select the card to see its reverse</p>
        </div>

        {/* Right: identity */}
        <div className="pp-right">

          {/* Name */}
          <div>
            <div className="pp-name">{artist.name}</div>
            {artist.alias && <div className="pp-alias">{artist.alias}</div>}
            {(passport as any)?.location && <div style={{ marginTop: 8, color: '#777', fontSize: 12 }}>{(passport as any).location}</div>}
            <div className="pp-social-wrap">
              <div className="pp-social-heading"><span className="pp-social-title">Artist links</span><span className="pp-social-count">{connectedSocials.length}/8 connected</span></div>
              <div className="pp-social-rail">
                <div ref={socialDockRef} className="pp-social-dock" aria-label="Artist social and streaming links" onScroll={updateSocialScrollCue}>
                  {SOCIAL_PLATFORMS.map(({ key, label, color, fill, ...platform }) => {
                    const url = socialLinks[key];
                    const content = <>{'Icon' in platform ? <platform.Icon size={17} strokeWidth={1.7} /> : <span style={{ fontSize: 10, fontWeight: 800 }}>{platform.mark}</span>}{!url && <span className="pp-social-add"><Plus size={8} strokeWidth={2.5} /></span>}</>;
                    return url
                      ? <a key={key} href={url} target="_blank" rel="noreferrer" className="pp-social-item connected" style={{ '--social-color': color, '--social-fill': fill } as React.CSSProperties} aria-label={`Open ${label}`} title={`Open ${label}`}>{content}</a>
                      : <button key={key} type="button" className="pp-social-item missing" style={{ '--social-color': color, '--social-fill': fill } as React.CSSProperties} onClick={openProfessionalDetails} aria-label={`Connect ${label}`} title={`Connect ${label}`}>{content}</button>;
                  })}
                </div>
                {socialCanScroll && <button type="button" className="pp-social-cue" aria-label="Show more artist platforms" onClick={() => socialDockRef.current?.scrollBy({ left: 186, behavior: 'smooth' })}><ChevronRight size={22} strokeWidth={1.7} /></button>}
              </div>
              <button type="button" className="pp-btn" style={{ marginTop: 10, width: '100%' }} onClick={openProfessionalDetails}>
                {connectedSocials.length ? 'Manage artist links' : 'Connect your artist channels'}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="pp-stats">
            {[
              { val: sessions, lbl: 'Sessions' },
              { val: portfolioData?.stats?.releases ?? releases.length, lbl: 'Releases' },
              { val: portfolioData?.stats?.active_projects ?? 0, lbl: 'Active projects' },
              { val: portfolioData?.stats?.completed_projects ?? 0, lbl: 'Completed' },
              { val: hours, lbl: 'Studio hours' },
              { val: analytics?.total_unique_views ?? (passport as any)?.profile_views ?? 0, lbl: 'Unique views' },
            ].map(s => (
              <div key={s.lbl} className="pp-stat">
                <div className="pp-stat-val">{s.val}</div>
                <div className="pp-stat-lbl">{s.lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: '#555', fontSize: 10, fontFamily: 'monospace', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            <span>OIANO member since {memberSince}</span><span>{passportCode}</span>
          </div>

          <StudioCircleConsentCenter artistName={artist.alias ?? artist.name} avatarUrl={(artist as any).avatar_url} />

          {/* Released work */}
          <div className="pp-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="pp-panel-label" style={{ marginBottom: 0 }}>Release catalogue</div>
              <button type="button" className="pp-btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingReleaseId(null); setArtworkFile(null); setArtworkPreview(''); setReleaseDraft(emptyRelease); setReleaseOpen(true); }}>+ Add release</button>
            </div>
            {releases.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {releases.map((release) => (
                  <div key={release.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 12, alignItems: 'center', padding: 10, borderRadius: 10, background: '#0a0a0a', border: '1px solid #181818', color: 'inherit' }}>
                    <ReleaseArtwork src={release.artwork_url} title={release.title} artist={artist.alias ?? artist.name} size={52} featured={release.is_featured} />
                    <div><div style={{ color: '#eee', fontSize: 13 }}>{release.title}</div><div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>{release.release_type}{release.release_date ? ` · ${new Date(release.release_date).getFullYear()}` : ''}{release.is_featured ? ' · FEATURED' : ''}</div>{release.collaborators?.length > 0 && <div style={{ color: '#444', fontSize: 10, marginTop: 3 }}>with {release.collaborators.join(', ')}</div>}</div>
                    <div style={{ display: 'flex', gap: 8 }}>{release.external_url && <a href={release.external_url} target="_blank" rel="noreferrer" aria-label={`Open ${release.title}`} style={{ color: '#C9A84C', textDecoration: 'none' }}>↗</a>}<button type="button" aria-label={`Edit ${release.title}`} onClick={() => { setEditingReleaseId(release.id); setArtworkFile(null); setArtworkPreview(''); setReleaseDraft({ title: release.title, release_type: release.release_type, release_date: release.release_date ? String(release.release_date).slice(0, 10) : '', external_url: release.external_url ?? '', artwork_url: release.artwork_url ?? '', collaborators: (release.collaborators ?? []).join(', '), is_featured: release.is_featured }); setReleaseOpen(true); }} style={{ color: '#777', background: 'none', border: 0, cursor: 'pointer' }}>Edit</button><button type="button" aria-label={`Remove ${release.title}`} onClick={() => setPendingDeleteRelease(release)} style={{ color: '#633', background: 'none', border: 0, cursor: 'pointer' }}>×</button></div>
                  </div>
                ))}
              </div>
            ) : <ArtistEmptyState compact icon={Disc3} title="Give your sound a cover" description="Add your first release to turn this Passport into a shareable body of work." actionLabel="Add a release" onAction={() => { setEditingReleaseId(null); setArtworkFile(null); setArtworkPreview(''); setReleaseDraft(emptyRelease); setReleaseOpen(true); }} />}
          </div>

          {/* Public work in progress */}
          <div className="pp-panel">
            <div className="pp-panel-label">Work in progress</div>
            {projects.length ? projects.map((project) => (
              <div key={project.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid #171717' }}>
                <span style={{ color: '#ddd', fontSize: 13 }}>{project.title}</span>
                <span style={{ color: '#5A9BCB', fontSize: 10, fontFamily: 'monospace' }}>{project.phase.replaceAll('_', ' ')}</span>
              </div>
            )) : <ArtistEmptyState compact icon={FolderKanban} title="Show what you’re building" description="Studio projects can become public proof of your creative momentum." actionLabel="Open Projects" to="/projects" />}
            {(portfolioData?.project_options?.length ?? 0) > 0 && (
              <details style={{ marginTop: 14 }}>
                <summary style={{ color: '#777', fontSize: 11, cursor: 'pointer' }}>Manage project visibility</summary>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {portfolioData.project_options.map((project: any) => (
                    <label key={project.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: '#aaa', fontSize: 12 }}>
                      <span>{project.title} · {project.phase.replaceAll('_', ' ')}</span>
                      <input type="checkbox" checked={project.is_public} onChange={(event) => setProjectVisibility.mutate({ id: project.id, is_public: event.target.checked })} />
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>

          <details className="pp-details">
            <summary>
              <div className="pp-details-heading"><div className="pp-details-title">Passport details</div><div className="pp-details-subtitle">Strength, Creative DNA, verification, sharing and audience insights</div></div>
              <span className="pp-details-score">{strength}%</span>
            </summary>
            <div className="pp-details-content">

          {/* Transparent score */}
          <div className="pp-panel">
            <div className="pp-panel-label">Passport strength · {strength}%</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {(portfolioData?.score_breakdown ?? []).map((item: any) => (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}><span style={{ color: '#888' }}>{item.label}</span><span style={{ color: item.earned === item.max ? '#4ade80' : '#C9A84C', fontFamily: 'monospace' }}>{item.earned}/{item.max}%</span></div>
                  <div style={{ height: 3, background: '#1c1c1c', borderRadius: 4 }}><div style={{ height: '100%', width: `${(item.earned / item.max) * 100}%`, background: item.earned === item.max ? '#4ade80' : '#C9A84C', borderRadius: 4 }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="pp-panel">
            <div className="pp-panel-label">What your Passport proves</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <TrustSignal kind="passport" />
              <TrustSignal kind="studio" />
              <TrustSignal kind="artist" />
            </div>
          </div>

          {/* Creative DNA */}
          <div className="pp-panel">
            <div className="pp-panel-label">Creative DNA</div>
            {genres.length > 0 && (
              <div className="pp-chips">
                {genres.map(g => <Chip key={g} label={g} color="#C9A84C" />)}
              </div>
            )}
            {themes.length > 0 && (
              <div className="pp-chips">
                {themes.map(t => <Chip key={t} label={t} color="#3B8BFF" />)}
              </div>
            )}
            {(vocalType || energy) && (
              <div className="pp-dna-cells">
                {vocalType && (
                  <div className="pp-dna-cell">
                    <div className="pp-dna-cell-lbl">Vocal type</div>
                    <div className="pp-dna-cell-val">{vocalType}</div>
                  </div>
                )}
                {energy && (
                  <div className="pp-dna-cell">
                    <div className="pp-dna-cell-lbl">Energy profile</div>
                    <div className="pp-dna-cell-val">{energy}</div>
                  </div>
                )}
              </div>
            )}
            {!hasDNA && (
              <p style={{ fontSize: 12, color: '#2a2a2a', fontStyle: 'italic', margin: 0 }}>
                No creative DNA yet — edit your profile to define your sound.
              </p>
            )}
          </div>

          <div className="pp-panel">
            <div className="pp-panel-label">Public Passport views · 7 days</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end', height: 80 }}>
              {(analytics?.last_7_days ?? []).map((day: any) => {
                const peak = Math.max(1, ...(analytics?.last_7_days ?? []).map((entry: any) => entry.views));
                return <div key={day.date} title={`${day.date}: ${day.views} unique view${day.views === 1 ? '' : 's'}`} style={{ display: 'flex', height: '100%', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}><span style={{ color: '#777', fontSize: 9 }}>{day.views}</span><div style={{ width: '100%', minHeight: 3, height: `${Math.max(4, (day.views / peak) * 52)}px`, background: day.views ? '#C9A84C' : '#202020', borderRadius: '4px 4px 1px 1px' }} /><span style={{ color: '#444', fontSize: 8 }}>{new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' })}</span></div>;
              })}
            </div>
            <p style={{ color: '#444', fontSize: 10, marginTop: 12 }}>One view per visitor per day. Raw addresses are never stored.</p>
          </div>

            </div>
          </details>

        </div>
      </div>

      {shareOpen && (
        <div className="pp-share-backdrop" role="presentation" onClick={() => setShareOpen(false)}>
          <div className="pp-share-sheet" role="dialog" aria-modal="true" aria-labelledby="passport-share-title" onClick={(event) => event.stopPropagation()}>
            <div className="pp-share-header"><div><h2 id="passport-share-title" style={{ margin: 0, fontFamily: "'Playfair Display',serif", fontSize: 23 }}>Share your Passport</h2><p style={{ margin: '5px 0 0', color: '#666', fontSize: 11 }}>One link for collaborators, studios, press and fans.</p></div><button className="pp-share-close" type="button" onClick={() => setShareOpen(false)} aria-label="Close share options"><X size={15} /></button></div>
            <div className="pp-share-qr"><img src={`/api/passport/public/${encodeURIComponent(passportCode)}/qr.png`} alt="QR code for public Passport" width="144" height="144" style={{ display: 'block' }} /></div>
            <div className="pp-share-url">{window.location.origin}/p/{passportCode}</div>
            <div className="pp-share-actions"><button type="button" className="pp-share-action primary" onClick={copyPassportLink}><Copy size={14} /> Copy link</button><button type="button" className="pp-share-action" onClick={sharePassport}><Share2 size={14} /> Share</button><a className="pp-share-action" href={`/p/${encodeURIComponent(passportCode)}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Preview</a><button type="button" className="pp-share-action" onClick={() => window.print()}><Download size={14} /> Save EPK</button></div>
          </div>
        </div>
      )}

      {editingLinks && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setEditingLinks(false)}>
          <div role="dialog" aria-modal="true" aria-label="Social and streaming links" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', background: '#101010', border: '1px solid #292929', borderRadius: 16, padding: 24 }} onClick={(event) => event.stopPropagation()}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, marginBottom: 5 }}>Professional details</h2>
            <p style={{ color: '#666', fontSize: 12, marginBottom: 18 }}>Add context for collaborators, then paste complete public links.</p>
            <label style={{ display: 'block', color: '#888', fontSize: 11, marginBottom: 12 }}>Creative base / location<input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} placeholder="Lagos · London · New York" maxLength={120} style={{ width: '100%', marginTop: 5, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '10px 12px', color: '#fff' }} /></label>
            <label style={{ display: 'block', color: '#888', fontSize: 11, marginBottom: 18 }}>Open to collaborating on<input value={collaborationDraft} onChange={(event) => setCollaborationDraft(event.target.value)} placeholder="Features, songwriting, live shows" style={{ width: '100%', marginTop: 5, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '10px 12px', color: '#fff' }} /></label>
            {['instagram','tiktok','youtube','spotify','apple_music','soundcloud','bandcamp','website'].map((platform) => (
              <label key={platform} style={{ display: 'block', color: '#888', fontSize: 11, marginBottom: 12, textTransform: 'capitalize' }}>
                {platform.replace('_', ' ')}
                <input value={linksDraft[platform] ?? ''} onChange={(event) => setLinksDraft({ ...linksDraft, [platform]: event.target.value })} placeholder="https://" style={{ width: '100%', marginTop: 5, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '10px 12px', color: '#fff' }} />
              </label>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><button className="pp-btn" style={{ flex: 1 }} onClick={() => setEditingLinks(false)}>Cancel</button><button className="pp-btn pp-btn-primary" style={{ flex: 1 }} onClick={() => saveLinks.mutate()} disabled={saveLinks.isPending}>{saveLinks.isPending ? 'Saving…' : 'Save links'}</button></div>
          </div>
        </div>
      )}

      {releaseOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setReleaseOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Add release" style={{ width: '100%', maxWidth: 480, background: '#101010', border: '1px solid #292929', borderRadius: 16, padding: 24 }} onClick={(event) => event.stopPropagation()}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, marginBottom: 18 }}>{editingReleaseId ? 'Edit release' : 'Add released work'}</h2>
            <input value={releaseDraft.title} onChange={(event) => setReleaseDraft({ ...releaseDraft, title: event.target.value })} placeholder="Release title" style={{ width: '100%', marginBottom: 12, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '11px 12px', color: '#fff' }} />
            <select value={releaseDraft.release_type} onChange={(event) => setReleaseDraft({ ...releaseDraft, release_type: event.target.value })} style={{ width: '100%', marginBottom: 12, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '11px 12px', color: '#fff' }}>{['SINGLE','EP','ALBUM','MIXTAPE','VIDEO'].map(type => <option key={type}>{type}</option>)}</select>
            <label style={{ display: 'block', color: '#777', fontSize: 11, marginBottom: 12 }}>Release date<input type="date" value={releaseDraft.release_date} onChange={(event) => setReleaseDraft({ ...releaseDraft, release_date: event.target.value })} style={{ width: '100%', marginTop: 5, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '11px 12px', color: '#fff' }} /></label>
            <input value={releaseDraft.external_url} onChange={(event) => setReleaseDraft({ ...releaseDraft, external_url: event.target.value })} placeholder="Spotify, Apple Music or YouTube URL" style={{ width: '100%', marginBottom: 12, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '11px 12px', color: '#fff' }} />
            <input value={releaseDraft.artwork_url} onChange={(event) => setReleaseDraft({ ...releaseDraft, artwork_url: event.target.value })} placeholder="Artwork image URL" style={{ width: '100%', marginBottom: 12, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '11px 12px', color: '#fff' }} />
            <label style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, alignItems: 'center', border: '1px dashed #303030', borderRadius: 10, padding: 10, marginBottom: 12, color: '#888', fontSize: 11, cursor: 'pointer' }}>
              <div style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: '#080808', display: 'grid', placeItems: 'center' }}>{(artworkPreview || releaseDraft.artwork_url) ? <img src={artworkPreview || (releaseDraft.artwork_url.startsWith('/') ? `${API_ORIGIN}${releaseDraft.artwork_url}` : releaseDraft.artwork_url)} alt="Artwork preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '♪'}</div>
              <span><strong style={{ color: '#ddd', display: 'block', marginBottom: 4 }}>Upload cover artwork</strong>JPG, PNG or WebP · maximum 10 MB</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { toast.error('Artwork must be 10 MB or smaller'); return; } setArtworkFile(file); setArtworkPreview(URL.createObjectURL(file)); }} />
            </label>
            <input value={releaseDraft.collaborators} onChange={(event) => setReleaseDraft({ ...releaseDraft, collaborators: event.target.value })} placeholder="Collaborators, separated by commas" style={{ width: '100%', marginBottom: 12, background: '#080808', border: '1px solid #252525', borderRadius: 8, padding: '11px 12px', color: '#fff' }} />
            <label style={{ display: 'flex', gap: 8, color: '#888', fontSize: 12, marginBottom: 18 }}><input type="checkbox" checked={releaseDraft.is_featured} onChange={(event) => setReleaseDraft({ ...releaseDraft, is_featured: event.target.checked })} /> Feature this release</label>
            <div style={{ display: 'flex', gap: 10 }}><button className="pp-btn" style={{ flex: 1 }} onClick={() => { setReleaseOpen(false); setEditingReleaseId(null); setArtworkFile(null); setArtworkPreview(''); }}>Cancel</button><button className="pp-btn pp-btn-primary" style={{ flex: 1 }} onClick={() => addRelease.mutate()} disabled={!releaseDraft.title || addRelease.isPending}>{addRelease.isPending ? (artworkFile ? 'Uploading…' : 'Saving…') : editingReleaseId ? 'Save changes' : 'Add release'}</button></div>
          </div>
        </div>
      )}

      {pendingDeleteRelease && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setPendingDeleteRelease(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-release-title" style={{ width: '100%', maxWidth: 400, background: '#101010', border: '1px solid #392020', borderRadius: 16, padding: 24 }} onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-release-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 21 }}>Remove “{pendingDeleteRelease.title}”?</h2><p style={{ color: '#777', fontSize: 12, margin: '8px 0 20px' }}>This removes it from your private and public Passport. It does not affect the release on streaming platforms.</p>
            <div style={{ display: 'flex', gap: 10 }}><button className="pp-btn" style={{ flex: 1 }} onClick={() => setPendingDeleteRelease(null)}>Keep release</button><button className="pp-btn" style={{ flex: 1, color: '#fca5a5', borderColor: '#5f2828' }} onClick={() => { deleteRelease.mutate(pendingDeleteRelease.id); setPendingDeleteRelease(null); }}>Remove</button></div>
          </div>
        </div>
      )}
    
    </div>
  );
}
