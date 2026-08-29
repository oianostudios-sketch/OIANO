import assert from 'node:assert/strict';
import test from 'node:test';
import { getNavigationRecommendation } from './navigation';
import { NavigationContext } from '../context/context-builder';
import { IntelligenceProvider, GenerateArgs } from '../providers/provider.interface';
import { IntelligenceTimeoutError } from '../providers/claude.provider';

const SAMPLE_CONTEXT: NavigationContext = {
  role: 'STUDIO_ADMIN',
  pendingBookings: 3,
  todaySessionsRemaining: 2,
  pendingReviewDeliverables: 4,
  draftCredits: 1,
  overduePayments: 0,
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

const ENABLED = { OIANO_AI_ENABLED: 'true', OIANO_AI_NAVIGATION: 'true' };

test('AI completely disabled: capability flag off returns disabled, provider never called', async () => {
  await withEnv({ OIANO_AI_ENABLED: 'false', OIANO_AI_NAVIGATION: 'true' }, async () => {
    let called = false;
    const provider = fakeProvider(async () => { called = true; return '{}'; });
    const result = await getNavigationRecommendation(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'disabled' });
    assert.equal(called, false);
  });
});

test('provider timeout fails safe', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => { throw new IntelligenceTimeoutError(); });
    const result = await getNavigationRecommendation(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'timeout' });
  });
});

test('a destination outside the allowlist is rejected as invalid, never surfaced — this is the core "AI ranks, never invents access" guarantee', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'NAVIGATION_INTELLIGENCE',
      destinations: [{ destinationId: 'secret-admin-panel', reason: 'made up destination', priority: 1 }],
      confidence: 0.9,
    }));
    const result = await getNavigationRecommendation(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'invalid_response' });
  });
});

test('a valid destination from the real allowlist is accepted', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'NAVIGATION_INTELLIGENCE',
      destinations: [
        { destinationId: 'runsheet', reason: '4 deliverables are pending review today', priority: 1 },
        { destinationId: 'pulse', reason: 'Live studio activity worth checking', priority: 2 },
      ],
      confidence: 0.82,
    }));
    const result = await getNavigationRecommendation(SAMPLE_CONTEXT, provider);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.destinations[0].destinationId, 'runsheet');
      assert.equal(result.data.destinations.length, 2);
    }
  });
});

test('more than 3 destinations is rejected — V1 caps ranking, does not rank the entire nav', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'NAVIGATION_INTELLIGENCE',
      confidence: 0.9,
      destinations: [
        { destinationId: 'runsheet', reason: 'a', priority: 1 },
        { destinationId: 'pulse', reason: 'b', priority: 2 },
        { destinationId: 'calendar', reason: 'c', priority: 3 },
        { destinationId: 'admin', reason: 'd', priority: 4 },
      ],
    }));
    const result = await getNavigationRecommendation(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'invalid_response' });
  });
});

test('low confidence is treated as no recommendation', async () => {
  await withEnv(ENABLED, async () => {
    const provider = fakeProvider(async () => JSON.stringify({
      type: 'NAVIGATION_INTELLIGENCE',
      destinations: [{ destinationId: 'book', reason: 'weak signal', priority: 1 }],
      confidence: 0.3,
    }));
    const result = await getNavigationRecommendation(SAMPLE_CONTEXT, provider);
    assert.deepEqual(result, { ok: false, reason: 'low_confidence' });
  });
});
