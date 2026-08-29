import assert from 'node:assert/strict';
import test from 'node:test';
import { agreementStatusFromDecisions } from './rightsDecisionState';

test('rights remain proposed until every named holder approves', () => {
  assert.equal(agreementStatusFromDecisions([{ status: 'APPROVED' }, { status: 'PENDING' }]), 'PROPOSED');
  assert.equal(agreementStatusFromDecisions([{ status: 'APPROVED' }, { status: 'APPROVED' }]), 'APPROVED');
});

test('one holder dispute prevents an agreement becoming effective', () => {
  assert.equal(agreementStatusFromDecisions([{ status: 'APPROVED' }, { status: 'DISPUTED' }]), 'DISPUTED');
});
