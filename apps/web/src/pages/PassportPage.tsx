/**
 * /passport — Shareable artist identity page.
 * Premium full-screen treatment: card hero + stats + creative DNA + strength ring.
 */
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';
import ArtistPassportCard from '../components/ArtistPassportCard';

// ── Profile strength ring ─────────────────────────────────────────────────────

function StrengthRing({ value }: { value: number }) {
  const R = 38;
  const C = 2 * Math.PI * R;
  const offset = C - (value / 100) * C;
  const color = value >= 80 ? '#4ade80' : value >= 50 ? '#C9A84C' : '#E8823A';
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
      <circle cx="45" cy="45" r={R} fill="none" stroke="#1a1a1a" strokeWidth="5" />
      <circle
        cx="45" cy="45" r={R} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={C} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 45 45)"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <text x="45" y="49" textAnchor="middle" fill={color}
        fontFamily="'JetBrains Mono', monospace" fontSize="12" fontWeight="700">
        {value}%
      </text>
    </svg>
  );
}

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
  const artist = user?.artist;

  const { data: passportData } = useQuery({
    queryKey: ['passport'],
    queryFn: async () => (await api.get('/passport')).data,
    enabled: !!artist,
  });

  const { data: rawBookings = [] } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const res = await api.get('/bookings');
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
    enabled: !!artist,
  });

  if (!artist) {
    return (
      <div style={{ minHeight: '100vh', background: '#060606', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#3a3a3a', fontSize: 13 }}>No artist profile found.</p>
      </div>
    );
  }

  const bookings = rawBookings as any[];
  const passport = passportData ?? (artist as any)?.passport;
  const dna = (passport as any)?.creative_dna ?? {};
  const genres: string[]  = dna.genres ?? [];
  const themes: string[]  = dna.key_themes ?? [];
  const vocalType: string | null   = dna.vocal_type ?? null;
  const energy: string | null      = dna.energy_profile ?? null;
  const strength: number           = (passport as any)?.profile_strength ?? 0;
  const passportCode: string       = (passport as any)?.passport_code ?? '——';

  const sessions = bookings.length;
  const hours = Math.round(bookings.reduce((sum, b) => {
    if (!b.starts_at || !b.ends_at) return sum;
    return sum + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000;
  }, 0));
  const memberSince = (artist as any).created_at
    ? new Date((artist as any).created_at).getFullYear()
    : new Date().getFullYear();

  const strengthDesc =
    strength >= 100 ? 'Complete passport — your identity is fully defined.' :
    strength >= 70  ? 'Strong profile — a few fields away from a complete passport.' :
    strength >= 40  ? 'Getting there — add bio, genres and vocal type.' :
    'New passport — fill in your profile to be discoverable.';

  const hasDNA = genres.length || themes.length || vocalType || energy;

  return (
    <div className="pp-shell page-enter">
      <style>{`
        .pp-shell {
          min-height: 100vh;
          background: #060606;
          color: #f5f5f5;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 24px 100px;
          position: relative;
          overflow-x: hidden;
        }
        .pp-glow {
          position: fixed; top: -100px; left: 50%;
          transform: translateX(-50%);
          width: 800px; height: 800px; border-radius: 50%;
          background: radial-gradient(circle, rgba(201,168,76,0.045) 0%, transparent 62%);
          pointer-events: none; z-index: 0;
        }
        .pp-topbar {
          width: 100%; max-width: 940px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 22px 0 36px;
          position: relative; z-index: 1;
        }
        .pp-topbar-btn {
          font-size: 11px; color: #3a3a3a; background: none;
          border: none; cursor: pointer; font-family: inherit;
          letter-spacing: 0.04em; transition: color 0.15s;
        }
        .pp-topbar-btn:hover { color: #888; }
        .pp-passport-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; letter-spacing: 0.26em;
          color: #222; text-transform: uppercase;
        }
        .pp-body {
          width: 100%; max-width: 940px;
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 44px;
          align-items: start;
          position: relative; z-index: 1;
        }
        .pp-card-col {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .pp-flip-hint {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; letter-spacing: 0.26em;
          color: #1e1e1e; text-transform: uppercase;
        }
        .pp-right {
          display: flex; flex-direction: column; gap: 20px;
          padding-top: 6px;
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
        .pp-stats {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 1px; background: #141414;
          border-radius: 10px; overflow: hidden;
          border: 1px solid #141414;
        }
        .pp-stat {
          background: #0e0e0e; padding: 16px 14px; text-align: center;
        }
        .pp-stat-val {
          font-family: 'Playfair Display', serif;
          font-size: 26px; font-weight: 700; color: #C9A84C; line-height: 1;
        }
        .pp-stat-lbl {
          font-size: 9px; color: #2a2a2a;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.12em; text-transform: uppercase; margin-top: 5px;
        }
        .pp-panel {
          background: #0d0d0d; border: 1px solid #1a1a1a;
          border-radius: 12px; padding: 16px 18px;
        }
        .pp-panel-label {
          font-size: 9px; color: #2a2a2a;
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
        @media (max-width: 800px) {
          .pp-body {
            grid-template-columns: 1fr;
            justify-items: center;
          }
          .pp-right { width: 100%; max-width: 420px; }
          .pp-name { font-size: 28px; }
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
        <button className="pp-topbar-btn" onClick={() => window.print()}>Print ↗</button>
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
            size="lg"
          />
          <p className="pp-flip-hint">click card to flip</p>
        </div>

        {/* Right: identity */}
        <div className="pp-right">

          {/* Name */}
          <div>
            <div className="pp-name">{artist.name}</div>
            {artist.alias && <div className="pp-alias">{artist.alias}</div>}
          </div>

          {/* Stats */}
          <div className="pp-stats">
            {[
              { val: sessions, lbl: 'Sessions' },
              { val: hours,    lbl: 'Hours at OIANO' },
              { val: memberSince, lbl: 'Member since' },
            ].map(s => (
              <div key={s.lbl} className="pp-stat">
                <div className="pp-stat-val">{s.val}</div>
                <div className="pp-stat-lbl">{s.lbl}</div>
              </div>
            ))}
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

          {/* Profile strength */}
          <div className="pp-panel">
            <div className="pp-strength-row">
              <StrengthRing value={strength} />
              <div className="pp-strength-info">
                <div className="pp-strength-title">Passport strength</div>
                <div className="pp-strength-desc">{strengthDesc}</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pp-actions">
            <button className="pp-btn pp-btn-primary" onClick={() => window.print()}>
              Save / Print
            </button>
            <a className="pp-btn" href={`/artists/${artist.id}`}>
              Full profile →
            </a>
            <a className="pp-btn" href="/dashboard">
              Dashboard →
            </a>
          </div>

        </div>
      </div>
    
    </div>
  );
}
