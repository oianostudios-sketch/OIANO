import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNextActionContext, BookingForNextAction,
  buildSessionSummaryContext, BookingForSessionSummary,
  buildNavigationContext, StudioNavigationSignals,
} from './context-builder';

function booking(overrides: Partial<BookingForNextAction> = {}): BookingForNextAction {
  return {
    id: 'booking-1',
    status: 'COMPLETED',
    starts_at: new Date('2026-01-01T10:00:00Z'),
    ends_at: new Date('2026-01-01T12:00:00Z'),
    payment_status: 'PAID',
    has_session_notes: true,
    quality_rating: 5,
    deliverable_statuses: ['PENDING_REVIEW', 'APPROVED'],
    has_project: true,
    credit_statuses: ['DRAFT', 'DRAFT', 'CONFIRMED'],
    rights_statuses: ['PROPOSED'],
    ...overrides,
  };
}

test('reduces a booking to counts, never passes raw text fields through', () => {
  const ctx = buildNextActionContext(booking());
  assert.equal(ctx.deliverableCount, 2);
  assert.equal(ctx.pendingReviewDeliverables, 1);
  assert.equal(ctx.draftCredits, 2);
  assert.equal(ctx.confirmedCredits, 1);
  assert.equal(ctx.proposedRights, 1);
  assert.ok(!('notes' in ctx), 'session notes text must never reach the context object');
});

test('a booking with no project produces zeroed project-derived fields, not an error', () => {
  const ctx = buildNextActionContext(booking({ has_project: false, credit_statuses: [], rights_statuses: [] }));
  assert.equal(ctx.hasProject, false);
  assert.equal(ctx.draftCredits, 0);
  assert.equal(ctx.confirmedCredits, 0);
  assert.equal(ctx.proposedRights, 0);
});

test('hoursSinceEnd never goes negative for a booking ending in the future', () => {
  const ctx = buildNextActionContext(booking({ ends_at: new Date(Date.now() + 3_600_000) }));
  assert.equal(ctx.hoursSinceEnd, 0);
});

// ── Session Summary ──────────────────────────────────────────────────────────

function sessionBooking(overrides: Partial<BookingForSessionSummary> = {}): BookingForSessionSummary {
  return {
    id: 'booking-1',
    status: 'COMPLETED',
    starts_at: new Date('2026-01-01T10:00:00Z'),
    ends_at: new Date('2026-01-01T12:30:00Z'),
    service_name: 'Recording Session',
    room_name: 'Main Studio',
    payment_status: 'PAID',
    quality_rating: 5,
    tracks_worked: ['Track 1', 'Track 2'],
    deliverable_statuses: ['APPROVED', 'PENDING_REVIEW'],
    has_project: true,
    credit_statuses: ['DRAFT'],
    rights_statuses: [],
    ...overrides,
  };
}

test('session summary context computes duration and never leaks raw booking notes (there are none in this shape to leak)', () => {
  const ctx = buildSessionSummaryContext(sessionBooking());
  assert.equal(ctx.durationHours, 2.5);
  assert.equal(ctx.approvedDeliverables, 1);
  assert.equal(ctx.pendingReviewDeliverables, 1);
  assert.deepEqual(ctx.tracksWorked, ['Track 1', 'Track 2']);
});

test('session summary with no tracks worked produces an empty array, not undefined', () => {
  const ctx = buildSessionSummaryContext(sessionBooking({ tracks_worked: [] }));
  assert.deepEqual(ctx.tracksWorked, []);
});

// ── Navigation Intelligence ──────────────────────────────────────────────────

test('navigation context passes through aggregate counts only, tagged with the role', () => {
  const signals: StudioNavigationSignals = {
    pendingBookings: 3, todaySessionsRemaining: 2, pendingReviewDeliverables: 5, draftCredits: 1, overduePayments: 0,
  };
  const ctx = buildNavigationContext(signals);
  assert.equal(ctx.role, 'STUDIO_ADMIN');
  assert.equal(ctx.pendingReviewDeliverables, 5);
});
