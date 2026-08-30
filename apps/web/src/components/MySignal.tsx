/**
 * MySignal — "how is my work moving," in real numbers only.
 * Reuses the existing /network-metrics endpoint (network-metrics.routes.ts),
 * which was already computing honest, permission-scoped, per-role metrics —
 * this just gives it a home on the primary dashboard instead of confining it
 * to /network. No new query, no invented metric.
 */
import { useNetworkMetrics } from './NetworkMetrics';

export default function MySignal({ accent = '#5A9BCB' }: { accent?: string }) {
  const { data, isLoading, isError } = useNetworkMetrics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Loading your signal">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[.03]" />)}
      </div>
    );
  }
  if (isError || !data?.metrics?.length) return null; // honest silence — nothing fabricated when there's nothing real yet

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[.2em]" style={{ color: accent }}>
        <span className="signal-dot" style={{ '--signal': accent } as React.CSSProperties} />
        My signal
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.metrics.map((metric) => (
          <div key={metric.key} className="metric-enter rounded-xl border border-white/[.06] bg-black/20 p-3" title={metric.detail}>
            <p className="text-xl font-semibold" style={{ color: accent, fontFamily: "'Playfair Display', serif" }}>
              {metric.unit === 'USD'
                ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(metric.value)
                : metric.unit === '%' ? `${metric.value}%` : new Intl.NumberFormat().format(metric.value)}
            </p>
            <p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-zinc-600">{metric.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
