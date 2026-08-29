import assert from 'node:assert/strict';
import test from 'node:test';
import { getSessionSummary } from './session-summary';
import { SessionSummaryContext } from '../context/context-builder';
import { IntelligenceProvider, GenerateArgs } from '../providers/provider.interface';
import { IntelligenceTimeoutError, IntelligenceProviderError } from '../providers/claude.provider';

const SAMPLE_CONTEXT: SessionSummaryContext = {
  bookingId: 'booking-1',
  status: 'COMPLETED',
  serviceName: 'Recording Session',
  roomName: 'Main Studio',
  durationHours: 2.5,
  paymentStatus: 'PAID',
  qualityRating: 5,
  tracksWorked: ['Track 1', 'Track 2'],
  deliverableCount: 2,
  approvedDeliverables: 1,
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

const ENABLED = { OIANO_AI_ENABLED: 'true', OIANO_AI_SESSION_SUMMARY: 'true' };

test('AI completely disabled: capability flag off returns disabled, provider never called', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'false', OIANO_AI_SESSION_SUMMARY: 'true' }, async () => {
    let called = false;
    const provider = fakeProvider(async () => { called = true; return '{}'; });
    const result = await getSessionSummary(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'disabled' });
    assert.equal(called, false);
  });
});

test('provider unavailable fails safe', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => { throw new IntelligenceProviderError('Anthropic API returned 500'); });
    const result = await getSessionSummary(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  });
});

test('provider timeout fails safe with its own reason', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => { throw new IntelligenceTimeoutError(); });
    const result = await getSessionSummary(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'timeout' });
  });
});

test('invalid model response fails safe', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => 'not json at all');
    const result = await getSessionSummary(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'invalid_response' });
  });
});

test('a response that states an inference in knownFacts still passes schema — the separation is a prompt contract enforced by structure, not retroactively policed', async () => {
  // This test documents the actual guarantee: the SCHEMA enforces three
  // separate arrays exist, not that the model sorted correctly into them.
  // Given the model followed instructions, the frontend can trust the
  // bucket labels; the schema alone can't verify semantic correctness of
  // which bucket a given sentence landed in.
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'SESSION_SUMMARY',
      knownFacts: ['2 tracks were recorded', 'Payment is paid in full'],
      inferredInsights: ['Likely a productive session given the high quality rating'],
      suggestedFollowUp: ['Confirm the 2 draft credits'],
      confidence: 0.85,
      entityType: 'booking',
      entityId: 'booking-1',
    }));
    const result = await getSessionSummary(SAMPLE_CONTEXT, provider);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.knownFacts.length, 2);
      assert.equal(result.data.inferredInsights.length, 1);
      assert.match(result.data.inferredInsights[0], /^Likely/);
    }
  });
});

test('low confidence is treated as no suggestion', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'SESSION_SUMMARY', knownFacts: [], inferredInsights: [], suggestedFollowUp: [],
      confidence: 0.1, entityType: 'booking', entityId: 'booking-1',
    }));
    const result = await getSessionSummary(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'low_confidence' });
  });
});

test('successful summary with empty categories is valid — nothing to infer is a legitimate answer', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'SESSION_SUMMARY',
      knownFacts: ['Session completed, 2 tracks recorded'],
      inferredInsights: [],
      suggestedFollowUp: [],
      confidence: 0.7,
      entityType: 'booking',
      entityId: 'booking-1',
    }));
    const result = await getSessionSummary(SAMPLE_CONTEXT, provider);
    assert.equal(result.ok, true);
  });
});
