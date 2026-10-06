import assert from 'node:assert/strict';
import test from 'node:test';
import { hashInvitationToken, newContributionInvitation, nextContributionStatus, participantBelongsToUser } from './contributionInvitation';

test('only an invited contribution can transition through a recipient decision', () => {
  assert.equal(nextContributionStatus('INVITED', 'ACCEPT'), 'ACTIVE');
  assert.equal(nextContributionStatus('INVITED', 'DECLINE'), 'DECLINED');
  assert.equal(nextContributionStatus('INVITED', 'REQUEST_CORRECTION'), 'CORRECTION_REQUESTED');
  assert.equal(nextContributionStatus('ACTIVE', 'DECLINE'), null);
  assert.equal(nextContributionStatus('REMOVED', 'ACCEPT'), null);
});

test('an invitation belongs only to the identity that claimed it, never to an account at its email', () => {
  assert.equal(participantBelongsToUser({ participant_ref_id: 'user-1' }, 'user-1'), true);
  assert.equal(participantBelongsToUser({ participant_ref_id: 'user-2' }, 'user-1'), false);
  const unclaimedAtTheirAddress = { participant_ref_id: null, email: 'creator@example.com' };
  assert.equal(participantBelongsToUser(unclaimedAtTheirAddress, 'user-1'), false);
});

test('an invitation link is new every time, kept only as its SHA-256, and expires', () => {
  const now = new Date('2026-09-14T12:00:00Z');
  const first = newContributionInvitation(now);
  const second = newContributionInvitation(now);
  assert.notEqual(first.token, second.token);
  assert.ok(first.token.length >= 43, 'the token carries 32 random bytes');
  assert.match(first.token_hash, /^[0-9a-f]{64}$/);
  assert.equal(first.token_hash, hashInvitationToken(first.token));
  assert.notEqual(first.token_hash, first.token);
  assert.equal(first.expires_at.getTime() - now.getTime(), 14 * 86_400_000);
});
