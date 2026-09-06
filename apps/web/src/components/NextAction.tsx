import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api';

// The one thing worth doing now, answered by the server rather than assembled
// here. The dashboard runs eight queries and reconstructs the creator's
// situation in the browser; this asks once and renders the answer.
//
// Every action is derived from a real row — an unpaid payment, a booking inside
// its window, a deliverable awaiting review. Nothing here is generated, so a
// creator can always click through to the thing the sentence refers to.
interface NextActionPayload {
  kind: string;
  title: string;
  detail: string;
  href: string;
  at?: string;
}

interface ContextPayload {
  next: NextActionPayload;
  attention: NextActionPayload[];
  money: { outstanding_usd: number };
}

// Time-bound and money actions earn emphasis; everything else stays quiet so
// that emphasis keeps meaning something.
const URGENT = new Set(['SESSION_IMMINENT', 'BALANCE_DUE']);

export default function NextAction() {
  const { data, isLoading } = useQuery<ContextPayload>({
    queryKey: ['context'],
    queryFn: async () => (await api.get('/context')).data,
    staleTime: 30_000,
  });

  if (isLoading || !data?.next) return null;

  const { next, attention } = data;
  const urgent = URGENT.has(next.kind);
  const alsoWaiting = Math.max(0, attention.length - 1);

  return (
    <section
      aria-label="What to do next"
      style={{
        border: `1px solid ${urgent ? 'rgba(232,130,58,.35)' : '#1e1e1e'}`,
        background: urgent ? 'rgba(232,130,58,.06)' : '#121212',
        borderRadius: 14,
        padding: '18px 20px',
        marginBottom: 18,
      }}
    >
      <p style={{ margin: 0, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: urgent ? '#E8823A' : '#666' }}>
        Next
      </p>
      <h2 style={{ margin: '8px 0 0', fontSize: 18, color: '#eee', fontWeight: 500 }}>{next.title}</h2>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#8a8a8a', lineHeight: 1.5 }}>{next.detail}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
        <Link
          to={next.href}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: urgent ? '#E8823A' : '#5A9BCB',
            color: '#0a0a0a', fontWeight: 600, fontSize: 12,
            padding: '9px 14px', borderRadius: 9, textDecoration: 'none',
          }}
        >
          Open <ArrowRight size={14} />
        </Link>
        {alsoWaiting > 0 && (
          <span style={{ fontSize: 11, color: '#666' }}>
            {alsoWaiting} more waiting on you
          </span>
        )}
      </div>
    </section>
  );
}
