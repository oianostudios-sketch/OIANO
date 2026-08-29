// apps/api/src/intelligence/context/context-builder.ts
// Reduces an already-authorized query result down to the minimum structured
// context a capability actually needs. This module never queries Prisma
// itself and never receives a raw Prisma model instance — the route does its
// own existing, already-scoped query and passes in exactly this narrow shape.
// That's deliberate: authorization stays where Oiano already enforces it
// (the route), and this module can't accidentally widen it.

export interface BookingForNextAction {
  id: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  payment_status: string | null;
  has_session_notes: boolean;
  quality_rating: number | null;
  deliverable_statuses: string[];
  has_project: boolean;
  credit_statuses: string[];
  rights_statuses: string[];
}

export interface NextActionContext {
  bookingId: string;
  status: string;
  hoursSinceEnd: number;
  paymentStatus: string | null;
  hasSessionNotes: boolean;
  qualityRating: number | null;
  deliverableCount: number;
  pendingReviewDeliverables: number;
  hasProject: boolean;
  draftCredits: number;
  confirmedCredits: number;
  proposedRights: number;
}

export function buildNextActionContext(booking: BookingForNextAction): NextActionContext {
  const hoursSinceEnd = Math.max(0, (Date.now() - booking.ends_at.getTime()) / 3_600_000);
  return {
    bookingId: booking.id,
    status: booking.status,
    hoursSinceEnd: Math.round(hoursSinceEnd),
    paymentStatus: booking.payment_status,
    hasSessionNotes: booking.has_session_notes,
    qualityRating: booking.quality_rating,
    deliverableCount: booking.deliverable_statuses.length,
    pendingReviewDeliverables: booking.deliverable_statuses.filter((s) => s === 'PENDING_REVIEW').length,
    hasProject: booking.has_project,
    draftCredits: booking.credit_statuses.filter((s) => s === 'DRAFT').length,
    confirmedCredits: booking.credit_statuses.filter((s) => s === 'CONFIRMED').length,
    proposedRights: booking.rights_statuses.filter((s) => s === 'PROPOSED').length,
  };
}

// ── Session Summary ──────────────────────────────────────────────────────────
// A separate, purpose-built input shape rather than reusing/widening
// BookingForNextAction — Session Summary is allowed slightly more structured
// (never free-text) detail than Next Action needs, and keeping them distinct
// means neither capability's context can silently grow to fit the other's
// requirements.

export interface BookingForSessionSummary {
  id: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  service_name: string | null;
  room_name: string | null;
  payment_status: string | null;
  quality_rating: number | null;
  tracks_worked: string[];
  deliverable_statuses: string[];
  has_project: boolean;
  credit_statuses: string[];
  rights_statuses: string[];
}

export interface SessionSummaryContext {
  bookingId: string;
  status: string;
  serviceName: string | null;
  roomName: string | null;
  durationHours: number;
  paymentStatus: string | null;
  qualityRating: number | null;
  tracksWorked: string[];
  deliverableCount: number;
  approvedDeliverables: number;
  pendingReviewDeliverables: number;
  hasProject: boolean;
  draftCredits: number;
  confirmedCredits: number;
  proposedRights: number;
}

export function buildSessionSummaryContext(booking: BookingForSessionSummary): SessionSummaryContext {
  const durationHours = Math.max(0, (booking.ends_at.getTime() - booking.starts_at.getTime()) / 3_600_000);
  return {
    bookingId: booking.id,
    status: booking.status,
    serviceName: booking.service_name,
    roomName: booking.room_name,
    durationHours: Math.round(durationHours * 10) / 10,
    paymentStatus: booking.payment_status,
    qualityRating: booking.quality_rating,
    tracksWorked: booking.tracks_worked,
    deliverableCount: booking.deliverable_statuses.length,
    approvedDeliverables: booking.deliverable_statuses.filter((s) => s === 'APPROVED').length,
    pendingReviewDeliverables: booking.deliverable_statuses.filter((s) => s === 'PENDING_REVIEW').length,
    hasProject: booking.has_project,
    draftCredits: booking.credit_statuses.filter((s) => s === 'DRAFT').length,
    confirmedCredits: booking.credit_statuses.filter((s) => s === 'CONFIRMED').length,
    proposedRights: booking.rights_statuses.filter((s) => s === 'PROPOSED').length,
  };
}

// ── Navigation Intelligence ──────────────────────────────────────────────────
// Studio-scoped aggregate counts only — never individual record content —
// sourced the same conceptual way pulse.routes.ts already sources its
// aggregates (see the Stage 1 audit). V1 ranks only over a fixed allowlist of
// destinations that already exist in CommandPalette.tsx for this role; the
// schema (schemas/navigation.schema.ts) enforces that allowlist at parse
// time, not just by prompt instruction.

export interface StudioNavigationSignals {
  pendingBookings: number;
  todaySessionsRemaining: number;
  pendingReviewDeliverables: number;
  draftCredits: number;
  overduePayments: number;
}

export interface NavigationContext extends StudioNavigationSignals {
  role: 'STUDIO_ADMIN';
}

export function buildNavigationContext(signals: StudioNavigationSignals): NavigationContext {
  return { role: 'STUDIO_ADMIN', ...signals };
}
