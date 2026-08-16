import SunMark from './SunMark';

type Props = { variant?: 'full' | 'compact' | 'icon' | 'mono'; size?: number; loading?: boolean; subtitle?: string; className?: string };

export default function OianoBrand({ variant = 'compact', size = 30, loading = false, subtitle, className = '' }: Props) {
  if (variant === 'icon') return <SunMark size={size}/>;
  return <span className={`oiano-brand oiano-brand-interface oiano-brand-${variant}${loading ? ' is-loading' : ''} ${className}`} style={{ ['--brand-height' as string]: `${size}px` } as React.CSSProperties} role="img" aria-label={subtitle ? `Oiano — ${subtitle}` : 'Oiano'}>
    <span className="oiano-brand-word" aria-hidden="true">
      <img className="oiano-brand-interface-image" src="/brand/oiano-wordmark-master-v7.png" alt="" />
      {loading && <i className="oiano-brand-interface-signal" />}
    </span>
    {subtitle && <span className="oiano-brand-subtitle">{subtitle}</span>}
  </span>;
}
