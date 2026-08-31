import { AlertTriangle, ChevronDown, CreditCard, Database, HardDrive, KeyRound, RefreshCw, Server, Settings, ShieldCheck, Webhook } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import MaintenanceShell from '../components/MaintenanceShell';

type ServiceStatus = 'OPERATIONAL' | 'DEGRADED';
type Health = {
  checked_at: string;
  uptime_seconds: number;
  services: {
    api: { status: ServiceStatus };
    database: { status: ServiceStatus; latency_ms: number };
    webhooks: { status: ServiceStatus; processing: number; failed: number; processed: number };
  };
  configuration: Record<string, boolean>;
  security: Record<string, boolean>;
  accounts: { users: number; oiano_admins: number; oiano_admins_without_mfa: number };
};

// ─── real-data-only design tokens — every color below carries a specific,
// checkable meaning; none is decorative. ─────────────────────────────────
const GEM = { healthy: '#4ade80', info: '#5A9BCB', attention: '#facc15', critical: '#f87171', inactive: '#52525b' } as const;

const CONFIG_NAMES: Record<string, string> = {
  database: 'Database connection', frontend_origin: 'Frontend origin', object_storage: 'Object storage',
  jwt: 'Token signing secret', stripe_enabled: 'Payment processing', stripe_secret: 'Stripe secret', stripe_webhook_secret: 'Webhook secret',
};
const SECURITY_NAMES: Record<string, string> = {
  helmet: 'Secure HTTP headers', cors_allowlist: 'CORS origin allowlist', auth_rate_limit: 'Authentication rate limit',
  role_protected_maintenance: 'Maintenance role protection', webhook_idempotency: 'Webhook idempotency',
  administrative_audit_log: 'Administrative audit log', mfa: 'Multi-factor authentication',
};
const CONFIG_GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: 'Core', keys: ['database', 'frontend_origin', 'object_storage'] },
  { label: 'Identity & security', keys: ['jwt'] },
  { label: 'Commerce', keys: ['stripe_enabled', 'stripe_secret', 'stripe_webhook_secret'] },
];

// Every gap gets translated from infrastructure fact to operational
// consequence + a real, safe next step — never just "X is false" (§04).
const ATTENTION: Record<string, { title: string; impact: string; action?: { label: string; to: string } }> = {
  object_storage: { title: 'Object storage configuration incomplete', impact: 'Session file uploads may not be production-ready.' },
  stripe_enabled: { title: "Payment processing isn't enabled", impact: 'Studios cannot receive new payments through the platform.', action: { label: 'Review payments', to: '/maintenance/finance' } },
  stripe_secret: { title: 'Stripe secret is not configured', impact: 'Payment processing will fail even though it is enabled.', action: { label: 'Review payments', to: '/maintenance/finance' } },
  stripe_webhook_secret: { title: 'Stripe webhook secret is not configured', impact: 'Payment confirmations from Stripe cannot be verified.', action: { label: 'Review payments', to: '/maintenance/finance' } },
  frontend_origin: { title: 'Frontend origin is not configured', impact: 'CORS is not actually restricted to a known origin.' },
  administrative_audit_log: { title: 'No admin activity recorded in the last 24 hours', impact: 'Recent platform administration cannot be reviewed.', action: { label: 'View audit trail', to: '/maintenance/audit' } },
  mfa: { title: 'A platform admin has not completed MFA enrollment', impact: 'That account can sign in with a password alone.', action: { label: 'Review operators', to: '/maintenance/operators' } },
};

function timeAgo(iso: string, nowTick: number): string {
  const seconds = Math.max(0, Math.round((nowTick - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} sec ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

type OverallState = 'HEALTHY' | 'DEGRADED' | 'ACTION_REQUIRED' | 'CRITICAL';
const STATE_COPY: Record<OverallState, { label: string; sentence: string; color: string }> = {
  HEALTHY: { label: 'Healthy', sentence: 'All core systems operational.', color: GEM.healthy },
  ACTION_REQUIRED: { label: 'Action required', sentence: 'Core systems are operational — some configuration needs attention.', color: GEM.attention },
  DEGRADED: { label: 'Degraded', sentence: 'A system is not performing normally.', color: GEM.attention },
  CRITICAL: { label: 'Critical', sentence: 'A core system is down.', color: GEM.critical },
};

export default function MaintenanceHealthPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<Health>({
    queryKey: ['maintenance-health'],
    queryFn: async () => (await api.get('/maintenance/health')).data,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  // Ticks the "last verified Xs ago" readout without a full data refetch —
  // 5s granularity is honest for a health screen without re-rendering every second.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const [expanded, setExpanded] = useState<string | null>(null);

  if (error) {
    return (
      <MaintenanceShell>
        <section className="mx-auto max-w-[1380px] px-5 py-10 md:px-8">
          <p className="mb-3 text-[9px] font-mono uppercase tracking-[.28em] text-emerald-400">System · Trust</p>
          <h1 className="font-display text-4xl">Operational confidence.</h1>
          <div className="mt-9 rounded-2xl border border-red-500/25 bg-red-500/[.04] p-8">
            <div className="flex items-center gap-3"><i className="signal-dot" style={{ '--signal': GEM.critical } as CSSProperties} /><span className="font-display text-2xl">Critical</span></div>
            <p className="mt-3 text-sm text-red-300">The health service itself is unreachable — Oiano cannot currently verify its own condition.</p>
            <button onClick={() => refetch()} className="console-control mt-5 flex items-center gap-2 rounded-xl border bg-white/[.03] px-4 py-2.5 text-xs text-zinc-200">
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Retry
            </button>
          </div>
        </section>
      </MaintenanceShell>
    );
  }

  if (isLoading || !data) {
    return (
      <MaintenanceShell>
        <section className="mx-auto max-w-[1380px] px-5 py-10 md:px-8">
          <p className="mb-3 text-[9px] font-mono uppercase tracking-[.28em] text-emerald-400">System · Trust</p>
          <h1 className="font-display text-4xl">Operational confidence.</h1>
          <p className="mt-12 text-xs text-zinc-700">Running system checks…</p>
        </section>
      </MaintenanceShell>
    );
  }

  const configGaps = Object.entries(data.configuration).filter(([, v]) => !v).map(([k]) => k);
  const securityGaps = Object.entries(data.security).filter(([, v]) => !v).map(([k]) => k);
  const servicesDegraded = [data.services.api.status, data.services.database.status, data.services.webhooks.status].filter((s) => s !== 'OPERATIONAL').length;

  const overall: OverallState =
    servicesDegraded > 0 ? 'DEGRADED' :
    securityGaps.length > 0 ? 'DEGRADED' :
    configGaps.length > 0 ? 'ACTION_REQUIRED' :
    'HEALTHY';
  const state = STATE_COPY[overall];
  const recommendations = configGaps.length + securityGaps.length;
  const criticalIssues = servicesDegraded;

  const coreSystems = [
    { key: 'api', icon: Server, label: 'API', status: data.services.api.status, detail: `${Math.floor(data.uptime_seconds / 60)} min uptime`, expand: [['Uptime', `${Math.floor(data.uptime_seconds / 60)} minutes`], ['Status', data.services.api.status]] },
    { key: 'database', icon: Database, label: 'Database', status: data.services.database.status, detail: `${data.services.database.latency_ms} ms response`, expand: [['Response time', `${data.services.database.latency_ms} ms`], ['Connection', data.services.database.status === 'OPERATIONAL' ? 'Healthy' : 'Degraded']] },
    { key: 'webhooks', icon: Webhook, label: 'Webhooks', status: data.services.webhooks.status, detail: `${data.services.webhooks.failed} failed · ${data.services.webhooks.processing} processing`, expand: [['Processed', String(data.services.webhooks.processed)], ['Processing', String(data.services.webhooks.processing)], ['Failed', String(data.services.webhooks.failed)]] },
    { key: 'storage', icon: HardDrive, label: 'Storage', status: data.configuration.object_storage ? 'CONFIGURED' as const : 'NOT_CONFIGURED' as const, detail: data.configuration.object_storage ? 'Object storage configured' : 'Not configured', expand: [['State', data.configuration.object_storage ? 'Configured' : 'Not configured']] },
    { key: 'payments', icon: CreditCard, label: 'Payments', status: data.configuration.stripe_enabled && data.configuration.stripe_secret && data.configuration.stripe_webhook_secret ? 'CONFIGURED' as const : 'ATTENTION' as const, detail: data.configuration.stripe_enabled ? 'Stripe enabled' : 'Not enabled', expand: [['Enabled', data.configuration.stripe_enabled ? 'Yes' : 'No'], ['Secret configured', data.configuration.stripe_secret ? 'Yes' : 'No'], ['Webhook secret configured', data.configuration.stripe_webhook_secret ? 'Yes' : 'No']] },
    { key: 'authentication', icon: KeyRound, label: 'Authentication', status: data.configuration.jwt && data.accounts.oiano_admins_without_mfa === 0 ? 'CONFIGURED' as const : 'ATTENTION' as const, detail: `${data.accounts.oiano_admins - data.accounts.oiano_admins_without_mfa}/${data.accounts.oiano_admins} admins MFA-enrolled`, expand: [['Token signing', data.configuration.jwt ? 'Configured' : 'Missing'], ['Admins with MFA', `${data.accounts.oiano_admins - data.accounts.oiano_admins_without_mfa} of ${data.accounts.oiano_admins}`]] },
  ];

  return (
    <MaintenanceShell>
      <section className="mx-auto max-w-[1380px] px-5 py-10 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-3 text-[9px] font-mono uppercase tracking-[.28em] text-emerald-400">System · Trust</p>
            <h1 className="font-display text-4xl">Operational confidence.</h1>
          </div>
          <button onClick={() => refetch()} className="console-control flex items-center gap-2 rounded-xl border bg-white/[.03] px-3 py-2 text-[10px] text-zinc-400">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* ── Hero: system core instrument ─────────────────────────────── */}
        <article className="mt-9 grid gap-8 rounded-2xl border border-white/[.065] bg-studio-surface p-8 lg:grid-cols-[auto_1fr] lg:items-center">
          <SystemCore state={overall} services={coreSystems} />
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[.22em]" style={{ color: state.color }}>System health</p>
            <p className="mt-2 font-display text-3xl" style={{ color: state.color }}>{state.label}</p>
            <p className="mt-2 text-sm text-zinc-500">{state.sentence}</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] text-zinc-600">
              <span className="flex items-center gap-2"><i className={`signal-dot${overall === 'HEALTHY' ? ' signal-pulse' : ''}`} style={{ '--signal': overall === 'HEALTHY' ? GEM.healthy : state.color } as CSSProperties} />Live monitoring</span>
              <span>Last verified {timeAgo(data.checked_at, nowTick)}</span>
            </div>
            <div className="mt-5 flex gap-6">
              <div><b className="font-display text-xl" style={{ color: recommendations > 0 ? GEM.attention : undefined }}>{recommendations}</b><p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-zinc-700">Recommendation{recommendations === 1 ? '' : 's'}</p></div>
              <div><b className="font-display text-xl" style={{ color: criticalIssues > 0 ? GEM.critical : undefined }}>{criticalIssues}</b><p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-zinc-700">Critical issue{criticalIssues === 1 ? '' : 's'}</p></div>
            </div>
          </div>
        </article>

        {/* ── Core systems strip ───────────────────────────────────────── */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coreSystems.map((system) => {
            const isExpanded = expanded === system.key;
            const dotColor = system.status === 'OPERATIONAL' || system.status === 'CONFIGURED' ? GEM.healthy : system.status === 'DEGRADED' || system.status === 'ATTENTION' ? GEM.attention : GEM.inactive;
            return (
              <article key={system.key} className="console-control rounded-2xl border border-white/[.065] bg-studio-surface p-6">
                <button onClick={() => setExpanded(isExpanded ? null : system.key)} className="flex w-full items-center justify-between text-left">
                  <system.icon size={17} className="text-dome" />
                  <span className="flex items-center gap-2">
                    <i className={`signal-dot${dotColor === GEM.healthy ? ' signal-pulse' : ''}`} style={{ '--signal': dotColor } as CSSProperties} />
                    <ChevronDown size={13} className={`text-zinc-700 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                <h2 className="mt-6 text-sm font-semibold">{system.label}</h2>
                <p className="mt-2 text-[9px] font-mono" style={{ color: dotColor }}>{system.status.replace('_', ' ')}</p>
                <p className="mt-3 text-xs text-zinc-700">{system.detail}</p>
                {isExpanded && (
                  <div className="metric-enter mt-4 space-y-1.5 border-t border-white/[.05] pt-4">
                    {system.expand.map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[10px]"><span className="text-zinc-700">{k}</span><span className="font-mono text-zinc-400">{v}</span></div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* ── Needs attention ───────────────────────────────────────────── */}
        {(configGaps.length > 0 || servicesDegraded > 0) && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300"><AlertTriangle size={14} />Needs attention</h2>
            <div className="space-y-2">
              {configGaps.filter((key) => ATTENTION[key]).map((key) => (
                <AttentionRow key={key} title={ATTENTION[key].title} impact={ATTENTION[key].impact} action={ATTENTION[key].action} />
              ))}
              {data.services.webhooks.status === 'DEGRADED' && (
                <AttentionRow title={`${data.services.webhooks.failed} webhook deliveries have failed`} impact="Payment or session confirmations may be delayed." action={{ label: 'Review finance', to: '/maintenance/finance' }} />
              )}
            </div>
          </section>
        )}

        {/* ── Configuration readiness ──────────────────────────────────── */}
        <article className="mt-8 rounded-2xl border border-white/[.065] bg-studio-surface p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Settings size={15} className="text-dome" />Configuration readiness</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {CONFIG_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-700">{group.label}</p>
                <div className="mt-3 space-y-2">
                  {group.keys.map((key) => (
                    <div key={key} className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <i className="signal-dot" style={{ '--signal': data.configuration[key] ? GEM.healthy : GEM.attention } as CSSProperties} />
                      {CONFIG_NAMES[key] ?? key}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* ── Protection layer ─────────────────────────────────────────── */}
        <article className="mt-3 rounded-2xl border border-white/[.065] bg-studio-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={15} className="text-[#C9A84C]" />Protection layer</h2>
            <span className="font-mono text-[10px] text-zinc-600">{Object.values(data.security).filter(Boolean).length} / {Object.keys(data.security).length} controls active</span>
          </div>
          <div className="mt-5 space-y-1.5">
            {Object.entries(data.security).map(([key, value]) => (
              <div key={key} className={`flex items-center justify-between rounded-xl p-3 ${value ? '' : 'border border-amber-500/20 bg-amber-500/[.04]'}`}>
                <span className="flex items-center gap-2 text-[11px] text-zinc-400"><i className="signal-dot" style={{ '--signal': value ? GEM.healthy : GEM.attention } as CSSProperties} />{SECURITY_NAMES[key] ?? key}</span>
                <span className={`text-[9px] font-mono ${value ? 'text-emerald-500' : 'text-amber-400'}`}>{value ? 'ACTIVE' : 'REQUIRED'}</span>
              </div>
            ))}
          </div>
        </article>

        {/* ── System activity — honest about missing telemetry (§07) ─── */}
        <article className="mt-3 rounded-2xl border border-white/[.05] bg-white/[.015] p-6">
          <h2 className="text-sm font-semibold text-zinc-400">System activity</h2>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            Oiano doesn't yet persist request-level telemetry, so trends for API request volume, webhook delivery history,
            payment event volume, and storage activity can't be shown honestly. The counts above (webhook processed/failed,
            admin activity) are the only historical signals currently stored — this section will populate once that
            instrumentation exists, rather than approximate it from a single current value.
          </p>
        </article>

        <p className="mt-5 text-right text-[8px] font-mono text-zinc-800">Checked {new Date(data.checked_at).toLocaleString()}</p>
      </section>
    </MaintenanceShell>
  );
}

function AttentionRow({ title, impact, action }: { title: string; impact: string; action?: { label: string; to: string } }) {
  return (
    <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[.03] p-5">
      <p className="flex items-center gap-2 text-xs font-medium text-amber-300"><AlertTriangle size={13} />{title}</p>
      <p className="mt-2 text-[10px] leading-5 text-zinc-600"><span className="text-zinc-700">Impact — </span>{impact}</p>
      {action && <a href={action.to} className="mt-3 inline-block rounded-lg border border-amber-500/20 px-3 py-1.5 text-[10px] text-amber-300 hover:bg-amber-500/[.06]">{action.label}</a>}
    </div>
  );
}

// Restrained orbital instrument: one central health gem, six small nodes
// for the systems the strip below covers — a glance-able summary, not a
// second data source (every color here is derived from the same `services`
// data the strip renders, never invented independently).
function SystemCore({ state, services }: { state: OverallState; services: Array<{ key: string; label: string; status: string }> }) {
  const centerColor = STATE_COPY[state].color;
  const radius = 58;
  const size = 148;
  const center = size / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle, ${centerColor}22 0%, transparent 70%)` }}
      />
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={1} />
      </svg>
      {services.map((system, index) => {
        const angle = (index / services.length) * Math.PI * 2 - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const ok = system.status === 'OPERATIONAL' || system.status === 'CONFIGURED';
        const color = ok ? GEM.healthy : system.status === 'DEGRADED' || system.status === 'ATTENTION' ? GEM.attention : GEM.inactive;
        return (
          <i
            key={system.key}
            className={`signal-dot absolute${ok ? ' signal-pulse' : ''}`}
            title={system.label}
            style={{ '--signal': color, left: x - 4, top: y - 4, width: 8, height: 8 } as CSSProperties}
          />
        );
      })}
      <div className="absolute inset-0 grid place-items-center">
        <div className="h-9 w-9 rounded-full" style={{ background: centerColor, boxShadow: `0 0 18px ${centerColor}88, 0 0 4px ${centerColor}` }} />
      </div>
    </div>
  );
}
