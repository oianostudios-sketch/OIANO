import assert from 'node:assert/strict';
import test from 'node:test';
import { initSentry, captureError } from './sentry';

test('without SENTRY_DSN, init is a no-op and capture never throws', () => {
  const previous = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  try {
    initSentry();
    assert.doesNotThrow(() => captureError(new Error('should be swallowed silently')));
  } finally {
    if (previous === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previous;
  }
});
