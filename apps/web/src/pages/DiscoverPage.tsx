/**
 * DiscoverPage — artists ranked by creative DNA overlap
 * Features: search by name/alias, filter by genre, energy profile display,
 * profile strength bar, connect + view passport actions.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import ArtistFacetMark from '../components/ArtistFacetMark';

interface DiscoverArtist {
  id: string;
  name: string;
  alias: string | null;
  bio: string | null;
  avatar: string | null;
  profile_strength: number;
  overlap_score: number;
  tier?: string | null;
  shared_genres: string[];
  shared_themes: string[];
  creative_dna: {
    genres?: string[];
    vocal_type?: string;
    energy_profile?: string;
    key_themes?: string[];
  };
}

const ENERGY_COLORS: Record<string, string> = {
  'Introspective': '#6366f1',
  'Chill':         '#06b6d4',
  'Mid-tempo':     '#C9A84C',
  'High-energy':   '#f97316',
  'Explosive':     '#ef4444',
};

function StrengthBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#C9A84C' : '#555';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 2, background: '#1e1e1e', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: 'monospace', minWidth: 26, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export default function DiscoverPage() {
  const navigate = useNavigate();
  const [search, setSearch]         = useState('');
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [activeEnergy, setActiveEnergy] = useState<string | null>(null);

  const { data: artists = [], isLoading } = useQuery<DiscoverArtist[]>({
    queryKey: ['discover'],
    queryFn: async () => (await api.get('/artists/discover')).data,
  });

  // Collect all unique genres across roster
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    artists.forEach(a => (a.creative_dna.genres ?? []).forEach(g => set.add(g)));
    return [...set].sort();
  }, [artists]);

  const allEnergies = useMemo(() => {
    const set = new Set<string>();
    artists.forEach(a => { if (a.creative_dna.energy_profile) set.add(a.creative_dna.energy_profile); });
    return [...set];
  }, [artists]);

  const filtered = useMemo(() => {
    let list = [...artists];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.alias ?? '').toLowerCase().includes(q) ||
        (a.bio ?? '').toLowerCase().includes(q)
      );
    }
    if (activeGenre) {
      list = list.filter(a => (a.creative_dna.genres ?? []).includes(activeGenre));
    }
    if (activeEnergy) {
      list = list.filter(a => a.creative_dna.energy_profile === activeEnergy);
    }
    return list;
  }, [artists, search, activeGenre, activeEnergy]);

  const hasFilters = !!(search || activeGenre || activeEnergy);

  return (
    <div className="min-h-screen bg-studio-bg text-white" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <header className="border-b border-studio-border px-6 py-4 sticky top-0 bg-studio-bg z-20">
        <div className="flex items-center gap-4 mb-3">
          <button onClick={() => navigate(-1)} className="text-zinc-500 hover:text-white text-sm transition-colors">← Back</button>
          <div>
            <h1 className="font-display text-xl text-gold font-semibold">Discover</h1>
            <p className="text-zinc-600 text-xs font-mono">Dreamz Music Lab roster</p>
          </div>
          {!isLoading && (
            <span className="ml-auto text-xs text-zinc-600 font-mono">
              {filtered.length}/{artists.length} artists
            </span>
          )}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, alias, or vibe…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 8,
            padding: '9px 14px', color: '#fff', fontSize: 13,
            fontFamily: "'DM Sans', sans-serif", outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = '#C9A84C')}
          onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
        />
      </header>

      {/* Filter chips */}
      {(allGenres.length > 0 || allEnergies.length > 0) && (
        <div style={{ padding: '10px 24px 0', overflowX: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* Genre chips */}
          {allGenres.map(g => (
            <button key={g} onClick={() => setActiveGenre(activeGenre === g ? null : g)} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeGenre === g ? '#C9A84C22' : '#0d0d0d',
              border: `1px solid ${activeGenre === g ? '#C9A84C' : '#222'}`,
              color: activeGenre === g ? '#C9A84C' : '#666',
              transition: 'all 0.15s',
            }}>{g}</button>
          ))}
          <div style={{ width: 1, background: '#222', margin: '0 4px', flexShrink: 0 }} />
          {/* Energy chips */}
          {allEnergies.map(e => {
            const ec = ENERGY_COLORS[e] ?? '#C9A84C';
            return (
              <button key={e} onClick={() => setActiveEnergy(activeEnergy === e ? null : e)} style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                background: activeEnergy === e ? ec + '22' : '#0d0d0d',
                border: `1px solid ${activeEnergy === e ? ec : '#222'}`,
                color: activeEnergy === e ? ec : '#555',
                transition: 'all 0.15s',
              }}>{e}</button>
            );
          })}
          {hasFilters && (
            <button onClick={() => { setSearch(''); setActiveGenre(null); setActiveEnergy(null); }} style={{
              padding: '4px 10px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
              background: 'transparent', border: '1px solid #333', color: '#555',
            }}>✕ Clear</button>
          )}
        </div>
      )}

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '16px 24px 32px' }}>

        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {[0,1,2,3].map(i => (
              <div key={i} className="animate-pulse" style={{
                height: 120, background: '#111', borderRadius: 12, border: '1px solid #1a1a1a',
              }} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <p style={{ color: '#555', fontSize: 14 }}>
              {hasFilters ? 'No artists match those filters.' : 'No other artists to discover yet.'}
            </p>
            {hasFilters && (
              <button onClick={() => { setSearch(''); setActiveGenre(null); setActiveEnergy(null); }}
                style={{ marginTop: 12, fontSize: 12, color: '#C9A84C', background: 'none', border: 'none', cursor: 'pointer' }}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Results */}
        {!isLoading && filtered.length > 0 && (
          <>
            {!hasFilters && (
              <p style={{ color: '#444', fontSize: 12, fontFamily: 'monospace', marginBottom: 14 }}>
                {artists.length} artists · ranked by creative DNA overlap
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((a) => {
                const energy = a.creative_dna.energy_profile;
                const energyColor = energy ? (ENERGY_COLORS[energy] ?? '#C9A84C') : null;

                return (
                  <div key={a.id} style={{
                    background: '#111', border: '1px solid #1a1a1a', borderRadius: 12,
                    padding: '16px 18px', transition: 'border-color 0.15s, transform 0.1s',
                    cursor: 'default',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1a1a1a'; }}
                  >
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      {/* Avatar */}
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                        background: '#1a1a1a', border: '1px solid #222',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      }}>
                        {a.avatar
                          ? <img src={a.avatar} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ color: '#555', fontSize: 16, fontWeight: 700 }}>{a.name.charAt(0)}</span>
                        }
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                          <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                          <ArtistFacetMark tier={a.tier} />
                          {a.alias && <span style={{ color: '#C9A84C', fontSize: 12 }}>{a.alias}</span>}
                          {a.overlap_score > 0 && (
                            <span style={{
                              marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace',
                              background: '#C9A84C18', border: '1px solid #C9A84C44', color: '#C9A84C',
                              padding: '2px 8px', borderRadius: 10,
                            }}>{a.overlap_score} match</span>
                          )}
                        </div>

                        {/* Vocal + energy row */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          {a.creative_dna.vocal_type && (
                            <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{a.creative_dna.vocal_type}</span>
                          )}
                          {energy && energyColor && (
                            <span style={{
                              fontSize: 10, padding: '1px 7px', borderRadius: 8,
                              background: energyColor + '18', border: `1px solid ${energyColor}44`, color: energyColor,
                              fontFamily: 'monospace',
                            }}>{energy}</span>
                          )}
                        </div>

                        {/* Bio */}
                        {a.bio && (
                          <p style={{ color: '#777', fontSize: 12, lineHeight: 1.5, marginBottom: 8,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {a.bio}
                          </p>
                        )}

                        {/* Genre tags — shared first, then own */}
                        {(a.shared_genres.length > 0 || (a.creative_dna.genres ?? []).length > 0) && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                            {a.shared_genres.slice(0, 3).map(g => (
                              <span key={g} style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 8,
                                background: '#C9A84C14', border: '1px solid #C9A84C33', color: '#C9A84C',
                              }}>{g}</span>
                            ))}
                            {a.overlap_score === 0 && (a.creative_dna.genres ?? []).slice(0, 4).map(g => (
                              <span key={g} style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 8,
                                background: '#1a1a1a', border: '1px solid #222', color: '#555',
                              }}>{g}</span>
                            ))}
                            {a.shared_themes.slice(0, 2).map(t => (
                              <span key={t} style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 8,
                                background: '#1a1a1a', border: '1px solid #222', color: '#666',
                              }}>{t}</span>
                            ))}
                          </div>
                        )}

                        {/* Profile strength */}
                        <StrengthBar pct={a.profile_strength} />
                      </div>
                    </div>

                    {/* Action row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
                      paddingTop: 12, borderTop: '1px solid #1a1a1a' }}>
                      <button onClick={() => navigate(`/artists/${a.id}`)} style={{
                        fontSize: 12, color: '#888', background: 'none', border: 'none',
                        cursor: 'pointer', padding: 0,
                      }}>View passport →</button>
                      <button onClick={() => navigate(`/connect/${a.id}`)} style={{
                        marginLeft: 'auto', fontSize: 12,
                        background: '#C9A84C14', border: '1px solid #C9A84C33', color: '#C9A84C',
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#C9A84C22'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#C9A84C14'; }}
                      >💬 Connect</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

    </div>
  );
}
