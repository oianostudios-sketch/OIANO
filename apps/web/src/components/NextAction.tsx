import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
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
  count?: number;
}

interface ContextPayload {
  next: NextActionPayload;
  attention: NextActionPayload[];
  attention_total?: number;
  money: { outstanding_usd: number };
}

// Time-bound and money actions earn emphasis; everything else stays quiet so
// that emphasis keeps meaning something. A session already running outranks one
// that is merely close.
const URGENT = new Set(['SESSION_UNDERWAY', 'SESSION_IMMINENT', 'BALANCE_DUE']);

// The button used to say "Open" for everything, which made the creator read the
// heading to find out what the button did. A control says what happens when you
// press it.
const ACTION_LABEL: Record<string, string> = {
  SESSION_UNDERWAY: 'Open session',
  SESSION_IMMINENT: 'View session',
  SESSION_AWAITING_STUDIO: 'View request',
  BALANCE_DUE: 'Settle balance',
  DELIVERABLE_AWAITING_REVIEW: 'Review delivery',
  RIGHTS_DECISION_PENDING: 'Review split',
  CREDIT_AWAITING_RESPONSE: 'Review credit',
  CONSENT_REQUESTED: 'Review consent',
};

export default function NextAction() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ContextPayload>({
    queryKey: ['context'],
    queryFn: async () => (await api.get('/context')).data,
    staleTime: 30_000,
  });

  if (isLoading) return <section aria-label="What to do next" role="status" style={{ padding: 20, border: '1px solid #2a2a2a', borderRadius: 14, color: '#aaa' }}>Checking what needs your attention…</section>;

  // Rendering nothing on failure said "nothing needs you" — the one sentence
  // this component must never say when it does not know. An unreachable server
  // and an empty list are different facts and now look different.
  if (isError || !data?.next) {
    return (
      <section
        aria-label="What to do next"
        role="status"
        style={{
          border: '1px solid #1e1e1e', background: '#121212', borderRadius: 14,
          padding: '18px 20px', marginBottom: 18,
        }}
      >
        <p style={{ margin: 0, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: '#9a9a9a' }}>
          Next
        </p>
        <h2 style={{ margin: '8px 0 0', fontSize: 18, color: '#eee', fontWeight: 500 }}>
          We couldn't load what needs you
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9a9a9a', lineHeight: 1.5 }}>
          We couldn't check your pending decisions. Try again to see what needs attention.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
            background: 'transparent', color: '#cfcfcf', fontWeight: 600, fontSize: 12,
            padding: '9px 14px', borderRadius: 9, border: '1px solid #2e2e2e',
            cursor: isFetching ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw size={14} /> {isFetching ? 'Checking…' : 'Try again'}
        </button>
      </section>
    );
  }

  const { next, attention } = data;
  // Empty attention is an opportunity to choose, not a requirement to buy a session.
  if (next.kind === 'NO_WORK_YET' || next.kind === 'ALL_CLEAR') {
    return <section aria-label="What to do next" style={{ border: '1px solid #2a2a2a', background: '#121212', borderRadius: 14, padding: '20px' }}>
      <p style={{ color: '#C9A84C', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase' }}>Your next step</p>
      <h2 style={{ color: '#eee', fontSize: 22, margin: '8px 0' }}>{next.kind === 'ALL_CLEAR' ? 'Choose what to pick up next' : 'Begin with the people and the project'}</h2>
      <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.6 }}>Open your projects, review contribution invitations, or find someone to create with.</p>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 16 }}>
        <Link to="/projects" style={{ color: '#E2C97E' }}>Open projects →</Link>
        <Link to="/contributions" style={{ color: '#8BBEDD' }}>Review contributions →</Link>
        <Link to="/discover" style={{ color: '#aaa' }}>Find people →</Link>
      </div>
    </section>;
  }
  const urgent = URGENT.has(next.kind);
  // attention.length counts *kinds*; attention_total counts things. Showing the
  // former as "N more waiting on you" describes a number that does not exist.
  const total = data.attention_total ?? attention.length;
  const alsoWaiting = Math.max(0, total - (next.count ?? 1));

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
      <p style={{ margin: 0, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: urgent ? '#E8823A' : '#9a9a9a' }}>
        Next
      </p>
      <h2 style={{ margin: '8px 0 0', fontSize: 18, color: '#eee', fontWeight: 500 }}>{next.title}</h2>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9a9a9a', lineHeight: 1.5 }}>{next.detail}</p>

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
          {ACTION_LABEL[next.kind] ?? 'Open'} <ArrowRight size={14} />
        </Link>
        {next.count !== undefined && next.count > 1 && (
          <span style={{ fontSize: 11, color: '#9a9a9a' }}>
            {next.count} of this kind
          </span>
        )}
        {alsoWaiting > 0 && (
          <span style={{ fontSize: 11, color: '#9a9a9a' }}>
            {alsoWaiting} more waiting on you
          </span>
        )}
      </div>
    </section>
  );
}
