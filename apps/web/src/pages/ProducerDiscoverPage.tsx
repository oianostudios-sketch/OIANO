/**
 * ProducerDiscoverPage — browse producers and preview their beat catalogue
 * Mirrors DiscoverPage.tsx's layout/patterns, adapted for producers: no
 * creative-DNA overlap score (that's an artist-passport concept), no
 * Connect action (producer-to-producer/artist Connect doesn't exist yet —
 * see the producer retention study), search + genre filter + inline
 * track previews instead.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const API_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

interface DiscoverTrack {
  id: string;
  title: string;
  file_url: string;
  duration_sec: number | null;
  bpm: number | null;
  genre: string | null;
}

interface DiscoverProducer {
  id: string;
  name: string;
  alias: string | null;
  bio: string | null;
  avatar_url: string | null;
  open_to_collabs: boolean;
  passport_code?: string;
  genres_produced: string[];
  signature_tags: string[];
  active_projects: number;
  tracks: DiscoverTrack[];
}

function resolveUrl(url: string) {
  return url.startsWith('/') ? `${API_ORIGIN}${url}` : url;
}

export default function ProducerDiscoverPage() {
  const navigate = useNavigate();
  const [search, setSearch]           = useState('');
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  const { data: producers = [], isLoading } = useQuery<DiscoverProducer[]>({
    queryKey: ['producer-discover'],
    queryFn: async () => (await api.get('/producer/discover')).data,
  });

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    producers.forEach(p => p.genres_produced.forEach(g => set.add(g)));
    return [...set].sort();
  }, [producers]);

  const filtered = useMemo(() => {
    let list = [...producers];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.alias ?? '').toLowerCase().includes(q) ||
        (p.bio ?? '').toLowerCase().includes(q) ||
        p.signature_tags.some(t => t.toLowerCase().includes(q))
      );
    }
    if (activeGenre) {
      list = list.filter(p => p.genres_produced.includes(activeGenre));
    }
    return list;
  }, [producers, search, activeGenre]);

  const hasFilters = !!(search || activeGenre);

  return (
    <div className="min-h-screen bg-studio-bg text-white" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <header className="border-b border-studio-border px-6 py-4 sticky top-0 bg-studio-bg z-20">
        <div className="flex items-center gap-4 mb-3">
          <button onClick={() => navigate(-1)} className="text-zinc-500 hover:text-white text-sm transition-colors">← Back</button>
          <div>
            <h1 className="font-display text-xl font-semibold" style={{ color: '#5A9BCB' }}>Producers</h1>
            <p className="text-zinc-600 text-xs font-mono">Dreamz Music Lab catalogue</p>
          </div>
          {!isLoading && (
            <span className="ml-auto text-xs text-zinc-600 font-mono">
              {filtered.length}/{producers.length} producers
            </span>
          )}
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, alias, or tag…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 8,
            padding: '9px 14px', color: '#fff', fontSize: 13,
            fontFamily: "'DM Sans', sans-serif", outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = '#5A9BCB')}
          onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
        />
      </header>

      {/* Genre filter chips */}
      {allGenres.length > 0 && (
        <div style={{ padding: '10px 24px 0', overflowX: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {allGenres.map(g => (
            <button key={g} onClick={() => setActiveGenre(activeGenre === g ? null : g)} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeGenre === g ? '#5A9BCB22' : '#0d0d0d',
              border: `1px solid ${activeGenre === g ? '#5A9BCB' : '#222'}`,
              color: activeGenre === g ? '#5A9BCB' : '#666',
              transition: 'all 0.15s',
            }}>{g}</button>
          ))}
          {hasFilters && (
            <button onClick={() => { setSearch(''); setActiveGenre(null); }} style={{
              padding: '4px 10px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
              background: 'transparent', border: '1px solid #333', color: '#555',
            }}>✕ Clear</button>
          )}
        </div>
      )}

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '16px 24px 32px' }}>

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="animate-pulse" style={{
                height: 120, background: '#111', borderRadius: 12, border: '1px solid #1a1a1a',
              }} />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎛️</div>
            <p style={{ color: '#555', fontSize: 14 }}>
              {hasFilters ? 'No producers match those filters.' : 'No producers open to collabs yet.'}
            </p>
            {hasFilters && (
              <button onClick={() => { setSearch(''); setActiveGenre(null); }}
                style={{ marginTop: 12, fontSize: 12, color: '#5A9BCB', background: 'none', border: 'none', cursor: 'pointer' }}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(p => (
              <div key={p.id} style={{
                background: '#111', border: '1px solid #1a1a1a', borderRadius: 12,
                padding: '16px 18px', transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1a1a1a'; }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: '#1a1a1a', border: '1px solid #222',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  }}>
                    {p.avatar_url
                      ? <img src={resolveUrl(p.avatar_url)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: '#555', fontSize: 16, fontWeight: 700 }}>🎛</span>
                    }
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                      {p.alias && <span style={{ color: '#5A9BCB', fontSize: 12 }}>{p.alias}</span>}
                      {p.open_to_collabs && (
                        <span style={{
                          marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace',
                          background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.25)', color: '#1D9E75',
                          padding: '2px 8px', borderRadius: 10,
                        }}>● open to collabs</span>
                      )}
                    </div>

                    {p.bio && (
                      <p style={{ color: '#777', fontSize: 12, lineHeight: 1.5, marginBottom: 8,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.bio}
                      </p>
                    )}

                    {(p.genres_produced.length > 0 || p.signature_tags.length > 0) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                        {p.genres_produced.slice(0, 3).map(g => (
                          <span key={g} style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 8,
                            background: 'rgba(90,155,203,0.08)', border: '1px solid rgba(90,155,203,0.25)', color: '#5A9BCB',
                          }}>{g}</span>
                        ))}
                        {p.signature_tags.slice(0, 3).map(t => (
                          <span key={t} style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 8,
                            background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', color: '#a78bfa',
                          }}>#{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Track previews */}
                {p.tracks.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.tracks.map(t => (
                      <div key={t.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: '#ccc' }}>{t.title}</span>
                          {t.bpm && <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{t.bpm} BPM</span>}
                        </div>
                        <audio controls src={resolveUrl(t.file_url)} style={{ width: '100%', height: 30 }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
