import assert from 'node:assert/strict';
import test from 'node:test';
import { nextContributionStatus, participantBelongsToUser } from './contributionInvitation';

test('only an invited contribution can transition through a recipient decision', () => {
  assert.equal(nextContributionStatus('INVITED', 'ACCEPT'), 'ACTIVE');
  assert.equal(nextContributionStatus('INVITED', 'DECLINE'), 'DECLINED');
  assert.equal(nextContributionStatus('INVITED', 'REQUEST_CORRECTION'), 'CORRECTION_REQUESTED');
  assert.equal(nextContributionStatus('ACTIVE', 'DECLINE'), null);
  assert.equal(nextContributionStatus('REMOVED', 'ACCEPT'), null);
});

test('an invitation belongs to either its linked identity or matching account email', () => {
  const user = { id: 'user-1', email: 'Creator@Example.com' };
  assert.equal(participantBelongsToUser({ participant_ref_id: 'user-1', email: null }, user), true);
  assert.equal(participantBelongsToUser({ participant_ref_id: null, email: 'creator@example.com' }, user), true);
  assert.equal(participantBelongsToUser({ participant_ref_id: 'user-2', email: 'other@example.com' }, user), false);
});
