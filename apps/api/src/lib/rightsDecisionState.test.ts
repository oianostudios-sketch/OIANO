import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agreementStatusFromDecisions,
  PROMOTIONAL_CONSENT_APPROVED,
  RIGHTS_AGREEMENT_APPROVED,
} from './rightsDecisionState';
import { isConsentTransitionAllowed, isRightsTransitionAllowed } from './resourceAuthorization';

test('rights remain proposed until every named holder approves', () => {
  assert.equal(agreementStatusFromDecisions([{ status: 'APPROVED' }, { status: 'PENDING' }]), 'PROPOSED');
  assert.equal(agreementStatusFromDecisions([{ status: 'APPROVED' }, { status: 'APPROVED' }]), 'APPROVED');
});

test('one holder dispute prevents an agreement becoming effective', () => {
  assert.equal(agreementStatusFromDecisions([{ status: 'APPROVED' }, { status: 'DISPUTED' }]), 'DISPUTED');
});

test('a settled agreement never reports the unrelated ACCEPTED vocabulary', () => {
  // Network counters once queried rights and consent for 'ACCEPTED'. Nothing
  // writes it: these are approval lifecycles, and ACCEPTED belongs to the
  // circle-consent, connection-request and staff-invitation models instead.
  const settled = agreementStatusFromDecisions([{ status: 'APPROVED' }, { status: 'APPROVED' }]);
  assert.equal(settled, RIGHTS_AGREEMENT_APPROVED);
  assert.notEqual(settled as string, 'ACCEPTED');
});

test('consent and rights share one approval vocabulary', () => {
  assert.equal(PROMOTIONAL_CONSENT_APPROVED, RIGHTS_AGREEMENT_APPROVED);
  // Guards in resourceAuthorization.ts key off exactly these values, so a
  // consent may only be withdrawn from the approved state.
  assert.equal(isConsentTransitionAllowed(PROMOTIONAL_CONSENT_APPROVED, 'WITHDRAW'), true);
  assert.equal(isConsentTransitionAllowed('ACCEPTED', 'WITHDRAW'), false);
  assert.equal(isRightsTransitionAllowed('PROPOSED', 'APPROVE'), true);
  assert.equal(isRightsTransitionAllowed(RIGHTS_AGREEMENT_APPROVED, 'APPROVE'), false);
});
