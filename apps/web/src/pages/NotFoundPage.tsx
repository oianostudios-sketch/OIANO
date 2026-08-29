import { Link } from 'react-router-dom';
import OianoBrand from '../components/OianoBrand';

export default function NotFoundPage() {
  return (
    <main className="min-h-screen bg-studio-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-8"><OianoBrand variant="compact" size={28} /></div>
        <div className="rounded-xl border border-studio-border bg-studio-surface px-6 py-8">
          <p className="text-white text-lg font-display font-semibold mb-2">Page not found</p>
          <p className="text-zinc-500 text-xs leading-relaxed mb-6">
            The page you're looking for doesn't exist or may have moved.
          </p>
          <Link to="/dashboard" className="inline-block text-dome text-xs hover:text-dome-light transition-colors">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
