import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from '../components/Toast';
import OianoBrand from '../components/OianoBrand';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const setAuth = useAuthStore((state) => state.setAuth);
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/reset-password', { token, password });
      setAuth(data.token, data.user);
      toast.success('Password updated');
      if (data.user.role === 'STUDIO_ADMIN') navigate('/admin');
      else if (data.user.role === 'OIANO_ADMIN') navigate('/maintenance');
      else if (data.user.role === 'ARTIST') navigate('/calendar');
      else navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'This reset link is invalid or has expired.');
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-studio-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8"><OianoBrand variant="compact" size={28} /></div>
          <div className="rounded-xl border border-studio-border bg-studio-surface px-6 py-8 text-center">
            <ShieldAlert size={22} className="text-red-400 mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-white text-sm font-medium mb-2">Invalid reset link</p>
            <p className="text-zinc-500 text-xs leading-relaxed mb-6">This link is missing its reset token. Request a new one below.</p>
            <Link to="/forgot-password" className="inline-block text-dome text-xs hover:text-dome-light transition-colors">
              Request a new link →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-studio-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><OianoBrand variant="compact" size={28} /></div>
        <div className="rounded-xl border border-studio-border bg-studio-surface px-6 py-8">
          <p className="text-white text-lg font-display font-semibold mb-2">Set a new password</p>
          <p className="text-zinc-500 text-xs leading-relaxed mb-6">Choose a new password for your OIANO account.</p>

          {error && (
            <div role="alert" className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs px-3 py-2.5 rounded-lg mb-4">
              {error}
              {error.toLowerCase().includes('expired') || error.toLowerCase().includes('invalid') ? (
                <>
                  {' '}
                  <Link to="/forgot-password" className="text-red-300 underline hover:text-red-200">Request a new link</Link>
                </>
              ) : null}
            </div>
          )}

          <form onSubmit={(event) => { event.preventDefault(); if (!loading && password.length >= 8 && !mismatch) handleSubmit(); }}>
            <label htmlFor="reset-password" className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">New password</label>
            <div className="relative mb-4">
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-studio-bg border border-studio-border text-white text-sm placeholder-zinc-700 rounded-lg px-3 py-2.5 pr-11 focus:outline-none focus:border-dome"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <label htmlFor="reset-confirm" className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Confirm password</label>
            <input
              id="reset-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Re-enter your new password"
              className="w-full bg-studio-bg border border-studio-border text-white text-sm placeholder-zinc-700 rounded-lg px-3 py-2.5 mb-2 focus:outline-none focus:border-dome"
            />
            {mismatch && <p className="text-red-400 text-[11px] mb-3">Passwords don't match.</p>}

            <button
              type="submit"
              disabled={loading || password.length < 8 || mismatch}
              className="w-full flex items-center justify-center gap-2 bg-dome hover:bg-dome-light text-black font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-40 mt-4"
            >
              {loading ? 'Updating…' : <>Update password <ArrowRight size={15} /></>}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
