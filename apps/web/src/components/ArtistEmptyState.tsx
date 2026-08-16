import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export default function ArtistEmptyState({ icon: Icon, title, description, actionLabel, to, onAction, compact = false }: { icon: LucideIcon; title: string; description: string; actionLabel?: string; to?: string; onAction?: () => void; compact?: boolean }) {
  const actionClass = 'inline-flex items-center justify-center rounded-lg border border-dome/25 bg-dome/[.08] px-3.5 py-2 text-[10px] font-semibold text-dome no-underline';
  return (
    <div className={`artist-empty-state text-center ${compact ? 'px-4 py-7' : 'px-6 py-12'}`}>
      <div className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/[.07] bg-white/[.025] text-zinc-600">
        <span aria-hidden="true" className="absolute inset-2 rounded-full border border-dome/10" />
        <Icon size={20} strokeWidth={1.35} className="relative" />
      </div>
      <h3 className={`${compact ? 'mt-4 text-base' : 'mt-5 text-xl'} font-medium text-zinc-200`}>{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-600">{description}</p>
      {actionLabel && to && <Link to={to} className={`${actionClass} mt-5`}>{actionLabel} →</Link>}
      {actionLabel && onAction && <button type="button" onClick={onAction} className={`${actionClass} mt-5`}>{actionLabel} →</button>}
    </div>
  );
}
