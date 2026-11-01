/**
 * DiscoverPage — existing artist roster with optional profile-descriptor filters.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import ArtistAvatar from '../components/ArtistAvatar';
import { useAuthStore } from '../store/auth.store';
import ArtistEmptyState from '../components/ArtistEmptyState';
import { SearchX, UsersRound } from 'lucide-react';
import './DiscoverPage.css';

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

export default function DiscoverPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  // Connect is artist-to-artist only for now (see the producer retention
  // study) — a producer viewer gets the roster and passports, just not a
  // button that would 404 against an endpoint that requires an Artist record.
  const canConnect = user?.role === 'ARTIST';
  const [search, setSearch]         = useState('');
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [activeEnergy, setActiveEnergy] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<DiscoverArtist[]>({
    queryKey: ['discover'],
    queryFn: async () => (await api.get('/artists/discover')).data,
  });
  const artists = data ?? [];

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
    <div className="discover-page">
      {/* Header */}
      <header className="discover-header">
        <div className="flex items-center gap-4 mb-3">
          <button onClick={() => navigate(-1)} className="text-zinc-500 hover:text-white text-sm transition-colors">← Back</button>
          <div>
            <h1 className="font-display text-xl text-gold font-semibold">Discover</h1>
            <p className="text-zinc-600 text-xs font-mono">OIANO creator network</p>
          </div>
          {!isLoading && (
            <span role="status" aria-live="polite" className="ml-auto text-xs text-zinc-400 font-mono">
              {filtered.length}/{artists.length} loaded profiles
            </span>
          )}
        </div>

        {/* Search */}
        <label className="discover-search-label" htmlFor="discover-search">Search loaded artist profiles</label>
        <input
          id="discover-search"
          name="artist-search"
          autoComplete="off"
          className="discover-search"
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, alias, or biography…"
        />
        <nav className="creative-home-shortcuts mt-3" aria-label="Discovery destinations">
          <Link className="creative-text-link" to="/producers">Professionals and catalogues</Link>
          <Link className="creative-text-link" to="/network">Your network context</Link>
          <Link className="creative-text-link" to="/contributions">Your invitations</Link>
        </nav>
        <p className="discover-provenance">Profile descriptions and shared interests help you explore; they are not evidence of completed work, endorsement or availability. Review project context before agreeing to participate.</p>
      </header>

      {/* Filter chips */}
      {(allGenres.length > 0 || allEnergies.length > 0) && (
        <div className="discover-filters" aria-label="Filter artists">
          {/* Genre chips */}
          {allGenres.map(g => (
            <button key={g} type="button" aria-pressed={activeGenre === g} className={`discover-filter-chip${activeGenre === g ? ' is-active' : ''}`} onClick={() => setActiveGenre(activeGenre === g ? null : g)} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeGenre === g ? '#C9A84C22' : '#0d0d0d',
              border: `1px solid ${activeGenre === g ? '#C9A84C' : '#222'}`,
              color: activeGenre === g ? '#C9A84C' : '#B8C1C8',
              transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
            }}>{g}</button>
          ))}
          <div style={{ width: 1, background: '#222', margin: '0 4px', flexShrink: 0 }} />
          {/* Stored descriptors remain filters, not assigned personality identities. */}
          {allEnergies.map(e => {
            return (
              <button key={e} type="button" aria-pressed={activeEnergy === e} className={`discover-filter-chip${activeEnergy === e ? ' is-active' : ''}`} onClick={() => setActiveEnergy(activeEnergy === e ? null : e)} style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                background: activeEnergy === e ? '#8FC5EE22' : '#0d0d0d',
                border: `1px solid ${activeEnergy === e ? '#8FC5EE' : '#333B40'}`,
                color: activeEnergy === e ? '#8FC5EE' : '#B8C1C8',
                transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
              }}>Profile descriptor: {e}</button>
            );
          })}
          {hasFilters && (
            <button type="button" onClick={() => { setSearch(''); setActiveGenre(null); setActiveEnergy(null); }} style={{
              padding: '4px 10px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
              background: 'transparent', border: '1px solid #333', color: '#B8C1C8',
            }}>✕ Clear</button>
          )}
        </div>
      )}

      <main className="discover-main" style={{ maxWidth: 760, margin: '0 auto', padding: '16px 24px 32px' }}>

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

        {isError && (
          <div className="discover-read-error" role="alert">
            <p>{data ? 'Couldn’t refresh the roster. The profiles below may be out of date.' : 'We couldn’t load the creator roster. Try again to continue discovering people.'}</p>
            <button type="button" onClick={() => { void refetch(); }} disabled={isFetching}>
              {isFetching ? 'Checking…' : 'Try again'}
            </button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && filtered.length === 0 && (
          <ArtistEmptyState icon={hasFilters ? SearchX : UsersRound} title={hasFilters ? 'No creative match yet' : 'The roster is growing'} description={hasFilters ? 'Broaden your sound, energy, or name filters to discover more artists.' : 'New artists will appear here as they join the creator network.'} actionLabel={hasFilters ? 'Clear filters' : undefined} onAction={hasFilters ? () => { setSearch(''); setActiveGenre(null); setActiveEnergy(null); } : undefined} />
        )}

        {/* Results */}
        {!isLoading && filtered.length > 0 && (
          <>
            {!hasFilters && (
              <p className="creative-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                {artists.length} loaded artist profiles. The current roster returns up to 20, ordered by shared genres/themes and complementary vocal descriptors, then completed session counts. This is not a quality or trust score.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((a) => {
                const energy = a.creative_dna.energy_profile;

                return (
                  <div key={a.id} className="discover-card" style={{
                    background: '#111', border: '1px solid #1a1a1a', borderRadius: 12,
                    padding: '16px 18px', transition: 'border-color 0.15s, transform 0.1s',
                    cursor: 'default',
                  }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      {/* Avatar */}
                      <ArtistAvatar src={a.avatar} name={a.name} size={44} />

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                          <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                          {a.alias && <span style={{ color: '#C9A84C', fontSize: 12 }}>{a.alias}</span>}
                        </div>

                        {/* Vocal + energy row */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          {a.creative_dna.vocal_type && (
                            <span style={{ fontSize: 11, color: '#B8C1C8', fontFamily: 'monospace' }}>{a.creative_dna.vocal_type}</span>
                          )}
                          {energy && (
                            <span style={{
                              fontSize: 10, padding: '1px 7px', borderRadius: 8,
                              background: '#8FC5EE18', border: '1px solid #8FC5EE44', color: '#8FC5EE',
                              fontFamily: 'monospace',
                            }}>Profile descriptor: {energy}</span>
                          )}
                        </div>

                        {/* Bio */}
                        {a.bio && (
                          <p style={{ color: '#B8C1C8', fontSize: 12, lineHeight: 1.5, marginBottom: 8,
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
                                background: '#1a1a1a', border: '1px solid #222', color: '#B8C1C8',
                              }}>{g}</span>
                            ))}
                            {a.shared_themes.slice(0, 2).map(t => (
                              <span key={t} style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 8,
                                background: '#1a1a1a', border: '1px solid #222', color: '#B8C1C8',
                              }}>{t}</span>
                            ))}
                          </div>
                        )}

                      </div>
                    </div>

                    {/* Action row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
                      paddingTop: 12, borderTop: '1px solid #1a1a1a' }}>
                      <Link to={`/artists/${encodeURIComponent(a.id)}`} style={{
                        fontSize: 12, color: '#B8C1C8', background: 'none', border: 'none',
                        cursor: 'pointer', padding: 0,
                      }}>View profile →</Link>
                      {canConnect && (
                        <Link to={`/connect/${encodeURIComponent(a.id)}`} style={{
                          marginLeft: 'auto', fontSize: 12,
                          background: '#C9A84C14', border: '1px solid #C9A84C33', color: '#C9A84C',
                          padding: '6px 14px', borderRadius: 8, cursor: 'pointer', transition: 'background-color 0.15s',
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#C9A84C22'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#C9A84C14'; }}
                        >Request connection</Link>
                      )}
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
