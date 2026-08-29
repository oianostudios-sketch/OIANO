// apps/api/src/intelligence/providers/claude.provider.ts
// The only provider implementation in V1. Deliberately parallel to, not a
// replacement for, services/ai-summary.service.ts — that file stays exactly
// as it is (see the Stage 1 audit). This is the properly-governed path new
// capabilities use: hard timeout, no key ever leaves the server, structured
// failure instead of an unhandled rejection.

import { getAnthropicApiKey, AI_MODEL, AI_TIMEOUT_MS, AI_MAX_TOKENS } from '../config';
import { GenerateArgs, IntelligenceProvider } from './provider.interface';

export class IntelligenceTimeoutError extends Error {
  constructor() { super('Intelligence provider timed out'); this.name = 'IntelligenceTimeoutError'; }
}

export class IntelligenceProviderError extends Error {
  constructor(message: string) { super(message); this.name = 'IntelligenceProviderError'; }
}

type AnthropicMessageResponse = { content?: Array<{ text?: string }> };

export class ClaudeProvider implements IntelligenceProvider {
  // Configurable only so tests can use a short timeout instead of waiting
  // out the real 8s production value — defaults to it otherwise.
  constructor(private readonly timeoutMs: number = AI_TIMEOUT_MS) {}

  async generate({ systemPrompt, userPrompt, maxTokens }: GenerateArgs): Promise<string> {
    const apiKey = getAnthropicApiKey();
    if (!apiKey) throw new IntelligenceProviderError('ANTHROPIC_API_KEY not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: maxTokens ?? AI_MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!response.ok) {
        throw new IntelligenceProviderError(`Anthropic API returned ${response.status}`);
      }

      const data = (await response.json()) as AnthropicMessageResponse;
      const text = data.content?.[0]?.text;
      if (!text) throw new IntelligenceProviderError('Empty response from provider');
      return text;
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new IntelligenceTimeoutError();
      if (err instanceof IntelligenceProviderError) throw err;
      throw new IntelligenceProviderError(err?.message ?? 'Unknown provider error');
    } finally {
      clearTimeout(timer);
    }
  }
}
