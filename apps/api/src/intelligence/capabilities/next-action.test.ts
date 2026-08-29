import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextAction } from './next-action';
import { NextActionContext } from '../context/context-builder';
import { IntelligenceProvider, GenerateArgs } from '../providers/provider.interface';
import { IntelligenceTimeoutError, IntelligenceProviderError } from '../providers/claude.provider';

const SAMPLE_CONTEXT: NextActionContext = {
  bookingId: 'booking-1',
  status: 'COMPLETED',
  hoursSinceEnd: 3,
  paymentStatus: 'PAID',
  hasSessionNotes: true,
  qualityRating: 4,
  deliverableCount: 2,
  pendingReviewDeliverables: 1,
  hasProject: true,
  draftCredits: 2,
  confirmedCredits: 0,
  proposedRights: 0,
};

function fakeProvider(behavior: (args: GenerateArgs) => Promise<string>): IntelligenceProvider {
  return { generate: behavior };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('AI completely disabled: capability flag off returns disabled, provider never called', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'false', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    let called = false;
    const provider = fakeProvider(async () => { called = true; return '{}'; });
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'disabled' });
    assert.equal(called, false, 'provider must not be invoked when the flag is off');
  });
});

test('master flag off overrides an on sub-flag', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'false', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    const provider = fakeProvider(async () => '{}');
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.equal(result.ok, false);
  });
});

test('provider unavailable: network/HTTP failure fails safe, does not throw', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'true', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    const provider = fakeProvider(async () => { throw new IntelligenceProviderError('Anthropic API returned 500'); });
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  });
});

test('provider timeout fails safe with a distinct reason from generic unavailability', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'true', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    const provider = fakeProvider(async () => { throw new IntelligenceTimeoutError(); });
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'timeout' });
  });
});

test('invalid model response (not JSON) fails safe, never reaches application logic', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'true', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    const provider = fakeProvider(async () => 'Sure, here is my suggestion: review the session.');
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'invalid_response' });
  });
});

test('invalid model response (JSON but wrong shape) fails safe', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'true', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    const provider = fakeProvider(async () => JSON.stringify({ type: 'NEXT_ACTION', label: 'x' })); // missing required fields
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'invalid_response' });
  });
});

test('low-confidence response is treated as no suggestion, not shown', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'true', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'NEXT_ACTION', label: 'Review session', reason: 'Maybe', confidence: 0.2,
      entityType: 'booking', entityId: 'booking-1',
    }));
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'low_confidence' });
  });
});

test('successful next-action suggestion round-trips through validation intact', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'true', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'NEXT_ACTION',
      label: 'Confirm credits',
      reason: 'Session completed and 2 credits are still in draft.',
      confidence: 0.91,
      entityType: 'booking',
      entityId: 'booking-1',
    }));
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.label, 'Confirm credits');
      assert.equal(result.data.entityId, 'booking-1');
      assert.equal(result.data.confidence, 0.91);
    }
  });
});

test('a model response wrapped in markdown fencing is still extracted and validated', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'true', OIANO_AI_NEXT_ACTION: 'true' }, async () => {
    const provider = fakeProvider(async () => '```json\n' + JSON.stringify({
      type: 'NEXT_ACTION', label: 'Review session', reason: 'Ready for review.', confidence: 0.8,
      entityType: 'booking', entityId: 'booking-1',
    }) + '\n```');
    const result = await getNextAction(SAMPLE_CONTEXT, provider);
    assert.equal(result.ok, true);
  });
});
