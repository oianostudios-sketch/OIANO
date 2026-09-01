import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, Radar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MaintenanceShell from '../components/MaintenanceShell';
import { api } from '../lib/api';

type SignalPriority = 'CRITICAL' | 'ATTENTION' | 'OPPORTUNITY' | 'WATCH';
type Signal = {
  id: string; priority: SignalPriority; domain: string; headline: string; explanation: string;
  evidence: Record<string, string | number | null>; action_hint: string; href: string;
};
type Signals = { generated_at: string; healthy: boolean; signals: Signal[] };

type Definition = {
  key: string; label: string; status: 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED';
  definition: string; formula: string; data_source: string;
  limitations?: string; known_conflicts?: string;
};
type Definitions = { definitions: Definition[] };

const PRIORITY_STYLE: Record<SignalPriority, { border: string; bg: string; text: string }> = {
  CRITICAL: { border: 'border-red-500/25', bg: 'bg-red-500/[.045]', text: 'text-red-400' },
  ATTENTION: { border: 'border-amber-500/20', bg: 'bg-amber-500/[.04]', text: 'text-amber-400' },
  OPPORTUNITY: { border: 'border-dome/20', bg: 'bg-dome/[.05]', text: 'text-dome' },
  WATCH: { border: 'border-white/[.08]', bg: 'bg-white/[.02]', text: 'text-zinc-400' },
};

const STATUS_STYLE: Record<Definition['status'], string> = {
  SUPPORTED: 'text-emerald-400 bg-emerald-500/10',
  PARTIAL: 'text-amber-300 bg-amber-500/10',
  UNSUPPORTED: 'text-zinc-500 bg-white/[.05]',
};

export default function MaintenanceSignalsPage() {
  const nav = useNavigate();
  const [showDefinitions, setShowDefinitions] = useState(false);
  const { data, isLoading, error } = useQuery<Signals>({
    queryKey: ['maintenance-signals'],
    queryFn: async () => (await api.get('/maintenance/signals')).data,
    refetchInterval: 30000,
  });
  const { data: definitionsData } = useQuery<Definitions>({
    queryKey: ['maintenance-definitions'],
    queryFn: async () => (await api.get('/maintenance/definitions')).data,
    enabled: showDefinitions,
  });

  return (
    <MaintenanceShell>
      <div className="mx-auto max-w-[1100px] px-5 py-10 md:px-8">
        <button onClick={() => nav('/maintenance')} className="mb-7 flex items-center gap-2 text-xs text-zinc-600 hover:text-white">
          <ArrowLeft size={13} />Network overview
        </button>
        <p className="mb-3 text-[9px] font-mono uppercase tracking-[.28em] text-dome">Business · Signals</p>
        <h1 className="font-display text-4xl">What needs your attention.</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-600">
          Deterministic, evidence-backed checks against real data — no trend guessing on a small dataset, no AI-generated conclusions. Every item below cites the exact numbers behind it.
        </p>

        {isLoading ? (
          <p className="mt-14 text-xs text-zinc-700">Running checks…</p>
        ) : error || !data ? (
          <p className="mt-12 text-red-400">Signals unavailable.</p>
        ) : data.signals.length === 0 ? (
          <div className="mt-9 flex items-center gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[.04] p-6">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">Nothing needs attention right now.</p>
              <p className="mt-1 text-xs text-zinc-600">All deterministic checks passed against current data.</p>
            </div>
          </div>
        ) : (
          <div className="mt-9 space-y-3">
            {data.signals.map((signal) => {
              const style = PRIORITY_STYLE[signal.priority];
              return (
                <article key={signal.id} className={`rounded-2xl border p-5 ${style.border} ${style.bg}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[9px] font-mono uppercase tracking-wider ${style.text}`}>{signal.priority}</span>
                    <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-700">· {signal.domain}</span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold">{signal.headline}</h2>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">{signal.explanation}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(signal.evidence).map(([key, value]) => (
                      <span key={key} className="font-mono text-[10px] text-zinc-600">
                        {key.replaceAll('_', ' ')}: <b className="text-zinc-400">{value ?? '—'}</b>
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-zinc-500">{signal.action_hint}</p>
                    <button onClick={() => nav(signal.href)} className={`flex items-center gap-1 text-xs font-medium ${style.text}`}>
                      Investigate <ArrowUpRight size={13} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {data && (
          <p className="mt-5 text-right text-[8px] font-mono text-zinc-800">Checked {new Date(data.generated_at).toLocaleString()}</p>
        )}

        <div className="mt-10 border-t border-white/[.06] pt-6">
          <button
            onClick={() => setShowDefinitions((v) => !v)}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white"
          >
            <Radar size={13} />
            What do these numbers actually mean?
            <ChevronDown size={13} className={`transition ${showDefinitions ? 'rotate-180' : ''}`} />
          </button>
          {showDefinitions && (
            <div className="mt-5 space-y-2">
              <p className="mb-3 text-[10px] leading-5 text-zinc-700">
                Every business metric this system could compute, audited directly against the schema and API on 2026-09-01. Marked SUPPORTED, PARTIAL (real but limited, or conflicting with another existing number), or UNSUPPORTED (the repository cannot honestly answer this yet).
              </p>
              {(definitionsData?.definitions ?? []).map((def) => (
                <details key={def.key} className="group rounded-xl border border-white/[.05] bg-black/20 p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="text-xs font-medium">{def.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[8px] uppercase ${STATUS_STYLE[def.status]}`}>{def.status}</span>
                  </summary>
                  <div className="mt-3 space-y-2 text-[10px] leading-5 text-zinc-500">
                    <p>{def.definition}</p>
                    <p className="font-mono text-zinc-600">{def.formula}</p>
                    <p className="text-zinc-700">Source: {def.data_source}</p>
                    {def.known_conflicts && (
                      <p className="rounded-lg border border-amber-500/15 bg-amber-500/[.04] p-2 text-amber-300">
                        <AlertTriangle size={10} className="mb-0.5 mr-1 inline" />{def.known_conflicts}
                      </p>
                    )}
                    {def.limitations && <p className="text-zinc-600">{def.limitations}</p>}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </MaintenanceShell>
  );
}
