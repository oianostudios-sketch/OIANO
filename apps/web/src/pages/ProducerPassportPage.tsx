import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ProducerNav } from '../components/ProducerNav';
import { useToast } from '../components/Toast';
import OianoBrand from '../components/OianoBrand';

const API_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// ── ProducerPassportPage ──────────────────────────────────────────────────────
// Route: /producer/passport
// Shows the producer's passport DNA — genres produced, signature tags,
// profile strength, project count, passport code.
// Inline editing for genres and tags.
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  PRE_PRODUCTION: 'Pre',
  TRACKING:       'Tracking',
  EDITING:        'Edit',
  MIXING:         'Mixing',
  MASTERING:      'Master',
  DELIVERED:      'Delivered',
};

export default function ProducerPassportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [editingGenres, setEditingGenres] = useState(false);
  const [editingTags, setEditingTags]     = useState(false);
  const [genreDraft, setGenreDraft]       = useState('');
  const [tagDraft, setTagDraft]           = useState('');
  const [avatarHover, setAvatarHover]      = useState(false);
  const [justUploaded, setJustUploaded]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [addingTrack, setAddingTrack]     = useState(false);
  const [trackTitle, setTrackTitle]       = useState('');
  const [trackBpm, setTrackBpm]           = useState('');
  const [trackGenre, setTrackGenre]       = useState('');
  const [trackTags, setTrackTags]         = useState('');
  const trackFileRef = useRef<HTMLInputElement>(null);

  // ── Fetch producer + passport ─────────────────────────────────────────────
  const { data: me, isLoading } = useQuery({
    queryKey: ['producer-me'],
    queryFn: async () => (await api.get('/producer/me')).data,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['producer-projects'],
    queryFn: async () => (await api.get('/producer/projects')).data,
  });

  const { data: tracks = [] } = useQuery({
    queryKey: ['producer-tracks'],
    queryFn: async () => (await api.get('/producer/tracks')).data,
  });

  // ── Update passport mutation ───────────────────────────────────────────────
  const updatePassport = useMutation({
    mutationFn: (data: { genres_produced?: string[]; signature_tags?: string[] }) =>
      api.patch('/producer/passport', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producer-me'] });
      toast.success('Passport updated');
      setEditingGenres(false);
      setEditingTags(false);
    },
    onError: () => toast.error('Update failed'),
  });

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const uploadAvatar = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('avatar', file);
      return api.patch('/producer/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producer-me'] });
      toast.success('Avatar updated');
      setJustUploaded(true);
      setTimeout(() => setJustUploaded(false), 1200);
    },
    onError: () => toast.error('Upload failed'),
  });

  const onAvatarFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAvatar.mutate(file);
  }, [uploadAvatar]);

  // ── Track (beat/sample) catalogue ─────────────────────────────────────────
  const uploadTrack = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('audio', file);
      form.append('title', trackTitle.trim());
      if (trackBpm.trim())   form.append('bpm', trackBpm.trim());
      if (trackGenre.trim()) form.append('genre', trackGenre.trim());
      form.append('tags', JSON.stringify(trackTags.split(',').map(s => s.trim()).filter(Boolean)));
      return api.post('/producer/tracks', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producer-tracks'] });
      toast.success('Track added to catalogue');
      setAddingTrack(false);
      setTrackTitle(''); setTrackBpm(''); setTrackGenre(''); setTrackTags('');
    },
    onError: () => toast.error('Upload failed'),
  });

  const archiveTrack = useMutation({
    mutationFn: (id: string) => api.delete(`/producer/tracks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['producer-tracks'] }),
    onError: () => toast.error('Could not remove track'),
  });

  const onTrackFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!trackTitle.trim()) { toast.error('Give the track a title first'); return; }
    uploadTrack.mutate(file);
  }, [trackTitle, uploadTrack, toast]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#444', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>Loading passport…</p>
      </div>
    );
  }

  const producer = me?.producer ?? me;
  const passport = producer?.passport ?? me?.passport;
  const genres: string[]   = (passport?.genres_produced ?? []) as string[];
  const tags: string[]     = (passport?.signature_tags  ?? []) as string[];
  const strength: number   = passport?.profile_strength ?? 0;
  const passportCode       = passport?.passport_code ?? '—';

  // Project phase distribution
  const phaseCounts = (projects as any[]).reduce((acc: Record<string, number>, p: any) => {
    acc[p.phase] = (acc[p.phase] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const delivered = phaseCounts['DELIVERED'] ?? 0;
  const active    = (projects as any[]).filter((p: any) => p.is_active && p.phase !== 'DELIVERED').length;

  // Strength color
  const strengthColor = strength >= 70 ? '#1D9E75' : strength >= 40 ? '#C9A84C' : '#555';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg,#0a0a0a)', fontFamily: 'DM Sans,sans-serif' }}>
      <style>{`
        @keyframes ppp-upload-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(90,155,203,0.55); }
          70%  { box-shadow: 0 0 0 14px rgba(90,155,203,0); }
          100% { box-shadow: 0 0 0 0 rgba(90,155,203,0); }
        }
        .ppp-avatar-pulse { animation: ppp-upload-pulse 1.2s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .ppp-avatar-pulse { animation: none; }
        }
      `}</style>
      <ProducerNav passportCode={passport?.passport_code} />
      <div style={{ minHeight: 'calc(100vh - 52px)', background: 'var(--bg)', color: '#fff' }}>

      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate('/producer')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>←</button>
        <OianoBrand variant="compact" size={19} />
        <span style={{ fontSize: 10, color: '#333', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.2em', textTransform: 'uppercase', marginLeft: 'auto' }}>
          {passportCode}
        </span>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Identity block */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              className={justUploaded ? 'ppp-avatar-pulse' : undefined}
              style={{ width: 72, height: 72, borderRadius: '50%', position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              onMouseEnter={() => setAvatarHover(true)}
              onMouseLeave={() => setAvatarHover(false)}
              onClick={() => fileRef.current?.click()}
            >
              {producer?.avatar_url ? (
                <img
                  src={producer.avatar_url.startsWith('/') ? `${API_ORIGIN}${producer.avatar_url}` : producer.avatar_url}
                  alt=""
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#555', border: '2px solid var(--border)' }}>
                  🎛
                </div>
              )}
              {avatarHover && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: 'var(--dome, #5A9BCB)', fontWeight: 600, letterSpacing: '0.03em',
                }}>
                  {uploadAvatar.isPending ? '…' : '+ Photo'}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarFileChange} />
            </div>
            <div>
              <p style={{ margin: 0, fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, color: '#fff' }}>
                {producer?.alias ?? producer?.name ?? 'Producer'}
              </p>
              {producer?.alias && producer?.name && (
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#555' }}>{producer.name}</p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono',monospace'" }}>PRODUCER PASSPORT</span>
                <span style={{ fontSize: 10, color: '#5A9BCB', fontFamily: "'JetBrains Mono',monospace'" }}>· {passportCode}</span>
              </div>
            </div>
          </div>

          {producer?.bio && (
            <p style={{ margin: '20px 0 0', fontSize: 13, color: '#888', lineHeight: 1.6, maxWidth: 500 }}>{producer.bio}</p>
          )}
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 36 }}>
          {[
            { label: 'Active projects', value: active },
            { label: 'Delivered', value: delivered },
            { label: 'Total projects', value: (projects as any[]).length },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace'" , fontSize: 24, fontWeight: 700, color: '#fff' }}>{s.value}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono',monospace'" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Profile strength */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono',monospace'" }}>PROFILE STRENGTH</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: strengthColor, fontFamily: "'JetBrains Mono',monospace'" }}>{strength}%</p>
          </div>
          <div style={{ height: 4, background: 'var(--muted)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${strength}%`, background: strengthColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
          </div>
          {strength < 70 && (
            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#444' }}>
              Add genres and signature tags to strengthen your passport.
            </p>
          )}
        </div>

        {/* Genres produced */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono',monospace'" }}>GENRES PRODUCED</p>
            <button
              onClick={() => { setEditingGenres(v => !v); setGenreDraft(genres.join(', ')); }}
              style={{ fontSize: 10, color: '#444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace'" }}
            >
              {editingGenres ? 'cancel' : 'edit'}
            </button>
          </div>

          {!editingGenres ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {genres.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#333', fontStyle: 'italic' }}>No genres yet — click edit to add</p>
              ) : genres.map(g => (
                <span key={g} style={{ fontSize: 12, background: 'rgba(59,139,255,0.08)', border: '1px solid rgba(59,139,255,0.2)', color: '#3B8BFF', padding: '4px 12px', borderRadius: 20, fontFamily: "'DM Sans',sans-serif'" }}>
                  {g}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={genreDraft}
                onChange={e => setGenreDraft(e.target.value)}
                placeholder="Hip-Hop, Afrobeats, R&B, …"
                rows={2}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', resize: 'none', outline: 'none', fontFamily: "'DM Sans',sans-serif'" }}
              />
              <p style={{ margin: 0, fontSize: 10, color: '#444' }}>Comma-separated list</p>
              <button
                onClick={() => updatePassport.mutate({ genres_produced: genreDraft.split(',').map(s => s.trim()).filter(Boolean) })}
                disabled={updatePassport.isPending}
                style={{ alignSelf: 'flex-end', fontSize: 12, color: '#000', background: '#5A9BCB', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}
              >
                {updatePassport.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Signature tags */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono',monospace'" }}>SIGNATURE TAGS</p>
            <button
              onClick={() => { setEditingTags(v => !v); setTagDraft(tags.join(', ')); }}
              style={{ fontSize: 10, color: '#444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace'" }}
            >
              {editingTags ? 'cancel' : 'edit'}
            </button>
          </div>

          {!editingTags ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tags.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#333', fontStyle: 'italic' }}>No tags yet — your production fingerprint</p>
              ) : tags.map(t => (
                <span key={t} style={{ fontSize: 12, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', color: '#a78bfa', padding: '4px 12px', borderRadius: 20, fontFamily: "'DM Sans',sans-serif'" }}>
                  #{t}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                placeholder="melodic, 808s, dark trap, …"
                rows={2}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', resize: 'none', outline: 'none', fontFamily: "'DM Sans',sans-serif'" }}
              />
              <p style={{ margin: 0, fontSize: 10, color: '#444' }}>Comma-separated list</p>
              <button
                onClick={() => updatePassport.mutate({ signature_tags: tagDraft.split(',').map(s => s.trim()).filter(Boolean) })}
                disabled={updatePassport.isPending}
                style={{ alignSelf: 'flex-end', fontSize: 12, color: '#000', background: '#5A9BCB', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}
              >
                {updatePassport.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Catalogue — beats/samples, preview-only for now */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono',monospace'" }}>CATALOGUE</p>
            <button
              onClick={() => setAddingTrack(v => !v)}
              style={{ fontSize: 10, color: '#444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace'" }}
            >
              {addingTrack ? 'cancel' : '+ upload'}
            </button>
          </div>

          {addingTrack && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: (tracks as any[]).length > 0 ? 20 : 0 }}>
              <input
                value={trackTitle}
                onChange={e => setTrackTitle(e.target.value)}
                placeholder="Track title"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: "'DM Sans',sans-serif'" }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  value={trackBpm}
                  onChange={e => setTrackBpm(e.target.value.replace(/\D/g, ''))}
                  placeholder="BPM (optional)"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: "'DM Sans',sans-serif'" }}
                />
                <input
                  value={trackGenre}
                  onChange={e => setTrackGenre(e.target.value)}
                  placeholder="Genre (optional)"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: "'DM Sans',sans-serif'" }}
                />
              </div>
              <input
                value={trackTags}
                onChange={e => setTrackTags(e.target.value)}
                placeholder="Tags — dark, 808s, melodic, … (optional)"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: "'DM Sans',sans-serif'" }}
              />
              <button
                onClick={() => trackFileRef.current?.click()}
                disabled={uploadTrack.isPending}
                style={{ alignSelf: 'flex-end', fontSize: 12, color: '#000', background: '#5A9BCB', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: uploadTrack.isPending ? 'wait' : 'pointer', fontWeight: 600 }}
              >
                {uploadTrack.isPending ? 'Uploading…' : 'Choose audio file'}
              </button>
              <input ref={trackFileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={onTrackFileChange} />
            </div>
          )}

          {(tracks as any[]).length === 0 ? (
            !addingTrack && (
              <p style={{ margin: 0, fontSize: 12, color: '#333', fontStyle: 'italic' }}>No tracks yet — upload a beat to start your catalogue</p>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(tracks as any[]).map(t => (
                <div key={t.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, color: '#fff', fontWeight: 600 }}>{t.title}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#555' }}>
                        {[t.genre, t.bpm ? `${t.bpm} BPM` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      onClick={() => archiveTrack.mutate(t.id)}
                      disabled={archiveTrack.isPending}
                      style={{ fontSize: 10, color: '#444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace'" }}
                    >
                      remove
                    </button>
                  </div>
                  <audio
                    controls
                    src={t.file_url.startsWith('/') ? `${API_ORIGIN}${t.file_url}` : t.file_url}
                    style={{ width: '100%', height: 32 }}
                  />
                  {(t.tags as string[])?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {(t.tags as string[]).map(tag => (
                        <span key={tag} style={{ fontSize: 10, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', color: '#a78bfa', padding: '2px 9px', borderRadius: 20 }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Phase pipeline */}
        {(projects as any[]).length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono',monospace'" }}>PROJECT PIPELINE</p>
            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {Object.entries(PHASE_LABELS).map(([phase, label]) => {
                const count = phaseCounts[phase] ?? 0;
                const isActive = count > 0;
                return (
                  <div key={phase} style={{ flex: 1, textAlign: 'center', padding: '10px 4px', background: isActive ? 'rgba(90,155,203,0.06)' : 'transparent', borderRight: '1px solid var(--border)' }}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isActive ? '#5A9BCB' : '#333', fontFamily: "'JetBrains Mono',monospace'" }}>{count}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 9, color: isActive ? '#555' : '#2a2a2a', fontFamily: "'JetBrains Mono',monospace'", letterSpacing: '0.04em' }}>{label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>
    </div>
    </div>
  );
}
