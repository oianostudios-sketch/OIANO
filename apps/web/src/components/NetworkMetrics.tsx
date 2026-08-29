import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { api } from '../lib/api';

export interface NetworkMetric {
  key: string;
  label: string;
  value: number;
  unit?: '%' | 'USD';
  detail: string;
}

type Response = { pole: string; metrics: NetworkMetric[]; updated_at: string };

export function useNetworkMetrics() {
  return useQuery<Response>({
    queryKey: ['network-metrics'],
    queryFn: async () => (await api.get('/network-metrics')).data,
    staleTime: 60_000,
    retry: 1,
  });
}

function displayValue(metric: NetworkMetric): string {
  if (metric.unit === 'USD') return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(metric.value);
  if (metric.unit === '%') return `${metric.value}%`;
  return new Intl.NumberFormat().format(metric.value);
}

export default function NetworkMetrics({ compact = false, accent = '#5A9BCB' }: { compact?: boolean; accent?: string }) {
  const { data, isLoading, isError } = useNetworkMetrics();
  const metrics = compact ? data?.metrics.slice(0, 3) : data?.metrics;

  if (isLoading) return <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`} aria-label="Loading live network outcomes">{Array.from({ length: compact ? 3 : 4 }).map((_, index)=><div key={index} className="h-12 animate-pulse rounded-xl bg-white/[.035]"/>)}</div>;
  if (isError || !metrics) return <div className="flex items-center gap-2 rounded-xl border border-white/[.05] px-3 py-2 text-[9px] text-zinc-700"><Activity size={11}/> Live outcomes are temporarily unavailable.</div>;

  return <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`} aria-label="Live network outcomes">
    {metrics.map(metric=><article key={metric.key} title={metric.detail} className={`rounded-xl border border-white/[.05] bg-black/20 ${compact?'px-3 py-2':'p-4'}`}>
      <p className={`font-semibold ${compact?'text-xs':'text-2xl'}`} style={{color:accent}}>{displayValue(metric)}</p>
      <p className={`font-mono uppercase tracking-wider text-zinc-600 ${compact?'mt-1 text-[6px]':'mt-2 text-[8px]'}`}>{metric.label}</p>
      {!compact&&<p className="mt-2 text-[9px] leading-4 text-zinc-700">{metric.detail}</p>}
    </article>)}
  </div>;
}
