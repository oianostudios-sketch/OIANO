import assert from 'node:assert/strict';
import test from 'node:test';
import { canApprovePolicyException, evaluateStudioPolicies, policiesAffectedByChanges, type PolicyContract } from './studioPolicyEngine';

const depositPolicy: PolicyContract = {
  id: 'deposit-1', domain: 'PAYMENT', subject: 'RECORDING_BOOKING', name: 'Standard deposit',
  enforcement: 'CONTROLLED', override_capability: 'WAIVE_DEPOSIT',
  conditions: { all: [{ field: 'service.category', operator: 'EQ', value: 'RECORDING' }] },
  default_outcome: {
    requirements: [{ field: 'payment.deposit_percent', operator: 'GTE', value: 50 }],
    consequence: { outstanding_balance: true },
  },
};

test('a booking inside the studio default proceeds without an exception', () => {
  const [decision] = evaluateStudioPolicies([depositPolicy], { service: { category: 'RECORDING' } }, { payment: { deposit_percent: 50 } });
  assert.equal(decision.result, 'COMPLIANT');
  assert.equal(decision.failed_requirements.length, 0);
});

test('a controlled rule explains the override and consequence instead of hard-blocking', () => {
  const [decision] = evaluateStudioPolicies([depositPolicy], { service: { category: 'RECORDING' } }, { payment: { deposit_percent: 0 } });
  assert.equal(decision.result, 'OVERRIDE_REQUIRED');
  assert.equal(decision.required_capability, 'WAIVE_DEPOSIT');
  assert.deepEqual(decision.consequence, { outstanding_balance: true });
});

test('hard boundaries cannot be converted into manager overrides', () => {
  const hard = { ...depositPolicy, enforcement: 'HARD' as const };
  assert.equal(evaluateStudioPolicies([hard], { service: { category: 'RECORDING' } }, { payment: { deposit_percent: 0 } })[0].result, 'DENIED');
});

test('approval requires the precise capability or global override authority', () => {
  assert.equal(canApprovePolicyException(['WAIVE_DEPOSIT'], 'WAIVE_DEPOSIT'), true);
  assert.equal(canApprovePolicyException(['CHANGE_PRICE'], 'WAIVE_DEPOSIT'), false);
  assert.equal(canApprovePolicyException(['POLICY_OVERRIDE_ALL'], 'WAIVE_DEPOSIT'), true);
});

test('a reschedule only re-evaluates scheduling rules, not settled payment rules', () => {
  const closingTime: PolicyContract = {
    ...depositPolicy,
    id: 'hours-1',
    domain: 'BOOKING',
    subject: 'CLOSING_TIME',
    name: 'Closing time',
    default_outcome: { requirements: [{ field: 'booking.end_hour', operator: 'LTE', value: 23 }] },
  };
  assert.deepEqual(policiesAffectedByChanges([depositPolicy, closingTime], ['booking']).map(policy => policy.id), ['hours-1']);
});
