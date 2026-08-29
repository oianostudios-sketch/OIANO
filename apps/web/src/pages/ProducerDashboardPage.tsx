// apps/web/src/pages/ProducerDashboardPage.tsx
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ProducerNav } from '../components/ProducerNav';
import { initials } from '../components/ArtistAvatar';

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase =
  | 'PRE_PRODUCTION' | 'TRACKING' | 'EDITING'
  | 'MIXING' | 'MASTERING' | 'DELIVERED';

interface Artist {
  id: string; name: string; alias: string | null; avatar_url: string | null;
}

interface Project {
  id: string;
  title: string;
  phase: Phase;
  notes: string | null;
  is_active: boolean;
  last_session_at: string | null;
  updated_at: string;
  artist: Artist | null;
}

interface ProducerProfile {
  id: string;
  name: string;
  alias: string | null;
  bio: string | null;
  avatar_url: string | null;
  open_to_collabs: boolean;
  passport: {
    passport_code: string;
    genres_produced: string[];
    signature_tags: string[];
    profile_strength: number;
  } | null;
  projects: Project[];
}

// ── Phase config ──────────────────────────────────────────────────────────────
const PHASES: { key: Phase; label: string; color: string; dot: string }[] = [
  { key: 'PRE_PRODUCTION', label: 'Pre-Production', color: 'rgba(59,139,255,0.12)', dot: '#3B8BFF' },
  { key: 'TRACKING',       label: 'Tracking',       color: 'rgba(29,158,117,0.12)', dot: '#1D9E75' },
  { key: 'EDITING',        label: 'Editing',        color: 'rgba(139,92,246,0.12)', dot: '#8B5CF6' },
  { key: 'MIXING',         label: 'Mixing',         color: 'rgba(232,130,58,0.12)', dot: '#E8823A' },
  { key: 'MASTERING',      label: 'Mastering',      color: 'rgba(201,168,76,0.12)', dot: '#C9A84C' },
  { key: 'DELIVERED',      label: 'Delivered',      color: 'rgba(255,255,255,0.04)', dot: '#666' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function ago(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// last_session_at was fetched into every project object and never shown —
// updated_at fires on any edit (moving a phase pill counts), so it can't
// tell you whether the artist has actually been in the room recently.
function sessionWarmth(lastSessionAt: string | null): { text: string; color: string } | null {
  if (!lastSessionAt) return null;
  const days = Math.floor((Date.now() - new Date(lastSessionAt).getTime()) / 86_400_000);
  if (days < 1)  return { text: 'Session today',              color: '#5A9BCB' };
  if (days < 7)  return { text: `Last session ${days}d ago`,  color: '#666' };
  if (days < 14) return { text: `${days}d since last session`, color: '#888' };
  return { text: `Cold — ${days}d since last session`, color: '#D6567F' };
}

// ── Setup gate — shown when no producer profile exists ───────────────────────
function ProducerSetupGate({ onSetup }: { onSetup: (p: ProducerProfile) => void }) {
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSetup = async () => {
    if (!name.trim()) { setErr('Name is required'); return; }
    setLoading(true); setErr('');
    try {
      const { data } = await api.post('/producer/setup', { name: name.trim(), alias: alias.trim() || undefined, bio: bio.trim() || undefined });
      onSetup(data);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? `Setup failed (${e?.response?.status ?? 'no response'})`);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(59,139,255,0.15)', border: '1px solid rgba(59,139,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', fontSize: 22 }}>
            🎛️
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontFamily: 'var(--font-display, Playfair Display)', color: 'var(--text-primary, #fff)', fontWeight: 700 }}>
            Producer Space
          </h1>
          <p style={{ marginTop: '0.5rem', color: 'var(--text-muted, #888)', fontSize: '0.95rem' }}>
            Set up your producer profile to manage projects, track phases, and connect with artists.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Producer name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='Your name'
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Producer alias</label>
            <input
              value={alias}
              onChange={e => setAlias(e.target.value)}
              placeholder="e.g. DJ Metro, Pharrell"
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={3}
              placeholder="What's your sound? Who do you work with?"
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, color: '#fff', fontSize: '0.95rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          {err && <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: 0 }}>{err}</p>}
          <button
            onClick={handleSetup}
            disabled={loading}
            style={{ padding: '0.875rem', background: '#3B8BFF', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Setting up…' : 'Enter the studio →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New project modal ─────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('PRE_PRODUCTION');
  const [notes, setNotes] = useState('');
  const [artistId, setArtistId] = useState<string | null>(null);
  const [artistQuery, setArtistQuery] = useState('');
  const [artistPickerOpen, setArtistPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Reuses the artist roster (now reachable by producers too) as the source
  // for this picker — the API already accepts artist_id on create, there was
  // just never a field for it. Note: /artists/discover returns `avatar`, not
  // `avatar_url` like the project.artist shape elsewhere in this file.
  const { data: artists = [] } = useQuery<Array<{ id: string; name: string; alias: string | null; avatar: string | null }>>({
    queryKey: ['discover'],
    queryFn: async () => (await api.get('/artists/discover')).data,
  });
  const selectedArtist = artists.find(a => a.id === artistId) ?? null;
  const filteredArtists = artistQuery.trim()
    ? artists.filter(a => {
        const q = artistQuery.trim().toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.alias ?? '').toLowerCase().includes(q);
      })
    : artists;

  const handleCreate = async () => {
    if (!title.trim()) { setErr('Title is required'); return; }
    setLoading(true); setErr('');
    try {
      const { data } = await api.post('/producer/projects', {
        title: title.trim(), phase, notes: notes.trim() || undefined,
        artist_id: artistId ?? undefined,
      });
      onCreated(data);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Failed to create project');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 460 }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontFamily: 'var(--font-display)', color: '#fff' }}>New Project</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Project title" autoFocus
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg, #0a0a0a)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Artist</label>
            {selectedArtist ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.9rem', background: 'var(--bg, #0a0a0a)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8 }}>
                {selectedArtist.avatar ? (
                  <img src={selectedArtist.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(90,155,203,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#5A9BCB', fontWeight: 700 }}>
                    {initials(selectedArtist.name)}
                  </div>
                )}
                <span style={{ flex: 1, fontSize: '0.9rem', color: '#fff' }}>{selectedArtist.alias ?? selectedArtist.name}</span>
                <button onClick={() => setArtistId(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
              </div>
            ) : (
              <input
                value={artistQuery}
                onChange={e => { setArtistQuery(e.target.value); setArtistPickerOpen(true); }}
                onFocus={() => setArtistPickerOpen(true)}
                placeholder="Search the roster — optional, add later if you like"
                style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg, #0a0a0a)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
              />
            )}
            {artistPickerOpen && !selectedArtist && filteredArtists.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 220, overflowY: 'auto', background: 'var(--surface, #141414)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                {filteredArtists.slice(0, 8).map(a => (
                  <div key={a.id}
                    onClick={() => { setArtistId(a.id); setArtistPickerOpen(false); setArtistQuery(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.9rem', cursor: 'pointer', fontSize: '0.88rem', color: '#ccc' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {a.avatar ? (
                      <img src={a.avatar} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(90,155,203,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#5A9BCB', fontWeight: 700 }}>
                        {initials(a.name)}
                      </div>
                    )}
                    {a.alias ?? a.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Phase</label>
            <select value={phase} onChange={e => setPhase(e.target.value as Phase)}
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg, #0a0a0a)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, color: '#fff', fontSize: '0.95rem', outline: 'none' }}>
              {PHASES.map(ph => <option key={ph.key} value={ph.key}>{ph.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="BPM, reference tracks, vibe…"
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg, #0a0a0a)', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, color: '#fff', fontSize: '0.9rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          {err && <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: 0 }}>{err}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border, #1e1e1e)', borderRadius: 8, color: '#888', cursor: 'pointer', fontSize: '0.9rem' }}>
              Cancel
            </button>
            <button onClick={handleCreate} disabled={loading}
              style={{ padding: '0.7rem 1.4rem', background: '#3B8BFF', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Phase advance pill ────────────────────────────────────────────────────────
function PhaseAdvance({ project, onAdvance }: { project: Project; onAdvance: (id: string, phase: Phase) => void }) {
  const phaseIdx = PHASES.findIndex(p => p.key === project.phase);
  const next = PHASES[phaseIdx + 1];
  if (!next || project.phase === 'DELIVERED') return null;
  return (
    <button onClick={e => { e.stopPropagation(); onAdvance(project.id, next.key); }}
      style={{ padding: '0.3rem 0.7rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#ccc', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      → {next.label}
    </button>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, onAdvance, onArchive }: {
  project: Project;
  onAdvance: (id: string, phase: Phase) => void;
  onArchive: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [hovering, setHovering] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => navigate(`/producer/projects/${project.id}`)}
      style={{
        background: hovering ? 'rgba(255,255,255,0.035)' : 'var(--surface, #141414)',
        border: `1px solid ${hovering ? 'rgba(201,168,76,0.2)' : 'var(--border, #1e1e1e)'}`,
        borderRadius: 12,
        padding: '1rem 1.1rem',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
        boxShadow: hovering ? '0 4px 24px rgba(0,0,0,0.4)' : 'none',
      }}
    >
      {/* Title + archive */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ flex: 1, fontWeight: 600, color: '#fff', fontSize: '0.95rem', lineHeight: 1.3 }}>
          {project.title}
        </span>
        {hovering && (
          <button onClick={e => { e.stopPropagation(); onArchive(project.id); }}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.85rem', padding: '0 2px', lineHeight: 1 }}
            title="Archive project">
            ✕
          </button>
        )}
      </div>

      {/* Artist pill */}
      {project.artist && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
          {project.artist.avatar_url ? (
            <img src={project.artist.avatar_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#C9A84C', fontWeight: 700 }}>
              {initials(project.artist.name)}
            </div>
          )}
          <span style={{ fontSize: '0.78rem', color: '#888' }}>{project.artist.alias ?? project.artist.name}</span>
        </div>
      )}

      {/* Notes preview */}
      {project.notes && (
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: '#666', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {project.notes}
        </p>
      )}

      {/* Session warmth — distinct from updated_at, which fires on any edit */}
      {(() => {
        const warmth = sessionWarmth(project.last_session_at);
        return warmth && (
          <div style={{ fontSize: '0.72rem', color: warmth.color, marginBottom: '0.5rem' }}>{warmth.text}</div>
        );
      })()}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.72rem', color: '#555' }}>{ago(project.updated_at)}</span>
        <PhaseAdvance project={project} onAdvance={onAdvance} />
      </div>
    </div>
  );
}

// ── Phase column ──────────────────────────────────────────────────────────────
function PhaseColumn({ conf, projects, onAdvance, onArchive }: {
  conf: typeof PHASES[0];
  projects: Project[];
  onAdvance: (id: string, phase: Phase) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div style={{ minWidth: 240, width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', marginBottom: '0.25rem' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: conf.dot, flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {conf.label}
        </span>
        {projects.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#555', background: 'rgba(255,255,255,0.05)', padding: '1px 7px', borderRadius: 99 }}>
            {projects.length}
          </span>
        )}
      </div>

      {/* Cards */}
      {projects.length === 0 ? (
        <div style={{ borderRadius: 10, border: '1px dashed var(--border, #1e1e1e)', padding: '1.5rem 1rem', textAlign: 'center', color: '#444', fontSize: '0.8rem' }}>
          Empty
        </div>
      ) : (
        projects.map(p => (
          <ProjectCard key={p.id} project={p} onAdvance={onAdvance} onArchive={onArchive} />
        ))
      )}
    </div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────
function StatsStrip({ projects, producer }: { projects: Project[]; producer: ProducerProfile }) {
  const active = projects.filter(p => p.is_active && p.phase !== 'DELIVERED');
  const delivered = projects.filter(p => p.phase === 'DELIVERED');
  const mixing = projects.filter(p => p.phase === 'MIXING' || p.phase === 'MASTERING');
  const strength = producer.passport?.profile_strength ?? 0;

  const stats = [
    { label: 'Active', value: String(active.length), color: '#3B8BFF', sub: 'projects' },
    { label: 'Mix / Master', value: String(mixing.length), color: '#E8823A', sub: 'in progress' },
    { label: 'Delivered', value: String(delivered.length), color: '#1D9E75', sub: 'completed' },
    { label: 'Passport', value: `${strength}%`, color: strength >= 70 ? '#1D9E75' : strength >= 40 ? '#C9A84C' : '#555', sub: 'profile strength' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
      {stats.map(s => (
        <div key={s.label} style={{
          background: 'var(--surface, #141414)',
          border: '1px solid var(--border, #1e1e1e)',
          borderRadius: 12, padding: '1rem 1.25rem',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, ${s.color}55, transparent)`,
          }} />
          <div style={{ fontSize: '2rem', fontFamily: 'var(--font-mono, JetBrains Mono)', fontWeight: 700, color: s.color, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {s.value}
          </div>
          <div style={{ marginTop: '0.35rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#ccc', fontWeight: 600 }}>{s.label}</span>
            <span style={{ fontSize: '0.7rem', color: '#444', marginLeft: '0.4rem' }}>{s.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── DNA strip ─────────────────────────────────────────────────────────────────
function DNAStrip({ passport }: { passport: ProducerProfile['passport'] }) {
  if (!passport) return null;
  const genres = (passport.genres_produced as string[]) ?? [];
  const tags = (passport.signature_tags as string[]) ?? [];
  if (!genres.length && !tags.length) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      {genres.map(g => (
        <span key={g} style={{ padding: '3px 10px', borderRadius: 99, background: 'rgba(59,139,255,0.12)', border: '1px solid rgba(59,139,255,0.25)', fontSize: '0.75rem', color: '#3B8BFF' }}>{g}</span>
      ))}
      {tags.map(t => (
        <span key={t} style={{ padding: '3px 10px', borderRadius: 99, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', fontSize: '0.75rem', color: '#a78bfa' }}>{t}</span>
      ))}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function ProducerDashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showNewProject, setShowNewProject] = useState(false);
  const [setupDone, setSetupDone] = useState(false);

  const { data: producer, isLoading, error } = useQuery<ProducerProfile>({
    queryKey: ['producer', 'me'],
    queryFn: async () => (await api.get('/producer/me')).data,
    retry: false,
  });

  // Advance phase mutation
  const advanceMut = useMutation({
    mutationFn: ({ id, phase }: { id: string; phase: Phase }) =>
      api.patch(`/producer/projects/${id}`, { phase }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['producer', 'me'] }),
  });

  // Archive mutation
  const archiveMut = useMutation({
    mutationFn: (id: string) => api.delete(`/producer/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['producer', 'me'] }),
  });

  // "Open to collabs" toggle — PATCH /producer/me already accepted this field,
  // there was just no control anywhere that could flip it.
  const collabsMut = useMutation({
    mutationFn: (open_to_collabs: boolean) => api.patch('/producer/me', { open_to_collabs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['producer', 'me'] }),
  });

  const handleAdvance = useCallback((id: string, phase: Phase) => {
    advanceMut.mutate({ id, phase });
  }, [advanceMut]);

  const handleArchive = useCallback((id: string) => {
    archiveMut.mutate(id);
  }, [archiveMut]);

  // Loading state
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#555', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>Loading production board…</div>
      </div>
    );
  }

  // 404 → producer profile doesn't exist yet
  const is404 = (error as any)?.response?.status === 404 || (!isLoading && !producer && !setupDone);
  if (is404) {
    return <ProducerSetupGate onSetup={() => { setSetupDone(true); qc.invalidateQueries({ queryKey: ['producer', 'me'] }); }} />;
  }

  if (!producer) return null;

  const activeProjects = (producer.projects ?? []).filter(p => p.is_active);

  // Group by phase
  const byPhase: Record<Phase, Project[]> = {
    PRE_PRODUCTION: [], TRACKING: [], EDITING: [], MIXING: [], MASTERING: [], DELIVERED: [],
  };
  activeProjects.forEach(p => {
    if (byPhase[p.phase]) byPhase[p.phase].push(p);
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0a)', fontFamily: 'var(--font-body, DM Sans), sans-serif' }}>
      <ProducerNav passportCode={producer.passport?.passport_code} />
      <main style={{ padding: '2rem 2rem 4rem', maxWidth: 1600, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🎛️</span>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontFamily: 'var(--font-display, Playfair Display)', color: '#fff', fontWeight: 700 }}>
              {producer.alias ?? producer.name}
            </h1>
          </div>
          <p style={{ margin: 0, color: '#555', fontSize: '0.85rem', fontFamily: 'var(--font-mono, JetBrains Mono)' }}>
            {producer.passport?.passport_code ?? 'Producer'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => collabsMut.mutate(!producer.open_to_collabs)}
            disabled={collabsMut.isPending}
            title="Whether other producers/artists can see you're open to new work"
            style={{
              padding: '0.4rem 0.9rem', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
              cursor: collabsMut.isPending ? 'wait' : 'pointer', transition: 'all 0.15s',
              background: producer.open_to_collabs ? 'rgba(29,158,117,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${producer.open_to_collabs ? 'rgba(29,158,117,0.25)' : 'rgba(255,255,255,0.1)'}`,
              color: producer.open_to_collabs ? '#1D9E75' : '#666',
            }}>
            {producer.open_to_collabs ? '● Open to collabs' : '○ Not taking new work'}
          </button>
          <button
            onClick={() => navigate('/producer/passport')}
            style={{ padding: '0.6rem 1.2rem', background: 'none', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 8, color: '#C9A84C', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
            My Passport
          </button>
          <button
            onClick={() => setShowNewProject(true)}
            style={{ padding: '0.6rem 1.2rem', background: '#3B8BFF', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
            + New Project
          </button>
        </div>
      </div>

      {/* DNA */}
      <DNAStrip passport={producer.passport} />

      {/* Stats */}
      <StatsStrip projects={activeProjects} producer={producer} />

      {/* Production Board — horizontal scrolling lane */}
      <style>{'@media (max-width: 768px) { .producer-board-hint { display: block !important; } }'}</style>
      <div className="producer-board-hint" style={{ display: 'none', fontSize: '0.7rem', color: '#5A9BCB', fontFamily: 'var(--font-mono, JetBrains Mono), monospace', marginBottom: '0.5rem' }}>
        ← Swipe to see every phase →
      </div>
      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', alignItems: 'flex-start',
        // hide scrollbar on webkit while keeping scroll
        msOverflowStyle: 'none',
      }}>
        {PHASES.map(conf => (
          <PhaseColumn
            key={conf.key}
            conf={conf}
            projects={byPhase[conf.key]}
            onAdvance={handleAdvance}
            onArchive={handleArchive}
          />
        ))}
      </div>

      {activeProjects.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem 2rem', color: '#444' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(59,139,255,0.1)', border: '1px solid rgba(59,139,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: 28 }}>🎛️</div>
          <p style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', color: '#888', fontFamily: 'var(--font-display, Playfair Display)' }}>
            The board is clear.
          </p>
          <p style={{ margin: '0 0 2rem', fontSize: '0.85rem', color: '#444' }}>Start a project to track its journey from idea to delivery.</p>
          <button onClick={() => setShowNewProject(true)}
            style={{ padding: '0.75rem 1.75rem', background: '#3B8BFF', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', letterSpacing: '0.01em' }}>
            + New Project
          </button>
        </div>
      )}

      {/* New project modal */}
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={() => {
            setShowNewProject(false);
            qc.invalidateQueries({ queryKey: ['producer', 'me'] });
          }}
        />
      )}
      </main>
    </div>
  );
}
