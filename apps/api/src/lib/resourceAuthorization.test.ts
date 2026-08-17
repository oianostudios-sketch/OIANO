import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessBookingMessages, canArtistActOnProject, canManageOwnedProject, isConsentTransitionAllowed, isRightsTransitionAllowed, ownershipSharesAreValid } from './resourceAuthorization';

test('project mutations require the owning producer', () => {
  assert.equal(canManageOwnedProject('PRODUCER', 'producer-1', 'producer-1'), true);
  assert.equal(canManageOwnedProject('PRODUCER', 'producer-2', 'producer-1'), false);
  assert.equal(canManageOwnedProject('ARTIST', 'producer-1', 'producer-1'), false);
  assert.equal(canManageOwnedProject('OIANO_ADMIN', 'producer-1', 'producer-1'), false);
});

test('artist project actions require project ownership', () => {
  assert.equal(canArtistActOnProject('ARTIST', 'artist-1', 'artist-1'), true);
  assert.equal(canArtistActOnProject('ARTIST', 'artist-2', 'artist-1'), false);
  assert.equal(canArtistActOnProject('PRODUCER', 'artist-1', 'artist-1'), false);
  assert.equal(canArtistActOnProject('ARTIST', null, 'artist-1'), false);
});

test('promotional consent transitions cannot be replayed or escalated', () => {
  assert.equal(isConsentTransitionAllowed('REQUESTED', 'APPROVE'), true);
  assert.equal(isConsentTransitionAllowed('REQUESTED', 'DECLINE'), true);
  assert.equal(isConsentTransitionAllowed('REQUESTED', 'WITHDRAW'), false);
  assert.equal(isConsentTransitionAllowed('APPROVED', 'WITHDRAW'), true);
  assert.equal(isConsentTransitionAllowed('APPROVED', 'APPROVE'), false);
  assert.equal(isConsentTransitionAllowed('DECLINED', 'WITHDRAW'), false);
  assert.equal(isConsentTransitionAllowed('WITHDRAWN', 'APPROVE'), false);
});

test('rights proposals can only be answered once', () => {
  assert.equal(isRightsTransitionAllowed('PROPOSED', 'APPROVE'), true);
  assert.equal(isRightsTransitionAllowed('PROPOSED', 'DISPUTE'), true);
  assert.equal(isRightsTransitionAllowed('APPROVED', 'DISPUTE'), false);
  assert.equal(isRightsTransitionAllowed('DISPUTED', 'APPROVE'), false);
});

test('ownership shares require unique holders and exactly one hundred percent', () => {
  assert.equal(ownershipSharesAreValid([{ holder_name: 'Artist', percentage: 50 }, { holder_name: 'Producer', percentage: 50 }]), true);
  assert.equal(ownershipSharesAreValid([{ holder_name: 'Artist', percentage: 60 }, { holder_name: 'Producer', percentage: 30 }]), false);
  assert.equal(ownershipSharesAreValid([{ holder_name: 'Artist', percentage: 50 }, { holder_name: 'artist', percentage: 50 }]), false);
  assert.equal(ownershipSharesAreValid([{ holder_name: 'Artist', percentage: 100 }]), false);
  assert.equal(ownershipSharesAreValid([{ holder_name: 'Artist', percentage: 101 }, { holder_name: 'Producer', percentage: -1 }]), false);
});

test('message access requires booking ownership, assignment, or studio scope', () => {
  const base = {
    artistUserId: 'artist-1', engineerUserId: 'engineer-1', bookingStudioId: 'studio-1',
    actorId: 'artist-1', actorRole: 'ARTIST',
  };
  assert.equal(canAccessBookingMessages(base), true);
  assert.equal(canAccessBookingMessages({ ...base, actorId: 'artist-2' }), false);
  assert.equal(canAccessBookingMessages({ ...base, actorId: 'engineer-1', actorRole: 'ENGINEER' }), true);
  assert.equal(canAccessBookingMessages({ ...base, actorId: 'engineer-2', actorRole: 'ENGINEER' }), false);
  assert.equal(canAccessBookingMessages({ ...base, actorId: 'admin-1', actorRole: 'STUDIO_ADMIN', actorStudioId: 'studio-1' }), true);
  assert.equal(canAccessBookingMessages({ ...base, actorId: 'admin-2', actorRole: 'STUDIO_ADMIN', actorStudioId: 'studio-2' }), false);
  assert.equal(canAccessBookingMessages({ ...base, actorId: 'producer-1', actorRole: 'PRODUCER' }), false);
  assert.equal(canAccessBookingMessages({ ...base, actorId: 'root', actorRole: 'OIANO_ADMIN' }), true);
});
