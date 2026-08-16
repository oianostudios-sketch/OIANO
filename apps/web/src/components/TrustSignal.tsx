import { BadgeCheck, Building2, UserRoundPen } from 'lucide-react';

type TrustKind = 'passport' | 'studio' | 'artist';

const SIGNALS = {
  passport: {
    icon: BadgeCheck,
    label: 'OIANO-issued Passport',
    detail: 'A unique creative profile issued by OIANO. This is not government identity verification.',
    color: '#C9A84C',
  },
  studio: {
    icon: Building2,
    label: 'Studio-verified activity',
    detail: 'Confirmed from session and project records held inside OIANO StudioOS.',
    color: '#5A9BCB',
  },
  artist: {
    icon: UserRoundPen,
    label: 'Artist-provided information',
    detail: 'Added and maintained by the artist, including biography, links, and release details.',
    color: '#a1a1aa',
  },
} as const;

export default function TrustSignal({ kind, compact = false }: { kind: TrustKind; compact?: boolean }) {
  const signal = SIGNALS[kind];
  const Icon = signal.icon;

  return (
    <div
      title={compact ? signal.detail : undefined}
      className="trust-signal"
      style={{
        display: 'flex', alignItems: compact ? 'center' : 'flex-start', gap: compact ? 7 : 10,
        padding: compact ? '5px 8px' : '10px 12px', borderRadius: 10,
        border: `1px solid ${signal.color}2b`, background: `${signal.color}0b`, minWidth: 0,
      }}
    >
      <Icon size={compact ? 13 : 15} color={signal.color} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: compact ? 0 : 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: signal.color, fontSize: compact ? 9 : 10, fontFamily: 'monospace', letterSpacing: '.06em', textTransform: 'uppercase' }}>{signal.label}</div>
        {!compact && <div style={{ color: '#666', fontSize: 10, lineHeight: 1.5, marginTop: 3 }}>{signal.detail}</div>}
      </div>
    </div>
  );
}
