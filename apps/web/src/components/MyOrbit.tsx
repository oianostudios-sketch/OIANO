/**
 * MyOrbit — the caller's own real work relationships, rendered as the chain
 * that produced them (self → project → collaborator → studio → engineer).
 * Backed by GET /api/network/orbit, which only ever reads the caller's own
 * Booking/Project/ProjectParticipant rows — never another user's data, never
 * a follower graph. Renders nothing decorative when there's no real chain
 * yet; an empty orbit is an honest state, not a bug to paper over.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface OrbitLink { label: string; kind: string }
interface OrbitResponse { self: string | null; chain: OrbitLink[]; note?: string }

const KIND_LABEL: Record<string, string> = {
  SELF: 'You', PROJECT: 'Project', PRODUCER: 'Producer', ARTIST: 'Artist',
  STUDIO: 'Studio', ENGINEER: 'Engineer',
};

export default function MyOrbit() {
  const { data, isLoading, isError } = useQuery<OrbitResponse>({
    queryKey: ['network-orbit'],
    queryFn: async () => (await api.get('/network/orbit')).data,
    staleTime: 60_000,
  });

  if (isLoading || isError || !data) return null;
  if (!data.chain.length) {
    return data.note ? null : (
      <div className="rounded-2xl border border-dashed border-white/[.08] p-5 text-center">
        <p className="text-xs text-zinc-600">Your orbit forms as you work with people and studios.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-[9px] font-mono uppercase tracking-[.2em] text-zinc-600">My orbit</p>
      <div className="flex flex-col">
        {data.chain.map((link, i) => (
          <div key={`${link.kind}-${i}`} className="flex items-center gap-3">
            <div className="flex flex-col items-center self-stretch">
              <span
                className={`signal-dot${i === 0 ? ' signal-pulse' : ''}`}
                style={{ '--signal': i === 0 ? '#C9A84C' : '#5A9BCB' } as React.CSSProperties}
              />
              {i < data.chain.length - 1 && <span className="my-0.5 w-px flex-1 bg-white/[.08]" style={{ minHeight: 18 }} />}
            </div>
            <div className={`mb-2 flex-1 rounded-lg px-3 py-2 ${i === 0 ? 'channel-active' : 'border border-white/[.06] bg-white/[.015]'}`}>
              <p className="text-[8px] font-mono uppercase tracking-wider text-zinc-600">{KIND_LABEL[link.kind] ?? link.kind}</p>
              <p className="text-xs text-zinc-200">{link.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
