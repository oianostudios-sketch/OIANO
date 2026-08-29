import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import OianoBrand from '../components/OianoBrand';
import StudioSwitcher from '../components/StudioSwitcher';

// Landing spot for the 409 a studio-scoped request throws when a staff
// member belongs to 2+ studios with none marked active (most commonly: they
// were just removed from whichever studio was active, and still belong to
// others) — see api.ts's response interceptor. Without a dedicated page to
// send them to, every studio-scoped panel on whatever page they were on
// fails independently with no indication why, and the switcher itself often
// never renders (it may live inside the very data list that just came back
// empty).
export default function SelectStudioPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-studio-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-8"><OianoBrand variant="compact" size={28} /></div>
        <div className="rounded-xl border border-studio-border bg-studio-surface px-6 py-8">
          <div className="flex justify-center mb-3 text-dome"><Building2 size={22} /></div>
          <p className="text-white text-lg font-display font-semibold mb-2">Pick a studio to continue</p>
          <p className="text-zinc-500 text-xs leading-relaxed mb-6">
            You're staffed at more than one studio and none is currently active. Choose one below to keep going.
          </p>
          <div className="flex justify-center">
            <StudioSwitcher onSwitched={() => navigate('/dashboard', { replace: true })} />
          </div>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="mt-6 inline-block text-dome text-xs hover:text-dome-light transition-colors"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
