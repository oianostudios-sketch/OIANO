/**
 * OianoNow — a restrained reminder that a user's own work sits inside a
 * larger creative network. Pure counts from GET /api/network/pulse, which
 * only ever returns aggregates (no per-studio/per-artist breakdown) — small
 * enough not to deanonymize anyone, honest enough to show a young network
 * exactly as young as it is instead of padding it. See network-pulse.routes.ts.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface PulseResponse {
  studios: number;
  creatives: number;
  sessions_completed_today: number;
  sessions_completed_total: number;
  trusted_records: number;
  generated_at: string;
}

export default function OianoNow() {
  const { data, isLoading, isError } = useQuery<PulseResponse>({
    queryKey: ['network-pulse'],
    queryFn: async () => (await api.get('/network/pulse')).data,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isLoading || isError || !data) return null;

  const isEarly = data.studios < 5 && data.creatives < 25;
  const items = [
    { label: 'Studios', value: data.studios },
    { label: 'Creatives', value: data.creatives },
    { label: 'Sessions today', value: data.sessions_completed_today },
    { label: 'Trusted records', value: data.trusted_records },
  ];

  return (
    <div className="rounded-2xl border border-white/[.06] bg-black/20 px-5 py-4">
      <p className="text-[9px] font-mono uppercase tracking-[.2em] text-zinc-600">
        {isEarly ? 'OIANO is growing' : 'OIANO now'}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="metric-enter flex items-baseline gap-1.5">
            <span className="font-mono text-sm text-zinc-200">{new Intl.NumberFormat().format(item.value)}</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-600">{item.label}</span>
          </div>
        ))}
      </div>
      {isEarly && (
        <p className="mt-2 text-[10px] leading-4 text-zinc-700">
          A young network. Every studio and session here is real — watch it grow.
        </p>
      )}
    </div>
  );
}
