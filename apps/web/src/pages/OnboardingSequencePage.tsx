/**
 * OnboardingSequencePage — Screens 2-5 of the cold-demo onboarding wireframe.
 * Identity -> Status -> Calendar -> Confirmation, hard cuts only, no wizard
 * chrome (no progress bar, no "Next" buttons where the spec calls for
 * auto-advance). Screen 1 (auth) lives in EnterPage, which routes here on a
 * brand-new signup.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

const GOLD = '#C9A84C';
const GENRES = [
  'Hip-Hop', 'R&B', 'Afrobeats', 'Pop', 'Electronic', 'Trap',
  'Drill', 'Soul', 'Gospel', 'Jazz', 'Rock', 'Amapiano',
];

type Step = 'identity' | 'status' | 'calendar' | 'confirmation';

interface SharedState {
  name: string;
  genre: string | null;
  avatarUrl: string | null;
  bookingSlot: { starts_at: string; ends_at: string; roomName: string } | null;
}

// ── Screen 2 — Identity ───────────────────────────────────────────────────────
function IdentityStep({ onAdvance }: { onAdvance: (s: Partial<SharedState>) => void }) {
  const [name, setName] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showAllGenres, setShowAllGenres] = useState(false);

  const visibleGenres = showAllGenres ? GENRES : GENRES.slice(0, 6);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    const form = new FormData();
    form.append('avatar', file);
    api.patch('/passport/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .catch((err) => console.error('[onboarding] avatar upload failed:', err?.message));
  }

  function selectGenre(g: string) {
    setGenre(g);
    // Auto-advance the moment a genre is picked — name/photo can be filled
    // later, this isn't gated on completeness.
    api.patch('/passport/profile', {
      name: name.trim() || undefined,
      creative_dna: { genres: [g] },
    }).catch((err) => console.error('[onboarding] profile save failed:', err?.message));
    onAdvance({ name: name.trim() || undefined, genre: g });
  }

  return (
    <div className="onb-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <label style={{
          display: 'inline-block', width: 96, height: 96, borderRadius: '50%',
          cursor: 'pointer', marginBottom: 28, position: 'relative', overflow: 'hidden',
          background: avatarPreview ? undefined : 'radial-gradient(circle at 35% 30%, #3a2f14, #0f0d08)',
          border: '1px solid #2a2a2a',
        }}>
          {avatarPreview && (
            <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {!avatarPreview && (
            <span style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: GOLD, fontSize: 22, opacity: 0.6,
            }}>+</span>
          )}
          <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
        </label>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          style={{
            width: '100%', boxSizing: 'border-box', textAlign: 'center',
            background: 'transparent', border: 'none', borderBottom: '1px solid #2a2a2a',
            color: '#f0ede8', fontSize: 22, fontFamily: "'Playfair Display', serif",
            padding: '8px 0', outline: 'none', marginBottom: 36,
          }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {visibleGenres.map((g) => (
            <span key={g} onClick={() => selectGenre(g)} style={{
              padding: '8px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${genre === g ? GOLD : '#2a2a2a'}`,
              background: genre === g ? `${GOLD}22` : 'transparent',
              color: genre === g ? GOLD : '#999',
              transition: 'all 0.15s',
            }}>{g}</span>
          ))}
          {!showAllGenres && (
            <span onClick={() => setShowAllGenres(true)} style={{
              padding: '8px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              color: '#555', border: '1px solid transparent',
            }}>more →</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Screen 3 — Status ─────────────────────────────────────────────────────────
function StatusStep({ onAdvance }: { onAdvance: () => void }) {
  const [choosing, setChoosing] = useState(false);

  function choose(status: 'AVAILABLE_FOR_BOOKING' | 'UNAVAILABLE') {
    if (choosing) return;
    setChoosing(true);
    api.patch('/artists/me/status', { status })
      .catch((err) => console.error('[onboarding] status save failed:', err?.message))
      .finally(() => setTimeout(onAdvance, 500));
  }

  return (
    <div className="onb-screen" style={{ alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <button
        onClick={() => choose('AVAILABLE_FOR_BOOKING')}
        className="onb-status-dial onb-status-dial-available"
        style={{ opacity: choosing ? 0.5 : 1 }}
      >
        <span className="onb-status-glow" />
        <span style={{ position: 'relative', zIndex: 1 }}>Available for Booking</span>
      </button>

      <button
        onClick={() => choose('UNAVAILABLE')}
        className="onb-status-dial onb-status-dial-not-yet"
        style={{ opacity: choosing ? 0.5 : 1 }}
      >
        Not Yet
      </button>
    </div>
  );
}

// ── Screen 4 — Calendar (simplified real slots) ───────────────────────────────
function CalendarStep({ onAdvance }: { onAdvance: (slot: SharedState['bookingSlot']) => void }) {
  const [expandedSlot, setExpandedSlot] = useState<{ day: Date; hour: number } | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');

  const HOURS = [10, 12, 14, 16, 18, 20];
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Simple deterministic "already booked" pattern so the grid isn't all-open —
  // real availability is checked server-side on confirm regardless.
  function isTaken(day: Date, hour: number) {
    return (day.getDate() + hour) % 5 === 0;
  }

  async function confirmSlot(day: Date, hour: number) {
    setBooking(true);
    setError('');
    try {
      const starts = new Date(day);
      starts.setHours(hour, 0, 0, 0);
      const ends = new Date(starts);
      ends.setHours(ends.getHours() + 1);

      const { data } = await api.post('/bookings', {
        room_id: 'room-vocal-booth',
        service_id: 'svc-recording',
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
      });

      onAdvance({
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        roomName: data.room?.name ?? 'Vocal Booth',
      });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not book that slot');
      setBooking(false);
    }
  }

  return (
    <div className="onb-screen" style={{ padding: '48px 32px' }}>
      <p style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.14em',
        color: '#555', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center',
      }}>Pick a session</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, maxWidth: 700, margin: '0 auto' }}>
        {days.map((day) => (
          <div key={day.toISOString()}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div style={{ fontSize: 14, color: '#ccc' }}>{day.getDate()}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {HOURS.map((hour) => {
                const taken = isTaken(day, hour);
                const isExpanded = expandedSlot?.day.toDateString() === day.toDateString() && expandedSlot?.hour === hour;
                return (
                  <div key={hour}>
                    <div
                      onClick={() => !taken && setExpandedSlot(isExpanded ? null : { day, hour })}
                      style={{
                        padding: '8px 4px', borderRadius: 6, fontSize: 11, textAlign: 'center',
                        cursor: taken ? 'default' : 'pointer',
                        background: taken ? 'repeating-linear-gradient(45deg, #161616, #161616 4px, #1c1c1c 4px, #1c1c1c 8px)' : (isExpanded ? `${GOLD}22` : '#141414'),
                        border: `1px solid ${isExpanded ? GOLD : '#222'}`,
                        color: taken ? '#3a3a3a' : (isExpanded ? GOLD : '#999'),
                      }}
                    >
                      {hour > 12 ? hour - 12 : hour}{hour >= 12 ? 'pm' : 'am'}
                    </div>
                    {isExpanded && (
                      <div className="onb-slot-expand" style={{
                        marginTop: 4, padding: '8px', borderRadius: 6,
                        background: '#0d0d0d', border: `1px solid ${GOLD}`, textAlign: 'center',
                      }}>
                        <button
                          disabled={booking}
                          onClick={() => confirmSlot(day, hour)}
                          style={{
                            width: '100%', padding: '8px', borderRadius: 6, border: 'none',
                            background: GOLD, color: '#000', fontWeight: 700, fontSize: 11,
                            cursor: booking ? 'wait' : 'pointer',
                          }}
                        >{booking ? '…' : 'Confirm'}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p style={{ textAlign: 'center', color: '#f87171', fontSize: 12, marginTop: 20 }}>{error}</p>
      )}
    </div>
  );
}

// ── Screen 5 — Confirmation ────────────────────────────────────────────────────
function ConfirmationStep({ state, onDone }: { state: SharedState; onDone: () => void }) {
  const slot = state.bookingSlot;
  const timeLabel = slot
    ? `${new Date(slot.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · ${new Date(slot.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';

  return (
    <div className="onb-screen" onClick={onDone} style={{
      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textAlign: 'center',
    }}>
      <svg width="120" height="120" viewBox="0 0 120 120" className="onb-diamond">
        <polygon points="60,8 100,40 84,108 36,108 20,40" fill="none" stroke={GOLD} strokeWidth="1.4" />
        <polygon points="60,8 100,40 60,52 20,40" fill={`${GOLD}22`} stroke={GOLD} strokeWidth="1" />
        <polygon points="20,40 60,52 36,108" fill={`${GOLD}14`} stroke={GOLD} strokeWidth="1" />
        <polygon points="100,40 84,108 60,52" fill={`${GOLD}1a`} stroke={GOLD} strokeWidth="1" />
        <line x1="60" y1="52" x2="60" y2="8" stroke={GOLD} strokeWidth="0.6" opacity="0.6" />
      </svg>

      <p style={{
        fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 22,
        color: '#f0ede8', margin: '20px 0 6px',
      }}>You're in The Rough.</p>

      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: '0.1em', color: GOLD, marginBottom: 24 }}>
        {state.name || 'Artist'} {state.genre ? `· ${state.genre}` : ''}
      </p>

      {slot && (
        <p style={{ fontSize: 13, color: '#777' }}>{timeLabel} · {slot.roomName}</p>
      )}
    </div>
  );
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
export default function OnboardingSequencePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<Step>('identity');
  const [state, setState] = useState<SharedState>({
    name: user?.artist?.name ?? '', genre: null, avatarUrl: null, bookingSlot: null,
  });

  return (
    <div className="onb-shell page-enter">
      {step === 'identity' && (
        <IdentityStep onAdvance={(s) => { setState((prev) => ({ ...prev, ...s })); setStep('status'); }} />
      )}
      {step === 'status' && (
        <StatusStep onAdvance={() => setStep('calendar')} />
      )}
      {step === 'calendar' && (
        <CalendarStep onAdvance={(slot) => { setState((prev) => ({ ...prev, bookingSlot: slot })); setStep('confirmation'); }} />
      )}
      {step === 'confirmation' && (
        <ConfirmationStep state={state} onDone={() => navigate('/calendar')} />
      )}
    </div>
  );
}
