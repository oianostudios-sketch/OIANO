import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, CalendarClock, FileCheck2, Handshake, RefreshCw, Scale, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import './NextAction.css';

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
}

const URGENT = new Set(['SESSION_UNDERWAY', 'SESSION_IMMINENT', 'BALANCE_DUE']);
const ACTION_LABEL: Record<string, string> = {
  SESSION_UNDERWAY: 'Open session',
  SESSION_IMMINENT: 'View session',
  SESSION_AWAITING_STUDIO: 'View request',
  BALANCE_DUE: 'Review balance',
  DELIVERABLE_AWAITING_REVIEW: 'Review delivery',
  RIGHTS_DECISION_PENDING: 'Review split',
  CREDIT_AWAITING_RESPONSE: 'Review credit',
  CONSENT_REQUESTED: 'Review consent',
};
const ACTION_ICONS: Record<string, LucideIcon> = {
  SESSION_UNDERWAY: CalendarClock,
  SESSION_IMMINENT: CalendarClock,
  SESSION_AWAITING_STUDIO: CalendarClock,
  BALANCE_DUE: Wallet,
  DELIVERABLE_AWAITING_REVIEW: FileCheck2,
  RIGHTS_DECISION_PENDING: Scale,
  CREDIT_AWAITING_RESPONSE: BadgeCheck,
  CONSENT_REQUESTED: Handshake,
};

function RetryButton({ retry, isFetching }: { retry: () => void; isFetching: boolean }) {
  return (
    <button className="next-action-retry" type="button" onClick={retry} disabled={isFetching}>
      <RefreshCw size={15} aria-hidden="true" />
      {isFetching ? 'Checking…' : 'Try again'}
    </button>
  );
}

export default function NextAction() {
  const professional = useAuthStore(state => state.user?.role === 'PRODUCER');
  const projectsPath = professional ? '/producer' : '/projects';
  function actionHref(action: NextActionPayload) {
    // Legacy context links rights holders to the artist-only project view.
    // Professionals reach accepted work and its rights record via Contributions.
    return professional && action.kind === 'RIGHTS_DECISION_PENDING'
      && (action.href === '/projects' || action.href.startsWith('/projects?'))
      ? '/contributions' : action.href;
  }
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ContextPayload>({
    queryKey: ['context'],
    queryFn: async () => (await api.get('/context')).data,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <section className="next-action-card" aria-label="What to do next" role="status">
        <p className="next-action-eyebrow">Your next step</p>
        <p className="next-action-loading">Checking what needs your attention…</p>
      </section>
    );
  }

  if (!data?.next) {
    return (
      <section className="next-action-card" aria-label="What to do next" role="status">
        <p className="next-action-eyebrow">Your next step</p>
        <h2>We couldn’t load what needs you</h2>
        <p className="next-action-detail">We couldn’t check your pending decisions. Try again to see what needs attention.</p>
        <RetryButton retry={() => void refetch()} isFetching={isFetching} />
      </section>
    );
  }

  const { next } = data;
  const isQuiet = next.kind === 'NO_WORK_YET' || next.kind === 'ALL_CLEAR';
  const urgent = URGENT.has(next.kind);
  const secondary = (data.attention ?? []).filter(item => item.kind !== next.kind);
  const visible = secondary.slice(0, 3);
  const overflow = secondary.slice(3);

  return (
    <section className={`next-action-card${urgent ? ' is-urgent' : ''}`} aria-label="What to do next">
      {isError && (
        <div className="next-action-stale" role="alert">
          Couldn’t refresh your attention list. Showing the last available update.
          <RetryButton retry={() => void refetch()} isFetching={isFetching} />
        </div>
      )}
      <p className="next-action-eyebrow">
        {isQuiet ? 'When you’re ready' : urgent ? 'Time-sensitive' : 'Your next step'}
      </p>
      <h2>{isQuiet ? (next.kind === 'ALL_CLEAR' ? 'Choose what to work on next' : 'Choose your next creative step') : next.title}</h2>
      <p className="next-action-detail">{isQuiet && next.kind === 'NO_WORK_YET'
        ? 'Return to a project, review your contributions, or find someone to create with.'
        : next.detail}</p>

      {isQuiet ? (
        <div className="next-action-choices" aria-label="Ways to get started">
          <Link to={projectsPath}>Open projects <ArrowRight size={15} aria-hidden="true" /></Link>
          <Link to="/contributions">Review contributions <ArrowRight size={15} aria-hidden="true" /></Link>
          <Link to="/discover">Find people <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      ) : (
        <div className="next-action-primary">
          <Link to={actionHref(next)}>
            {actionHref(next) !== next.href ? 'Review contributions' : ACTION_LABEL[next.kind] ?? 'Open'}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {next.count !== undefined && next.count > 1 && <span>{next.count} items</span>}
        </div>
      )}

      {visible.length > 0 && (
        <div className="next-action-attention">
          <div className="next-action-list-heading">
            <h3>Also on your plate</h3>
            <span>{data.attention_total ?? data.attention.length} items</span>
          </div>
          <ul>
            {visible.map(item => {
              const Icon = ACTION_ICONS[item.kind] ?? BadgeCheck;
              return (
                <li key={`${item.kind}-${item.href}`}>
                  <Link to={actionHref(item)} className="next-action-row">
                    <span className="next-action-icon"><Icon size={17} aria-hidden="true" /></span>
                    <span className="next-action-row-copy">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    {item.count !== undefined && item.count > 1 && <span className="next-action-count">{item.count}</span>}
                    <ArrowRight className="next-action-row-arrow" size={16} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {overflow.length > 0 && (
            <details className="next-action-more">
              <summary>Show {overflow.length} more attention {overflow.length === 1 ? 'item' : 'items'}</summary>
              <ul>
                {overflow.map(item => {
                  const Icon = ACTION_ICONS[item.kind] ?? BadgeCheck;
                  return (
                    <li key={`${item.kind}-${item.href}`}>
                      <Link to={actionHref(item)} className="next-action-row">
                        <span className="next-action-icon"><Icon size={17} aria-hidden="true" /></span>
                        <span className="next-action-row-copy">
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                        </span>
                        {item.count !== undefined && item.count > 1 && <span className="next-action-count">{item.count}</span>}
                        <ArrowRight className="next-action-row-arrow" size={16} aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
