// apps/api/src/lib/businessDefinitions.ts
//
// The business-metric definition layer: for every concept a BI surface might
// want to show, state precisely what it means, where it's computed today (if
// anywhere), and what's known to be wrong or missing about it. This exists so
// an operator — or a future engineer — can inspect a metric's definition
// instead of trusting a number on faith, and so a metric with no honest
// definition gets marked UNSUPPORTED instead of quietly approximated.
//
// Populated from a direct, four-part audit of the live schema, API routes,
// and financial ledger (2026-09-01) — not from assumption. Several entries
// document a real conflict: the same English name already means slightly
// different things in different existing endpoints. Where that's true, this
// file states all of them rather than silently picking a winner.

export type DefinitionStatus = 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED';

export interface BusinessDefinition {
  key: string;
  label: string;
  status: DefinitionStatus;
  definition: string;
  formula: string;
  data_source: string;
  limitations?: string;
  known_conflicts?: string;
}

export const BUSINESS_DEFINITIONS: BusinessDefinition[] = [
  {
    key: 'new_artist', label: 'New artist', status: 'SUPPORTED',
    definition: 'An Artist account created within the comparison window.',
    formula: 'count(Artist.created_at >= period_start)',
    data_source: 'apps/api/src/routes/maintenance.routes.ts (/summary, /growth)',
  },
  {
    key: 'new_studio', label: 'New studio', status: 'SUPPORTED',
    definition: 'A Studio row created within the comparison window.',
    formula: 'count(Studio.created_at >= period_start)',
    data_source: 'Studio.created_at — same pattern as new_artist, not currently surfaced anywhere.',
  },
  {
    key: 'active_artist', label: 'Active artist', status: 'PARTIAL',
    definition: 'No single definition exists today. Three different, mutually inconsistent ones already coexist in the codebase.',
    formula: 'See known_conflicts — do not add a fourth without resolving the existing three first.',
    data_source: 'network-metrics.routes.ts, pulse.routes.ts, network-exchange.routes.ts',
    known_conflicts: '(1) network-metrics.routes.ts: distinct artist_id on non-cancelled/no-show bookings in last 30 days. (2) pulse.routes.ts: distinct artist_id on ANY booking (no status filter) in last 30 days — a cancelled booking still counts. (3) network-exchange.routes.ts: Artist.status === "AVAILABLE_FOR_BOOKING" network-wide — a self-reported flag set at signup, never derived from booking history.',
  },
  {
    key: 'active_studio', label: 'Active studio', status: 'UNSUPPORTED',
    definition: 'No verification, activity, or standing field exists on Studio at all.',
    formula: 'N/A',
    data_source: 'Studio model has no is_active/status/verified column.',
    limitations: 'maintenance.routes.ts /studios computes status: liveSessions > 0 ? "LIVE" : "ONLINE" — this describes whether a session is happening RIGHT NOW, not whether the studio is an active business. Do not treat it as a general activity signal.',
  },
  {
    key: 'verified_studio', label: 'Verified studio', status: 'UNSUPPORTED',
    definition: 'No verification/trust field exists on Studio.',
    formula: 'N/A',
    data_source: 'N/A',
    limitations: 'The word "verified" appears in two API responses (network-metrics.routes.ts engineer metric detail text; studio.routes.ts proof.verified_reviews) but neither is backed by a real moderation/verification process — both are cosmetic copy, not data. Do not build on this language.',
  },
  {
    key: 'booking_created', label: 'Booking created', status: 'SUPPORTED',
    definition: 'A Booking row exists, regardless of current status.',
    formula: 'count(Booking.created_at within period)',
    data_source: 'maintenance.routes.ts /summary, /bookings',
  },
  {
    key: 'booking_confirmed', label: 'Booking confirmed', status: 'PARTIAL',
    definition: 'Current-state snapshot count is reliable. A dated funnel ("how many became confirmed within period X") is not.',
    formula: 'Snapshot: count(Booking.status = CONFIRMED). Dated: unsupported.',
    data_source: 'Booking.status',
    limitations: 'Booking has only created_at/updated_at — no confirmed_at. updated_at is shared with reschedule and engineer-reassignment writes, so it cannot stand in for "time of confirmation."',
  },
  {
    key: 'booking_completed', label: 'Booking completed', status: 'PARTIAL',
    definition: 'Current-state snapshot count is reliable and is the basis of completion_rate.',
    formula: 'count(Booking.status = COMPLETED)',
    data_source: 'maintenance.routes.ts /bookings: completion_rate = COMPLETED / total',
    limitations: 'Three separate code paths can set COMPLETED; one (file-delivery auto-complete) skips the ActivityEvent emit and the StudioCircle repeat-customer sync that the other two perform. Anything downstream of those two side effects can undercount.',
  },
  {
    key: 'booking_cancelled', label: 'Booking cancelled / cancellation rate', status: 'SUPPORTED',
    definition: 'Share of all bookings that ended CANCELLED or NO_SHOW.',
    formula: '(count(status=CANCELLED) + count(status=NO_SHOW)) / count(all)',
    data_source: 'maintenance.routes.ts /bookings: cancellation_rate',
  },
  {
    key: 'paying_customer', label: 'Paying customer', status: 'PARTIAL',
    definition: 'An artist with at least one Payment.status = PAID booking.',
    formula: 'count(distinct artist_id) where Payment.status = PAID',
    data_source: 'No dedicated endpoint; derivable from Booking+Payment join.',
    limitations: "Cancelling a booking never reverses its Payment.status — a paid-then-cancelled booking still counts as a paying customer with no way to detect or exclude it today.",
  },
  {
    key: 'repeat_customer', label: 'Repeat customer', status: 'PARTIAL',
    definition: 'An artist with more than one non-cancelled/no-show booking, network-wide.',
    formula: 'count(artist_id) among bookings where status NOT IN (CANCELLED, NO_SHOW) > 1',
    data_source: 'maintenance.routes.ts /growth funnel ("Repeat creator" stage) — this is the reference formula used by activationGapSignal and the growth funnel.',
    limitations: 'StudioCircleMember.session_count is a separate, studio-scoped repeat-booking counter built for the public Passport/consent feature, not for BI — it is also incomplete (missed by the same file-delivery completion path noted under booking_completed). Do not treat it as network-wide.',
  },
  {
    key: 'first_booking', label: 'First booking', status: 'SUPPORTED',
    definition: "An artist's earliest Booking.created_at.",
    formula: 'min(Booking.created_at) group by artist_id',
    data_source: 'Derivable directly; not currently materialized anywhere.',
  },
  {
    key: 'booking_conversion', label: 'Booking conversion', status: 'UNSUPPORTED',
    definition: 'As "search resulted in a booking": unsupported — no search or availability query is ever logged anywhere in the system (confirmed: no SearchEvent-shaped model, no analytics SDK, GET /api/availability does not persist the request).',
    formula: 'N/A for a search-to-booking funnel.',
    data_source: 'N/A',
    limitations: 'A narrower, currently-supported reading — created-to-confirmed/paid ratio using snapshot counts — is possible and used implicitly by /bookings\' completion_rate, but that is a different, weaker claim than "conversion" usually implies.',
  },
  {
    key: 'studio_utilization', label: 'Studio utilization', status: 'PARTIAL',
    definition: 'Booked hours as a share of theoretical available hours, computed today by two independent implementations using the same assumption set.',
    formula: 'booked_hours / (room_count × operating_hours × window_days)',
    data_source: 'network-metrics.routes.ts (30-day window, hardcoded 30), pulse.routes.ts (today only)',
    limitations: 'Applies one uniform Studio.operating_open_hour/close_hour to every room; ignores AvailabilitySlot blackouts (the model exists but is never read or written — fully dead schema); does not exclude rooms with an open MaintenanceIssue. Treat as a directional proxy, not a precise capacity figure.',
    known_conflicts: 'The two implementations use different window lengths (30 fixed days vs. today) and will not agree with each other for the same studio.',
  },
  {
    key: 'retention_churn', label: 'Retention / churn', status: 'UNSUPPORTED',
    definition: 'No cohort-based, time-boxed return-rate concept exists anywhere. "Repeat customer" (see above) is a lifetime count, not a retention curve.',
    formula: 'N/A',
    data_source: 'N/A',
  },
  {
    key: 'gmv', label: 'GMV (Gross Merchandise Value)', status: 'PARTIAL',
    definition: 'Three different, disagreeing numbers already exist under names close to "GMV" — pick one deliberately, do not assume they are interchangeable.',
    formula: 'See known_conflicts.',
    data_source: 'maintenance.routes.ts /summary (gmv_paid_usd), /finance (collected, booked_value)',
    known_conflicts: '(1) gmv_paid_usd = SUM(Payment.amount_usd) WHERE status=PAID — excludes the ENTIRE row for any booking ever partially/fully refunded, despite being labeled "Gross paid booking value." (2) finance.collected = SUM(amount_usd − refunded_usd) WHERE status IN (PAID, PARTIALLY_REFUNDED, REFUNDED) — correctly nets refunds, the most accurate "money that stayed collected" figure of the three. (3) finance.booked_value = SUM(Booking.total_usd) WHERE status NOT IN (CANCELLED, NO_SHOW) — includes unpaid/pending bookings, closer to true gross booking intent. None of the three excludes a paid-then-cancelled booking (see paying_customer).',
    limitations: 'Wallet top-ups (finance.wallet_topups) are a separate cash-inflow figure shown alongside these — summing it with any of the above double-counts, since a wallet top-up later spent on a booking already appears once as the booking payment.',
  },
  {
    key: 'oiano_revenue', label: "Oiano revenue / platform take", status: 'SUPPORTED',
    definition: "Oiano's fee share of settled bookings, per the double-entry ledger's PLATFORM_REVENUE account.",
    formula: 'platformFee = round(payment_amount × Studio.platform_fee_bps / 10000), posted per payment via bookingAllocation()',
    data_source: 'apps/api/src/lib/financialLedger.ts (bookingAllocation), FinancialLedgerEntry account_code=PLATFORM_REVENUE',
    limitations: 'The mechanism is real and correctly tested (financialLedger.test.ts). The VALUE is $0 across every studio today, by deliberate design: platform_fee_bps defaults to 0 and no route anywhere sets it to anything else — docs/business/PLATFORM_FEES.md confirms this is intentional pending a signed commercial schedule per studio, not a bug. Separately, maintenance.routes.ts /summary\'s platform_revenue_usd sums CREDIT-direction ledger entries only, ignoring the DEBIT reversal a refund posts — moot today only because the fee is universally zero; this query will overstate revenue the moment both a nonzero fee and a refund occur together.',
  },
  {
    key: 'refund', label: 'Refund', status: 'SUPPORTED',
    definition: 'Payment.refunded_usd plus a reversing FinancialTransaction (source_type BOOKING_REFUND).',
    formula: 'SUM(Payment.refunded_usd)',
    data_source: 'apps/api/src/routes/webhooks.routes.ts handleRefund()',
    limitations: 'No dedicated Refund model — a partial vs. full refund history beyond the current cumulative amount is not preserved. Wallet-funded bookings have no refund path at all today (confirmed: no code credits a wallet back for a cancelled/refunded wallet-paid booking).',
  },
  {
    key: 'outstanding_balance', label: 'Outstanding balance', status: 'PARTIAL',
    definition: 'Wallet.balance_usd is a real, reconciled liability figure (see findWalletDrift). There is no "amount a studio owes Oiano" concept, since platform fees are universally $0 today.',
    formula: 'SUM(Wallet.balance_usd)',
    data_source: 'maintenance.routes.ts /finance: wallet_liability',
  },
  {
    key: 'average_booking_value', label: 'Average booking value', status: 'SUPPORTED',
    definition: 'Mean Booking.total_usd.',
    formula: 'AVG(Booking.total_usd)',
    data_source: 'Derivable directly; not currently surfaced anywhere.',
  },
  {
    key: 'revenue_per_active_user', label: 'Revenue per active user / per active studio', status: 'UNSUPPORTED',
    definition: 'Both required inputs are currently unreliable: the numerator (oiano_revenue) is $0 network-wide, and the denominator (active_artist / active_studio) has no single agreed definition.',
    formula: 'N/A until both inputs are resolved.',
    data_source: 'N/A',
  },
  {
    key: 'search_no_result', label: 'Search with no result', status: 'UNSUPPORTED',
    definition: 'No search or availability query is ever logged. GET /api/availability reads live booking overlap and returns a result — it does not persist that the request happened, let alone whether it returned anything.',
    formula: 'N/A',
    data_source: 'N/A',
  },
  {
    key: 'demand', label: 'Demand', status: 'PARTIAL',
    definition: 'Booking creation volume is the only available demand proxy. There is no unmet-demand signal (no search-miss tracking).',
    formula: 'count(Booking.created_at within period)',
    data_source: 'Same as booking_created.',
  },
  {
    key: 'supply', label: 'Supply', status: 'PARTIAL',
    definition: 'Room-hours (room_count × operating_hours) is the only available supply proxy, subject to the same limitations as studio_utilization.',
    formula: 'room_count × operating_hours',
    data_source: 'Same as studio_utilization.',
  },
];

export function getBusinessDefinition(key: string): BusinessDefinition | undefined {
  return BUSINESS_DEFINITIONS.find((d) => d.key === key);
}
