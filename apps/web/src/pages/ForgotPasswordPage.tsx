import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { api } from '../lib/api';
import OianoBrand from '../components/OianoBrand';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong — try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-studio-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><OianoBrand variant="compact" size={28} /></div>

        {sent ? (
          <div className="rounded-xl border border-studio-border bg-studio-surface px-6 py-8 text-center">
            <Mail size={22} className="text-dome mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-white text-sm font-medium mb-2">Check your email</p>
            <p className="text-zinc-500 text-xs leading-relaxed">
              If an account exists for <span className="text-zinc-300">{email}</span>, a reset link is on its way. It expires in 30 minutes.
            </p>
            <Link to="/enter" className="inline-block mt-6 text-dome text-xs hover:text-dome-light transition-colors">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-studio-border bg-studio-surface px-6 py-8">
            <p className="text-white text-lg font-display font-semibold mb-2">Reset your password</p>
            <p className="text-zinc-500 text-xs leading-relaxed mb-6">
              Enter the email on your OIANO account and we'll send you a link to reset your password.
            </p>

            {error && (
              <div role="alert" className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs px-3 py-2.5 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={(event) => { event.preventDefault(); if (!loading && email) handleSubmit(); }}>
              <label htmlFor="forgot-email" className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                Email address
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full bg-studio-bg border border-studio-border text-white text-sm placeholder-zinc-700 rounded-lg px-3 py-2.5 mb-5 focus:outline-none focus:border-dome"
              />
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 bg-dome hover:bg-dome-light text-black font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-40"
              >
                {loading ? 'Sending…' : <>Send reset link <ArrowRight size={15} /></>}
              </button>
            </form>

            <Link to="/enter" className="block text-center mt-5 text-zinc-600 text-xs hover:text-zinc-400 transition-colors">
              ← Back to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
