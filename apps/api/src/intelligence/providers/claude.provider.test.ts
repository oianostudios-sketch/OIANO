import assert from 'node:assert/strict';
import test from 'node:test';
import { ClaudeProvider, IntelligenceTimeoutError, IntelligenceProviderError } from './claude.provider';

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

test('missing ANTHROPIC_API_KEY fails safe instead of calling the network', async () => {
  await withEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
    const provider = new ClaudeProvider();
    await assert.rejects(
      () => provider.generate({ systemPrompt: 's', userPrompt: 'u' }),
      IntelligenceProviderError,
    );
  });
});

test('a slow provider is aborted at the configured timeout, not left hanging', async () => {
  await withEnv({ ANTHROPIC_API_KEY: 'test-key' }, async () => {
    const originalFetch = globalThis.fetch;
    // Never resolves on its own — only the AbortController should end this.
    globalThis.fetch = ((_url: any, init: any) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as any;

    try {
      const provider = new ClaudeProvider(50); // 50ms instead of the real 8s
      await assert.rejects(
        () => provider.generate({ systemPrompt: 's', userPrompt: 'u' }),
        IntelligenceTimeoutError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('a non-OK HTTP response fails safe as a provider error, not a thrown JSON parse error', async () => {
  await withEnv({ ANTHROPIC_API_KEY: 'test-key' }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('Internal Server Error', { status: 500 })) as any;
    try {
      const provider = new ClaudeProvider();
      await assert.rejects(
        () => provider.generate({ systemPrompt: 's', userPrompt: 'u' }),
        IntelligenceProviderError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
