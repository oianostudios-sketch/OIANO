/**
 * OnboardingSequencePage — Screens 2-5 of the cold-demo onboarding wireframe.
 * Identity -> Status -> Calendar -> Formation, hard cuts only, no wizard
 * chrome (no progress bar, no "Next" buttons where the spec calls for
 * auto-advance). Screen 1 (auth) lives in EnterPage, which routes here on a
 * brand-new signup.
 *
 * Identity Formation Audit (this session) rewrote Identity and Formation —
 * multi-select sound instead of one chip, a stage-name field, and a real
 * Oiano payoff screen instead of unrelated placeholder branding. Status and
 * Calendar are real working features (availability, a real booking) outside
 * that audit's scope and are unchanged.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { refreshMe } from '../lib/refreshMe';
import { useToast } from '../components/Toast';
import { initials } from '../components/ArtistAvatar';

// Dome (Aegean blue) is the everyday primary — selection states, confirm
// actions. Sunset (warm amber, matches --amber/--live-accent) is reserved for
// the one intentional "loud" moment: the confirmation payoff.
const DOME = '#5A9BCB';
const GOLD = '#d3b35c';
const SUNSET = '#E8823A';
const GENRES = [
  'Hip-Hop', 'R&B', 'Afrobeats', 'Pop', 'Electronic', 'Trap',
  'Drill', 'Soul', 'Gospel', 'Jazz', 'Rock', 'Amapiano',
];
// A demonstrated pattern, not a claim of global genre-taxonomy completeness —
// see the Identity Formation Audit's Implementation Plan. Extending this
// table is a content task, not a code change.
const SHAPE_IT: Record<string, string[]> = {
  'Afrobeats': ['Soul', 'Krio', 'R&B', 'Highlife', 'Alternative'],
  'Amapiano': ['Jazz', 'Gospel', 'Deep House', 'Log Drum'],
  'Drill': ['UK', 'Melodic', 'Sample Drill'],
  'Hip-Hop': ['Boom Bap', 'Trap', 'Conscious', 'Lo-fi'],
  'R&B': ['Neo-Soul', 'Alternative', 'Gospel'],
};
const MAX_SOUNDS = 4;

type Step = 'identity' | 'status' | 'calendar' | 'formation';

interface SharedState {
  name: string;
  alias: string | null;
  sounds: string[];
  location: string | null;
  avatarUrl: string | null;
  bookingSlot: { starts_at: string; ends_at: string; roomName: string } | null;
}

// The same identity object across Identity and Formation — a real photo once
// given, otherwise initials on a quiet gold-rimmed field, echoing
// ArtistAvatar's own fallback treatment rather than inventing a second one.
function IdentityNucleus({ name, avatarPreview, uploading, size = 96 }: { name: string; avatarPreview: string | null; uploading?: boolean; size?: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      background: avatarPreview ? undefined : 'linear-gradient(145deg,#18242c 0%,#0b1014 58%,#171309 100%)',
      border: `1px solid ${avatarPreview ? 'rgba(255,255,255,.12)' : 'rgba(211,179,92,.28)'}`,
      boxShadow: avatarPreview ? '0 10px 32px rgba(0,0,0,.28)' : '0 10px 32px rgba(0,0,0,.28), 0 0 30px rgba(211,179,92,.08)',
    }}>
      {avatarPreview ? (
        <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploading ? 0.5 : 1 }} />
      ) : (
        <>
          <span aria-hidden="true" style={{ position: 'absolute', width: '72%', height: '72%', right: '-30%', top: '-30%', borderRadius: '50%', border: '1px solid rgba(211,179,92,.16)' }} />
          <span aria-hidden="true" style={{ position: 'relative', color: '#b8d3e3', fontFamily: "'Playfair Display',serif", fontSize: size * 0.32, fontWeight: 600, letterSpacing: '-.04em' }}>
            {name.trim() ? initials(name) : '+'}
          </span>
        </>
      )}
      {uploading && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(90,155,203,0.25)', borderTopColor: DOME, animation: 'onb-spin 0.7s linear infinite' }} />
        </span>
      )}
    </span>
  );
}

// ── Screen 2 — Identity ───────────────────────────────────────────────────────
function IdentityStep({ onAdvance }: { onAdvance: (s: Partial<SharedState>) => void }) {
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [showAlias, setShowAlias] = useState(false);
  const [sounds, setSounds] = useState<string[]>([]);
  const [customSound, setCustomSound] = useState('');
  const [shapeGenre, setShapeGenre] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const visibleGenres = showAllGenres ? GENRES : GENRES.slice(0, 6);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    const form = new FormData();
    form.append('avatar', file);
    const { token, setAuth } = useAuthStore.getState();
    api.patch('/passport/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 })
      .then(() => refreshMe(setAuth, token))
      .catch((err) => {
        console.error('[onboarding] avatar upload failed:', err?.message);
        setAvatarPreview(null);
        toast.error("Your photo didn't upload — try again.");
      })
      .finally(() => setUploadingPhoto(false));
  }

  function toggleSound(s: string) {
    setSounds((current) => {
      if (current.includes(s)) return current.filter((item) => item !== s);
      if (current.length >= MAX_SOUNDS) return current;
      return [...current, s];
    });
    if (!SHAPE_IT[s]) return;
    setShapeGenre((current) => (current === s ? current : s));
  }

  function addCustomSound() {
    const value = customSound.trim();
    if (!value || sounds.includes(value) || sounds.length >= MAX_SOUNDS) return;
    setSounds((current) => [...current, value]);
    setCustomSound('');
  }

  function continueOn() {
    if (!sounds.length || saving) return;
    setSaving(true);
    const trimmedName = name.trim();
    const trimmedAlias = alias.trim();
    const { token, setAuth } = useAuthStore.getState();
    api.patch('/passport/profile', {
      name: trimmedName || undefined,
      alias: trimmedAlias || undefined,
      creative_dna: { genres: sounds.slice(0, 1), influences: sounds.slice(1) },
    })
      .then(() => refreshMe(setAuth, token))
      .catch((err) => console.error('[onboarding] profile save failed:', err?.message))
      .finally(() => setSaving(false));
    onAdvance({ name: trimmedName, alias: trimmedAlias || null, sounds, avatarUrl: avatarPreview });
  }

  return (
    <div className="onb-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <label style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 24 }}>
          <IdentityNucleus name={name} avatarPreview={avatarPreview} uploading={uploadingPhoto} />
          <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
        </label>

        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '.14em', color: '#555', textTransform: 'uppercase', margin: '0 0 10px' }}>
          What should the world call you?
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', textAlign: 'center',
            background: 'transparent', border: 'none', borderBottom: '1px solid #2a2a2a',
            color: '#f0ede8', fontSize: 22, fontFamily: "'Playfair Display', serif",
            padding: '8px 0', outline: 'none',
          }}
        />

        {showAlias ? (
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Stage name (optional)"
            style={{
              width: '100%', boxSizing: 'border-box', textAlign: 'center', marginTop: 10,
              background: 'transparent', border: 'none', borderBottom: '1px solid #202020',
              color: '#999', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
              padding: '6px 0', outline: 'none',
            }}
          />
        ) : (
          <button type="button" onClick={() => setShowAlias(true)} style={{ background: 'none', border: 'none', color: '#555', fontSize: 11, marginTop: 10, cursor: 'pointer' }}>
            Perform under a different name? +
          </button>
        )}

        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '.14em', color: '#555', textTransform: 'uppercase', margin: '32px 0 12px' }}>
          Where does your sound live?
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {visibleGenres.map((g) => {
            const selected = sounds.includes(g);
            return (
              <button type="button" key={g} onClick={() => toggleSound(g)} aria-pressed={selected} style={{
                padding: '8px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', font: 'inherit',
                border: `1px solid ${selected ? DOME : '#2a2a2a'}`,
                background: selected ? `${DOME}22` : 'transparent',
                color: selected ? DOME : '#999',
                transition: 'all 0.15s',
              }}>{g}</button>
            );
          })}
          {!showAllGenres && (
            <button type="button" onClick={() => setShowAllGenres(true)} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', color: '#555', border: '1px solid transparent', background: 'none', font: 'inherit' }}>more →</button>
          )}
        </div>

        {shapeGenre && SHAPE_IT[shapeGenre] && (
          <div className="onb-slot-expand" style={{ marginTop: 18 }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 14, color: '#888', margin: '0 0 10px' }}>Shape it.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {SHAPE_IT[shapeGenre].map((s) => {
                const label = `${shapeGenre} · ${s}`;
                const selected = sounds.includes(s);
                return (
                  <button type="button" key={s} onClick={() => toggleSound(s)} aria-pressed={selected} aria-label={label} style={{
                    padding: '6px 13px', borderRadius: 20, fontSize: 11.5, cursor: 'pointer', font: 'inherit',
                    border: `1px solid ${selected ? GOLD : '#242424'}`,
                    background: selected ? `${GOLD}1a` : 'transparent',
                    color: selected ? GOLD : '#777',
                  }}>+ {s}</button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <input
            value={customSound}
            onChange={(e) => setCustomSound(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSound(); } }}
            placeholder="I don't fit one sound — describe it"
            style={{
              background: 'transparent', border: 'none', borderBottom: '1px solid #202020',
              color: '#ccc', fontSize: 12.5, textAlign: 'center', padding: '6px 4px', outline: 'none', width: 240,
            }}
          />
        </div>
        {sounds.filter((s) => !GENRES.includes(s) && !Object.values(SHAPE_IT).flat().includes(s)).length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {sounds.filter((s) => !GENRES.includes(s) && !Object.values(SHAPE_IT).flat().includes(s)).map((s) => (
              <button type="button" key={s} onClick={() => toggleSound(s)} aria-label={`Remove ${s}`} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11.5, cursor: 'pointer', font: 'inherit', border: `1px solid ${SUNSET}`, background: `${SUNSET}18`, color: SUNSET }}>{s} ×</button>
            ))}
          </div>
        )}

        {sounds.length > 0 && (
          <button type="button" onClick={continueOn} disabled={saving} style={{
            marginTop: 30, background: 'none', border: 'none', color: DOME, fontSize: 13,
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? '…' : 'Continue →'}
          </button>
        )}
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
        // studio_id became a required field on this endpoint at some point
        // after this demo flow was written — room-vocal-booth/svc-recording
        // both belong to dreamz-music-lab, confirmed directly against the DB.
        // Without this every new artist got stuck here and never reached
        // Formation at all.
        studio_id: 'c7af1079-df54-4b47-9ce5-e8f6eee74a22',
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
                        background: taken ? 'repeating-linear-gradient(45deg, #161616, #161616 4px, #1c1c1c 4px, #1c1c1c 8px)' : (isExpanded ? `${DOME}22` : '#141414'),
                        border: `1px solid ${isExpanded ? DOME : '#222'}`,
                        color: taken ? '#3a3a3a' : (isExpanded ? DOME : '#999'),
                      }}
                    >
                      {hour > 12 ? hour - 12 : hour}{hour >= 12 ? 'pm' : 'am'}
                    </div>
                    {isExpanded && (
                      <div className="onb-slot-expand" style={{
                        marginTop: 4, padding: '8px', borderRadius: 6,
                        background: '#0d0d0d', border: `1px solid ${DOME}`, textAlign: 'center',
                      }}>
                        <button
                          disabled={booking}
                          onClick={() => confirmSlot(day, hour)}
                          style={{
                            width: '100%', padding: '8px', borderRadius: 6, border: 'none',
                            background: DOME, color: '#000', fontWeight: 700, fontSize: 11,
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

// ── Screen 5 — Formation ────────────────────────────────────────────────────
function FormationStep({ state, onDone }: { state: SharedState; onDone: () => void }) {
  const slot = state.bookingSlot;
  const timeLabel = slot
    ? `${new Date(slot.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · ${new Date(slot.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';

  useEffect(() => {
    api.post('/passport/onboarding/complete').catch((err) => console.error('[onboarding] complete flag failed:', err?.message));
  }, []);

  return (
    <div className="onb-screen" onClick={onDone} style={{
      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textAlign: 'center',
    }}>
      <div className="onb-diamond">
        <IdentityNucleus name={state.name} avatarPreview={state.avatarUrl} size={112} />
      </div>

      <p style={{
        fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 22,
        color: '#f0ede8', margin: '22px 0 6px',
      }}>Your Oiano is forming.</p>

      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: '0.08em', color: SUNSET, marginBottom: 4 }}>
        {state.alias || state.name || 'Artist'}
      </p>
      {state.sounds.length > 0 && (
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: '0.06em', color: '#888', marginBottom: 24 }}>
          {state.sounds.join(' · ')}
        </p>
      )}

      {slot && (
        <p style={{ fontSize: 13, color: '#777' }}>{timeLabel} · {slot.roomName}</p>
      )}
    </div>
  );
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
export default function OnboardingSequencePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedNext = searchParams.get('next');
  const safeNext = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/calendar';
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<Step>('identity');
  const [state, setState] = useState<SharedState>({
    name: user?.artist?.name ?? '', alias: user?.artist?.alias ?? null, sounds: [],
    location: null, avatarUrl: user?.artist?.avatar_url ?? null, bookingSlot: null,
  });

  // A returning artist who already formed their identity should never land
  // back on Identity/Status/Calendar by accident — Calendar creates a real
  // booking, so re-running this sequence isn't a harmless replay.
  useEffect(() => {
    if (user?.artist?.onboarding_completed_at) navigate(safeNext, { replace: true });
  }, []);

  return (
    <div className="onb-shell page-enter">
      {step === 'identity' && (
        <IdentityStep onAdvance={(s) => { setState((prev) => ({ ...prev, ...s })); setStep('status'); }} />
      )}
      {step === 'status' && (
        <StatusStep onAdvance={() => setStep('calendar')} />
      )}
      {step === 'calendar' && (
        <CalendarStep onAdvance={(slot) => { setState((prev) => ({ ...prev, bookingSlot: slot })); setStep('formation'); }} />
      )}
      {step === 'formation' && (
        <FormationStep state={state} onDone={() => navigate(safeNext)} />
      )}
    </div>
  );
}
