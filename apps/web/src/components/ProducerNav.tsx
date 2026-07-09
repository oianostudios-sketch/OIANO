// apps/web/src/components/ProducerNav.tsx
// Shared top navigation for the producer portal
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export function ProducerNav({ passportCode }: { passportCode?: string | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore(s => s.logout);

  const onProjects = location.pathname === '/producer';
  const onPassport = location.pathname === '/producer/passport';

  const navLink = (label: string, path: string, active: boolean) => (
    <button
      onClick={() => navigate(path)}
      style={{
        background: 'none', border: 'none',
        padding: '0.4rem 0.9rem',
        borderRadius: 6,
        color: active ? '#C9A84C' : '#666',
        fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
        fontSize: '0.75rem', letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        cursor: 'pointer',
        transition: 'color 0.15s, background 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(10,10,10,0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      padding: '0 2rem',
      height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {/* Left — wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span style={{
          fontFamily: 'var(--font-display, Playfair Display), serif',
          fontSize: '1.1rem', fontWeight: 400, color: '#C9A84C',
          letterSpacing: '0.14em', cursor: 'pointer',
        }} onClick={() => navigate('/producer')}>
          OIANO
        </span>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
        <span style={{
          fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
          fontSize: '0.65rem', letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
        }}>
          Producer Portal
        </span>
      </div>

      {/* Centre — nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        {navLink('Projects', '/producer', onProjects)}
        {navLink('Passport', '/producer/passport', onPassport)}
      </div>

      {/* Right — passport code + logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {passportCode && (
          <span style={{
            fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
            fontSize: '0.65rem', color: 'rgba(201,168,76,0.45)',
            letterSpacing: '0.12em',
          }}>
            {passportCode}
          </span>
        )}
        <button
          onClick={() => { logout(); navigate('/enter'); }}
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '0.3rem 0.75rem',
            color: '#555', fontSize: '0.75rem', cursor: 'pointer',
            fontFamily: 'var(--font-mono, JetBrains Mono), monospace',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { (e.target as HTMLButtonElement).style.color = '#ef4444'; (e.target as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.3)'; }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.color = '#555'; (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
