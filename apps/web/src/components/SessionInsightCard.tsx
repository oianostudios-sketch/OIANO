/**
 * SessionInsightCard — the frontend half of the intelligence layer's first
 * two capabilities (Next Action, Session Summary), per Stage 9's "premium UX"
 * principle: a quiet contextual card, not a chatbot panel. No AI labels, no
 * icons that announce "artificial intelligence," no confidence scores shown.
 *
 * Fails silently and completely: if the master flag or either capability
 * flag is off, if the provider is unavailable, or if the response is
 * low-confidence, both queries resolve to `{enabled:false}` or
 * `{result:null}` and this component renders null — the page looks exactly
 * as it would if this component didn't exist. Nothing here ever performs an
 * action; the suggested next step is presentational text, not a button wired
 * to a handler, precisely because Stage 7 makes AI read-only in V1 and this
 * component has no reliable way to know which existing control on the page
 * corresponds to a given free-text suggestion.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface NextActionResult {
  label: string;
  reason: string;
}

interface SessionSummaryResult {
  knownFacts: string[];
  inferredInsights: string[];
  suggestedFollowUp: string[];
}

interface CapabilityEnvelope<T> {
  enabled: boolean;
  result: T | null;
}

export default function SessionInsightCard({ bookingId }: { bookingId: string }) {
  const { data: nextAction } = useQuery<CapabilityEnvelope<NextActionResult>>({
    queryKey: ['booking-next-action', bookingId],
    queryFn: async () => (await api.get(`/bookings/${bookingId}/next-action`)).data,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: summary } = useQuery<CapabilityEnvelope<SessionSummaryResult>>({
    queryKey: ['booking-session-summary', bookingId],
    queryFn: async () => (await api.get(`/bookings/${bookingId}/session-summary`)).data,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const action = nextAction?.enabled ? nextAction.result : null;
  const facts = summary?.enabled ? summary.result?.knownFacts ?? [] : [];
  // Kept visually distinct from facts on purpose — an inference is not a
  // confirmed fact, and the two must never look identical (Stage 5/8 of the
  // intelligence-layer design). The model is also prompted to phrase these
  // as inferences ("Likely...", "Appears to...").
  const insights = summary?.enabled ? summary.result?.inferredInsights ?? [] : [];
  const followUps = summary?.enabled ? summary.result?.suggestedFollowUp ?? [] : [];

  if (!action && facts.length === 0 && insights.length === 0 && followUps.length === 0) return null;

  return (
    <div className="rounded-xl border border-dome/20 bg-dome/[.04] px-6 py-5 animate-surface">
      {facts.length > 0 && (
        <ul className="space-y-1.5">
          {facts.map((fact, i) => (
            <li key={i} className="text-sm text-zinc-300 flex items-start gap-2.5">
              <span className="mt-[7px] w-1 h-1 rounded-full bg-dome flex-shrink-0" />
              {fact}
            </li>
          ))}
        </ul>
      )}
      {insights.length > 0 && (
        <ul className={`space-y-1.5 ${facts.length > 0 ? 'mt-3' : ''}`}>
          {insights.map((insight, i) => (
            <li key={i} className="text-sm text-zinc-500 italic flex items-start gap-2.5">
              <span className="mt-[7px] w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
              {insight}
            </li>
          ))}
        </ul>
      )}
      {action && (
        <div className={facts.length > 0 || insights.length > 0 ? 'pt-4 mt-4 border-t border-white/[.06]' : ''}>
          <p className="text-sm text-dome font-medium">{action.label}</p>
          <p className="text-xs text-zinc-600 mt-1">{action.reason}</p>
        </div>
      )}
      {followUps.length > 0 && (
        <ul className={action || facts.length > 0 || insights.length > 0 ? 'mt-3 space-y-1' : ''}>
          {followUps.map((item, i) => (
            <li key={i} className="text-xs text-zinc-600 flex items-start gap-2">
              <span className="mt-1 w-0.5 h-0.5 rounded-full bg-zinc-700 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
