// apps/api/src/lib/businessSignals.ts
//
// Deterministic, rule-based business signals for Oiano's operator-facing
// Maintenance surface. Every rule here is a pure function over data the
// caller already fetched — no rule queries the database itself, so each one
// is trivially unit-testable with fixture data and carries zero query cost
// of its own.
//
// Deliberately state-based, not trend-based: the real dataset behind this
// system is small (low tens of bookings/artists at most), so a week-over-week
// or cohort comparison would mostly measure noise, not signal. Every rule
// below asks "is something true right now?" rather than "did something
// change?" — that's honest at any sample size, including one this small.
//
// Each signal must be traceable to the exact numbers it's built from — see
// the `evidence` field on every emitted signal — and must point to the
// existing Maintenance page that shows the full underlying detail (`href`),
// so an operator can always go from "something needs attention" to "here is
// the record."

export type SignalPriority = 'CRITICAL' | 'ATTENTION' | 'OPPORTUNITY' | 'WATCH';
export type SignalDomain = 'FINANCIAL' | 'MARKETPLACE' | 'GROWTH' | 'OPERATIONAL';

export interface BusinessSignal {
  id: string;
  priority: SignalPriority;
  domain: SignalDomain;
  headline: string;
  explanation: string;
  evidence: Record<string, string | number | null>;
  action_hint: string;
  href: string;
}

const PRIORITY_ORDER: Record<SignalPriority, number> = { CRITICAL: 0, ATTENTION: 1, OPPORTUNITY: 2, WATCH: 3 };
export function sortSignals(signals: BusinessSignal[]): BusinessSignal[] {
  return [...signals].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

export function failedPaymentsSignal(count: number): BusinessSignal | null {
  if (count <= 0) return null;
  return {
    id: 'failed_payments',
    priority: 'CRITICAL',
    domain: 'FINANCIAL',
    headline: `${count} failed payment${count === 1 ? '' : 's'}`,
    explanation: 'A payment attempt did not complete. The booking behind it may be unpaid and unresolved.',
    evidence: { failed_payment_count: count },
    action_hint: 'Review payment exceptions and recovery status.',
    href: '/maintenance/finance',
  };
}

export function processingPaymentsSignal(count: number): BusinessSignal | null {
  if (count <= 0) return null;
  return {
    id: 'processing_payments',
    priority: 'WATCH',
    domain: 'FINANCIAL',
    headline: `${count} payment${count === 1 ? '' : 's'} still processing`,
    explanation: 'Payment was initiated but the provider has not yet confirmed success or failure.',
    evidence: { processing_payment_count: count },
    action_hint: 'Watch for delayed provider confirmation; investigate if still processing after a normal settlement window.',
    href: '/maintenance/finance',
  };
}

export interface WalletDriftRow { wallet_id: string; artist: string; stored_balance: number; computed_balance: number; drift: number }
export function walletDriftSignal(drift: WalletDriftRow[]): BusinessSignal | null {
  if (drift.length === 0) return null;
  const totalDrift = Math.round(drift.reduce((sum, row) => sum + Math.abs(row.drift), 0) * 100) / 100;
  return {
    id: 'wallet_drift',
    priority: 'CRITICAL',
    domain: 'FINANCIAL',
    headline: `${drift.length} wallet${drift.length === 1 ? '' : 's'} out of balance`,
    explanation: "A wallet's stored balance no longer matches the sum of its own transaction history.",
    evidence: { wallets_affected: drift.length, total_drift_usd: totalDrift },
    action_hint: 'Investigate before trusting any balance for the affected wallet(s).',
    href: '/maintenance/finance',
  };
}

export interface LedgerReconciliation { healthy: boolean; unbalanced_transactions: unknown[]; missing_payment_entries: unknown[]; missing_topup_entries: unknown[] }
export function ledgerHealthSignal(reconciliation: LedgerReconciliation): BusinessSignal | null {
  if (reconciliation.healthy) return null;
  return {
    id: 'ledger_unbalanced',
    priority: 'CRITICAL',
    domain: 'FINANCIAL',
    headline: 'Double-entry ledger is not balanced',
    explanation: 'At least one financial transaction has unequal debits and credits, or a settled payment/top-up has no matching ledger entry.',
    evidence: {
      unbalanced_transactions: reconciliation.unbalanced_transactions.length,
      missing_payment_entries: reconciliation.missing_payment_entries.length,
      missing_topup_entries: reconciliation.missing_topup_entries.length,
    },
    action_hint: 'Do not treat platform revenue or studio payable figures as trustworthy until this is resolved.',
    href: '/maintenance/finance',
  };
}

export function pendingBookingsSignal(count: number, oldest: { id: string; created_at: Date; studio_name: string } | null): BusinessSignal | null {
  if (count <= 0) return null;
  const hoursOld = oldest ? Math.round((Date.now() - oldest.created_at.getTime()) / 3_600_000) : null;
  return {
    id: 'pending_bookings',
    priority: 'ATTENTION',
    domain: 'MARKETPLACE',
    headline: `${count} booking${count === 1 ? '' : 's'} awaiting studio confirmation`,
    explanation: 'A booking has been requested but no studio has confirmed or declined it yet.',
    evidence: {
      pending_count: count,
      oldest_pending_hours: hoursOld,
      oldest_pending_studio: oldest?.studio_name ?? null,
    },
    action_hint: hoursOld && hoursOld > 48 ? 'Oldest request has waited over 48 hours — a studio may be missing this.' : 'Studio confirmation is still required.',
    href: '/maintenance/bookings',
  };
}

export function idleStudiosSignal(studiosWithNoBookings: { id: string; name: string }[]): BusinessSignal | null {
  if (studiosWithNoBookings.length === 0) return null;
  return {
    id: 'idle_studios',
    priority: 'ATTENTION',
    domain: 'MARKETPLACE',
    headline: `${studiosWithNoBookings.length} studio${studiosWithNoBookings.length === 1 ? '' : 's'} has never received a booking`,
    explanation: 'Supply exists on the network but has not converted into any demand yet.',
    evidence: { studio_names: studiosWithNoBookings.map((s) => s.name).join(', ') },
    action_hint: 'Check whether these studios are discoverable, priced competitively, and have real availability.',
    href: '/maintenance/studios',
  };
}

export function activationGapSignal(totalArtists: number, artistsWithNoBookings: number): BusinessSignal | null {
  if (totalArtists === 0 || artistsWithNoBookings <= 0) return null;
  const pct = Math.round((artistsWithNoBookings / totalArtists) * 100);
  return {
    id: 'activation_gap',
    priority: 'OPPORTUNITY',
    domain: 'GROWTH',
    headline: `${artistsWithNoBookings} of ${totalArtists} artists (${pct}%) have never booked`,
    explanation: 'These accounts exist on the network but have not converted into a first booking.',
    evidence: { total_artists: totalArtists, never_booked: artistsWithNoBookings, never_booked_pct: pct },
    action_hint: 'Inspect the conversion funnel to see where this cohort is falling out.',
    href: '/maintenance/growth',
  };
}

export function revenueActivationSignal(gmvPaidUsd: number, studiosWithFeeConfigured: number, totalStudios: number): BusinessSignal | null {
  if (gmvPaidUsd <= 0 || studiosWithFeeConfigured > 0 || totalStudios === 0) return null;
  return {
    id: 'revenue_not_activated',
    priority: 'OPPORTUNITY',
    domain: 'FINANCIAL',
    headline: `$${Math.round(gmvPaidUsd).toLocaleString()} in gross bookings, $0 platform revenue`,
    explanation: `No studio on the network (0 of ${totalStudios}) has a platform fee configured, so Oiano's fee mechanism has never activated — this is expected given today's configuration, not a calculation error.`,
    evidence: { gmv_paid_usd: Math.round(gmvPaidUsd * 100) / 100, studios_with_fee_configured: studiosWithFeeConfigured, total_studios: totalStudios },
    action_hint: 'Review commercial fee schedules with studios once ready to activate platform revenue.',
    href: '/maintenance/finance',
  };
}
