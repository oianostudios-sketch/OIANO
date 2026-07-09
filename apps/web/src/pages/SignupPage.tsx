import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

export default function SignupPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ name: '', alias: '', email: '', password: '', role: 'ARTIST' as 'ARTIST' | 'PRODUCER' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSignup() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/signup', form);
      setAuth(data.token, data.user);
      navigate(form.role === 'PRODUCER' ? '/producer' : '/calendar');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-studio-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl text-gold font-semibold tracking-wide">OIANO</h1>
          <p className="text-zinc-500 text-sm mt-1">Your Artist Passport starts here</p>
        </div>

        <div className="bg-studio-surface border border-studio-border rounded-xl p-8 space-y-5">
          <div>
            <h2 className="text-white font-display text-xl font-semibold">Create your account</h2>
            <p className="text-zinc-500 text-xs mt-1">Free. Instant. Yours forever.</p>
          </div>

          {/* Role selector */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([
              { role: 'ARTIST' as const,   icon: '🎤', label: 'Artist',   sub: 'Book sessions, build your Passport' },
              { role: 'PRODUCER' as const, icon: '🎛️', label: 'Producer', sub: 'Manage projects, connect with artists' },
            ] as const).map(opt => (
              <button
                key={opt.role}
                type="button"
                onClick={() => update('role', opt.role)}
                style={{
                  padding: '14px 12px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                  background: form.role === opt.role ? 'rgba(201,168,76,0.08)' : 'transparent',
                  border: `2px solid ${form.role === opt.role ? '#C9A84C' : '#1e1e1e'}`,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 6 }}>{opt.icon}</div>
                <div style={{ color: form.role === opt.role ? '#C9A84C' : '#ccc', fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
                <div style={{ color: '#555', fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{opt.sub}</div>
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <input
              placeholder="Full name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-gold transition-colors"
            />
            <input
              placeholder="Artist alias (optional)"
              value={form.alias}
              onChange={(e) => update('alias', e.target.value)}
              className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-gold transition-colors"
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-gold transition-colors"
            />
            <input
              type="password"
              placeholder="Password (min 8 characters)"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
              className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-gold transition-colors"
            />
          </div>

          <button
            onClick={handleSignup}
            disabled={loading || !form.name || !form.email || !form.password}
            className="w-full bg-gold hover:bg-gold-light text-black font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-40"
          >
            {loading ? 'Creating account…' : form.role === 'PRODUCER' ? 'Enter the studio →' : 'Get my free Artist Passport →'}
          </button>

          <p className="text-center text-zinc-500 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-gold hover:text-gold-light transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
