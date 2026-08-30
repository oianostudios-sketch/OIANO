import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

export type MaintenanceTone = 'dome' | 'gold' | 'amber' | 'red' | 'emerald';
export const MAINTENANCE_TONE_HEX: Record<MaintenanceTone, string> = {
  dome: '#5A9BCB', gold: '#C9A84C', amber: '#f59e0b', red: '#ef4444', emerald: '#10b981',
};

// Single source for the icon/value/label card repeated across every
// Maintenance page — previously ~9 independent inline copies of the same
// Tailwind block. `live` renders a signal-dot (pulsing only while `live`
// is truthy) so a number that can change right now reads differently from
// one that's merely a static count — reuses the same .signal-dot/.signal-pulse
// tokens already established in ArtistProfilePage/BookingDetailPage/CalendarPage.
export default function MaintenanceMetricCard({
  icon: Icon, label, value, detail, tone = 'dome', onClick, live,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
  tone?: MaintenanceTone;
  onClick?: () => void;
  live?: boolean;
}) {
  const color = MAINTENANCE_TONE_HEX[tone];
  const Tag: any = onClick ? 'button' : 'article';
  return (
    <Tag
      onClick={onClick}
      className={`metric-enter group rounded-2xl border border-white/[.065] bg-studio-surface p-5 text-left transition${onClick ? ' hover:-translate-y-0.5 hover:border-white/[.12] focus:outline-none focus:ring-2 focus:ring-dome/20' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-white/[.035]">
          <Icon size={15} style={{ color }} />
          {live && (
            <i
              className="signal-dot signal-pulse absolute -right-0.5 -top-0.5"
              style={{ '--signal': color } as CSSProperties}
            />
          )}
        </span>
        {onClick && <ChevronRight size={13} className="text-zinc-800 transition group-hover:text-zinc-500" />}
      </div>
      <p className="mt-6 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-[9px] font-mono uppercase tracking-wider text-zinc-600">{label}</p>
      {detail && <p className="mt-2 text-xs text-zinc-700">{detail}</p>}
    </Tag>
  );
}
