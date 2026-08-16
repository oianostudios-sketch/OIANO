/**
 * ArtistPassportCard
 * Animated flip card — click or tap to flip.
 * Front: avatar, name, alias, passport code, genres.
 * Back:  creative DNA detail, profile strength, energy, OIANO watermark.
 */
import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from './Toast';
import { useAuthStore } from '../store/auth.store';
import { getPersonality } from '../lib/personality';
import ArtistAvatar from './ArtistAvatar';
import OianoBrand from './OianoBrand';
import { Camera } from 'lucide-react';

interface PassportCardProps {
  artist: {
    id: string;
    name: string;
    alias?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    passport?: {
      passport_code?: string;
      profile_strength?: number;
      creative_dna?: {
        genres?: string[];
        vocal_type?: string;
        energy_profile?: string;
        key_themes?: string[];
        influences?: string[];
      };
    } | null;
  };
  editable?: boolean;   // show an explicit avatar upload action
  size?: 'sm' | 'md' | 'lg';
}

export default function ArtistPassportCard({ artist, editable = false, size = 'md' }: PassportCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [hover, setHover] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const dna = artist.passport?.creative_dna ?? {};
  const strength = artist.passport?.profile_strength ?? 0;
  const code = artist.passport?.passport_code ?? 'OIANO-????';
  const energy = dna.energy_profile ?? '';
  const personality = getPersonality(energy);
  const energyColor = personality.color;

  const cardWidth  = size === 'sm' ? 260 : size === 'lg' ? 380 : 320;
  const cardHeight = size === 'sm' ? 360 : size === 'lg' ? 530 : 440;

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('avatar', file);
      return api.patch('/passport/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['artist', artist.id] });
      qc.invalidateQueries({ queryKey: ['passport'] });

      // The Zustand auth store isn't React-Query-driven — invalidating
      // queries above does nothing for it. Without this, the new photo
      // never appears anywhere that reads user.artist until next login.
      const { user, token } = useAuthStore.getState();
      if (user?.artist && token) {
        useAuthStore.getState().setAuth(token, {
          ...user,
          artist: { ...user.artist, avatar_url: res.data.avatar_url },
        });
      }

      toast.success('Avatar updated');
      setJustUploaded(true);
      setTimeout(() => setJustUploaded(false), 1200);
    },
    onError: () => toast.error('Upload failed'),
  });

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAvatar.mutate(file);
  }, []);

  return (
    <div
      style={{ width: cardWidth, height: cardHeight, perspective: 1200 }}
      role="button"
      tabIndex={0}
      aria-label={`Artist passport for ${artist.name}. Press Enter to flip.`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setFlipped((f) => !f);
        }
      }}
    >
      <style>{`
        @keyframes apc-shimmer-sweep {
          0%, 62% { transform: translateX(-180%) rotate(10deg); opacity: 0; }
          66%     { opacity: 0.18; }
          82%     { opacity: 0.72; }
          96%     { transform: translateX(540%) rotate(10deg); opacity: 0; }
          100%    { transform: translateX(540%) rotate(10deg); opacity: 0; }
        }
        @keyframes apc-upload-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(90,155,203,0.55); }
          70%  { box-shadow: 0 0 0 14px rgba(90,155,203,0); }
          100% { box-shadow: 0 0 0 0 rgba(90,155,203,0); }
        }
        .apc-avatar-pulse { animation: apc-upload-pulse 1.2s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .apc-shimmer { animation: none !important; }
          .apc-avatar-pulse { animation: none; }
        }
      `}</style>
      {/* Perspective container */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.65s cubic-bezier(0.4, 0.2, 0.2, 1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          cursor: 'pointer',
        }}
      >
        {/* ── FRONT ──────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            borderRadius: 20,
            overflow: 'hidden',
            background: 'linear-gradient(145deg, #141414 0%, #0a0a0a 60%, #1a1500 100%)',
            boxShadow: hover
              ? '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(90,155,203,0.3), inset 0 1px 0 rgba(90,155,203,0.15)'
              : '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(90,155,203,0.15)',
            transition: 'box-shadow 0.3s ease',
          }}
        >
          {/* A restrained security-foil sweep with a long rest between passes. */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 10 }}>
            <div
              className="apc-shimmer"
              style={{
                position: 'absolute',
                top: '-50%',
                left: 0,
                width: '22%',
                height: '200%',
                background: `linear-gradient(110deg, transparent 0%, rgba(90,155,203,0.02) 22%, rgba(255,255,255,${hover ? '.13' : '.075'}) 47%, rgba(${personality.rgb},${hover ? '.18' : '.10'}) 58%, rgba(201,168,76,${hover ? '.12' : '.065'}) 72%, transparent 100%)`,
                filter: 'blur(.35px)',
                transition: 'background 0.4s ease',
                animationName: 'apc-shimmer-sweep',
                animationDuration: hover ? '5.8s' : '9.5s',
                animationTimingFunction: 'cubic-bezier(.34,.05,.22,1)',
                animationIterationCount: 'infinite',
              }}
            />
          </div>

          {/* Top strip — personality-colored */}
          <div style={{
            height: 4,
            background: `linear-gradient(90deg, rgba(${personality.rgb},0.5), rgba(${personality.rgb},1), rgba(${personality.rgb},0.6), rgba(${personality.rgb},1), rgba(${personality.rgb},0.5))`,
          }} />

          {/* Header row */}
          <div style={{ padding: '14px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <OianoBrand variant="mono" size={size === 'sm' ? 11 : 13} />
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: '#555',
              letterSpacing: 1.5,
            }}>
              ARTIST PASSPORT
            </span>
          </div>

          {/* Avatar */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, position: 'relative' }}>
            <div
              className={justUploaded ? 'apc-avatar-pulse' : undefined}
              style={{
                width: size === 'sm' ? 90 : 120,
                height: size === 'sm' ? 90 : 120,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid rgba(90,155,203,0.4)',
                background: '#1e1e1e',
                position: 'relative',
              }}
            >
              <ArtistAvatar src={artist.avatar_url} name={artist.alias ?? artist.name} size="100%" decorative={false} />
            </div>

            {editable && (
              <>
                <button
                  type="button"
                  aria-label={artist.avatar_url ? 'Change artist photo' : 'Add artist photo'}
                  title={artist.avatar_url ? 'Change artist photo' : 'Add artist photo'}
                  disabled={uploadAvatar.isPending}
                  onClick={(event) => {
                    event.stopPropagation();
                    fileRef.current?.click();
                  }}
                  style={{
                    position: 'absolute', left: 'calc(50% + 32px)', bottom: -2,
                    width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    border: '1px solid rgba(90,155,203,.38)', background: '#111820', color: '#8fc0df',
                    boxShadow: '0 5px 14px rgba(0,0,0,.55)', cursor: uploadAvatar.isPending ? 'wait' : 'pointer',
                    zIndex: 12,
                  }}
                >
                  <Camera size={13} aria-hidden="true" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
              </>
            )}
          </div>

          {/* Name + alias */}
          <div style={{ textAlign: 'center', padding: '14px 20px 8px' }}>
            <p style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: size === 'sm' ? 18 : 22,
              color: '#ffffff',
              margin: 0,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}>
              {artist.name}
            </p>
            {artist.alias && (
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: '#5A9BCB',
                margin: '4px 0 0',
                letterSpacing: 2,
              }}>
                {artist.alias}
              </p>
            )}
          </div>

          {/* Genres */}
          {dna.genres && dna.genres.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center', padding: '4px 20px' }}>
              {dna.genres.slice(0, 4).map((g: string) => (
                <span key={g} style={{
                  fontSize: 9,
                  padding: '3px 9px',
                  borderRadius: 20,
                  border: '1px solid rgba(90,155,203,0.3)',
                  color: '#5A9BCB',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 0.5,
                  background: 'rgba(90,155,203,0.06)',
                }}>
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Divider */}
          <div style={{ margin: '14px 20px', height: 1, background: 'linear-gradient(90deg, transparent, rgba(90,155,203,0.2), transparent)' }} />

          {/* Passport code + strength */}
          <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <p style={{ fontSize: 8, color: '#555', fontFamily: "'JetBrains Mono', monospace", margin: '0 0 3px', letterSpacing: 1.5 }}>
                PASSPORT CODE
              </p>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                color: '#8BBEDD',
                margin: 0,
                letterSpacing: 1,
              }}>
                {code}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 8, color: '#555', fontFamily: "'JetBrains Mono', monospace", margin: '0 0 5px', letterSpacing: 1.5 }}>
                PROFILE
              </p>
              {/* Strength arc */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 56, height: 4, borderRadius: 2, background: '#1e1e1e', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${strength}%`,
                    background: `linear-gradient(90deg, #3D6A8A, #5A9BCB)`,
                    borderRadius: 2,
                    transition: 'width 0.8s ease',
                  }} />
                </div>
                <span style={{ fontSize: 10, color: '#5A9BCB', fontFamily: "'JetBrains Mono', monospace" }}>
                  {strength}%
                </span>
              </div>
            </div>
          </div>

          {/* Tap hint */}
          <div style={{
            position: 'absolute',
            bottom: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 8,
            color: '#333',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 1,
            opacity: hover ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}>
            TAP TO FLIP
          </div>
        </div>

        {/* ── BACK ───────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 20,
            overflow: 'hidden',
            background: 'linear-gradient(155deg, #0d0d0d 0%, #0a0a0a 50%, #110e00 100%)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(90,155,203,0.15)',
          }}
        >
          {/* Top strip — personality-colored, matches front */}
          <div style={{
            height: 4,
            background: `linear-gradient(90deg, rgba(${personality.rgb},0.5), rgba(${personality.rgb},1), rgba(${personality.rgb},0.6), rgba(${personality.rgb},1), rgba(${personality.rgb},0.5))`,
          }} />

          <div style={{ padding: '18px 22px', height: 'calc(100% - 4px)', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Back header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 13,
                color: '#5A9BCB',
                margin: 0,
                letterSpacing: 2,
              }}>
                CREATIVE DNA
              </p>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: '#444',
                letterSpacing: 1,
              }}>
                {code}
              </span>
            </div>

            {/* Bio */}
            {artist.bio && (
              <p style={{
                fontSize: 11,
                color: '#888',
                fontFamily: "'DM Sans', sans-serif",
                lineHeight: 1.6,
                margin: 0,
                borderLeft: '2px solid rgba(90,155,203,0.3)',
                paddingLeft: 10,
                fontStyle: 'italic',
              }}>
                {artist.bio.slice(0, 120)}{artist.bio.length > 120 ? '…' : ''}
              </p>
            )}

            {/* DNA rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {dna.vocal_type && (
                <DnaRow label="VOICE" value={dna.vocal_type} />
              )}

              {energy && (
                <DnaRow label="ENERGY" value={personality.label.toUpperCase()}>
                  <span style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: energyColor,
                    marginRight: 6,
                    flexShrink: 0,
                  }} />
                </DnaRow>
              )}

              {dna.influences && dna.influences.length > 0 && (
                <DnaRow label="SOUNDS LIKE" value={dna.influences.slice(0, 3).join(' · ')} />
              )}

              {dna.key_themes && dna.key_themes.length > 0 && (
                <DnaRow label="THEMES" value={dna.key_themes.slice(0, 4).join(', ')} />
              )}
            </div>

            {/* Strength meter */}
            <div style={{ marginTop: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 8, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5 }}>
                  PROFILE STRENGTH
                </span>
                <span style={{ fontSize: 10, color: strength >= 80 ? '#5A9BCB' : '#666', fontFamily: "'JetBrains Mono', monospace" }}>
                  {strength < 40 ? 'INCOMPLETE' : strength < 70 ? 'DEVELOPING' : strength < 90 ? 'STRONG' : 'COMPLETE'}
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: '#1a1a1a', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${strength}%`,
                  background: strength >= 80
                    ? 'linear-gradient(90deg, #6a9c6a, #88cc88)'
                    : 'linear-gradient(90deg, #3D6A8A, #5A9BCB)',
                  borderRadius: 3,
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>

            {/* Watermark */}
            <div style={{
              textAlign: 'center',
              borderTop: '1px solid #1a1a1a',
              paddingTop: 10,
            }}>
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 10,
                color: '#2a2a2a',
                margin: 0,
                letterSpacing: 4,
              }}>
                DREAMZ MUSIC LAB
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DnaRow({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8,
        color: '#555',
        letterSpacing: 1.5,
        width: 74,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        {children}
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          color: '#ccc',
        }}>
          {value}
        </span>
      </div>
    </div>
  );
}
