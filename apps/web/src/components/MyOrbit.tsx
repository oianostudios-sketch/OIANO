// Orbit provides labels from one context, not node IDs or verified graph edges.
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import './CreativeJourney.css';

interface OrbitLink { label: string; kind: string }
interface OrbitResponse { self: string | null; chain: OrbitLink[]; note?: string }

const KIND_LABEL: Record<string, string> = {
  SELF: 'You', PROJECT: 'Project', PRODUCER: 'Producer', ARTIST: 'Artist',
  STUDIO: 'Studio', ENGINEER: 'Engineer',
};

export default function MyOrbit() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery<OrbitResponse>({
    queryKey: ['network-orbit'],
    queryFn: async () => (await api.get('/network/orbit')).data,
    staleTime: 60_000,
  });

  return (
    <section className="creative-current-work" aria-label="Your recorded work context">
      <header className="creative-section-heading">
        <div><p className="creative-eyebrow">From your work records</p><h2>Your work context</h2></div>
      </header>
      <p className="creative-muted text-sm leading-6">People and places listed in one selected project or booking context. This is not proof of completed work, endorsement or a connection between every pair.</p>
      {isLoading && <p role="status" className="creative-muted mt-4">Loading your work context…</p>}
      {isError && <div role="alert" className="creative-read-error mt-4">
        <p>{data ? 'We couldn’t refresh your work context. This view may be out of date.' : 'We couldn’t load your work context. Try again to see your records.'}</p>
        <button type="button" className="creative-button" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Checking…' : 'Try again'}</button>
      </div>}
      {data && (data.chain.length > 1 ? <ul className="creative-context-nodes">
        {data.chain.map((item, index) => <li key={`${item.kind}-${index}`}>
          <span className="creative-context-kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
          <strong>{item.label}</strong>
        </li>)}
      </ul> : <p className="creative-muted mt-4 text-sm leading-6">{data.note || 'No work context with other participants is available yet. Your own profile alone does not establish a relationship.'}</p>)}
    </section>
  );
}
