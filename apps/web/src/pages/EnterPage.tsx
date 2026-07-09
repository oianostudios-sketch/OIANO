import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import OianoUniverse from '../components/OianoUniverse';

// ── EnterPage — unified auth (Screen 1) ───────────────────────────────────────
// One form, one button, same flow for new and returning users. The backend
// (/api/auth/enter) decides signup vs login by whether the email exists.
export default function EnterPage() {
  const navigate = useNavigate();
  const setAuth  = useAuthStore((s) => s.setAuth);
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [focused,   setFocused]   = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [converging, setConverging] = useState(false);

  async function handleEnter() {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/enter', { email, password });
      setAuth(data.token, data.user);

      // Brief convergence beat — "loading as moment," capped well under 1.5s,
      // never a blank spinner.
      setConverging(true);
      setTimeout(() => {
        if (data.user.role === 'STUDIO_ADMIN') navigate('/admin');
        else if (data.created) navigate('/onboarding');
        else if (data.user.role === 'ARTIST') navigate('/calendar');
        else navigate('/dashboard');
      }, 1100);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong');
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0f0f0f', border: '1px solid #1e1e1e',
    color: '#f0ede8', borderRadius: 10, padding: '13px 16px',
    fontSize: 14, outline: 'none', fontFamily: 'inherit',
    transition: 'border-color 0.18s', boxSizing: 'border-box',
  };

  return (
    <div className="login-shell page-enter">

      {/* Brand / Universe panel */}
      <div className="login-brand-panel" style={{ position: 'relative', overflow: 'hidden', background: '#020101' }}>
        <OianoUniverse intensified={focused} />

        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          paddingBottom: '16%',
          pointerEvents: 'none',
        }}>
          <p className="login-brand-logotype" style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(4rem, 10vw, 7rem)',
            fontWeight: 400,
            color: '#C9A84C',
            letterSpacing: '0.12em',
            margin: 0,
            lineHeight: 1,
            textShadow: '0 0 80px rgba(201,168,76,0.18)',
          }}>OIANO</p>

          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 'clamp(0.52rem, 1.1vw, 0.68rem)',
            letterSpacing: '0.28em',
            color: 'rgba(201,168,76,0.40)',
            textTransform: 'uppercase',
            margin: '16px 0 0',
          }}>The Studio Management OS &middot; Dreamz Music Lab</p>
        </div>

        <div className="login-brand-studio" style={{
          position: 'absolute', bottom: 28, left: 0, right: 0,
          textAlign: 'center', zIndex: 2,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.6rem',
          letterSpacing: '0.28em',
          color: 'rgba(201,168,76,0.22)',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}>
          Discipline &middot; Order &middot; Sound
        </div>

        {/* Convergence flash — plays once, then the route changes underneath it */}
        {converging && <div className="enter-converge-flash" />}
      </div>

      {/* Form panel */}
      <div className="login-form-panel">
        <div className="login-form-inner">

          <div style={{ marginBottom: 28 }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, letterSpacing: '0.22em',
              color: '#3f3f46', textTransform: 'uppercase', marginBottom: 12,
            }}>Access portal</p>

            <h1 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 26, fontWeight: 600, color: '#f0ede8',
              letterSpacing: '-0.01em', lineHeight: 1.2, margin: 0,
            }}>Welcome to<br />OIANO</h1>
          </div>

          {error && (
            <div style={{
              background: '#1a0808', border: '1px solid #3a1010',
              color: '#f87171', fontSize: 12,
              padding: '10px 14px', borderRadius: 8, marginBottom: 20,
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <input type="email" placeholder="Email or phone" value={email}
              autoComplete="email" onChange={e => setEmail(e.target.value)}
              onFocus={e  => { setFocused(true); e.currentTarget.style.borderColor = '#C9A84C'; }}
              onBlur={e   => { setFocused(false); e.currentTarget.style.borderColor = '#1e1e1e'; }}
              style={inputStyle} />
            <input type="password" placeholder="Password" value={password}
              autoComplete="current-password" onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEnter()}
              onFocus={e  => { setFocused(true); e.currentTarget.style.borderColor = '#C9A84C'; }}
              onBlur={e   => { setFocused(false); e.currentTarget.style.borderColor = '#1e1e1e'; }}
              style={inputStyle} />
          </div>

          <button onClick={handleEnter} disabled={loading || !email || !password}
            style={{
              width: '100%', background: loading ? '#8a722a' : '#C9A84C',
              color: '#000', fontWeight: 700, fontSize: 14,
              padding: '14px 20px', borderRadius: 10, border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              letterSpacing: '0.04em', fontFamily: 'inherit',
              opacity: (!email || !password) ? 0.55 : 1,
              transition: 'background 0.18s, opacity 0.18s',
            }}>
            {loading ? '' : 'Enter →'}
          </button>
        </div>
      </div>
    </div>
  );
}
