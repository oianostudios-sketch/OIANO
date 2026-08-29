// apps/api/src/intelligence/providers/provider.interface.ts
// Every capability talks to this interface, never to a specific vendor SDK or
// fetch call directly. Swapping or adding a provider means implementing this
// interface once — no capability code changes.

export interface GenerateArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface IntelligenceProvider {
  // Returns raw model text. Schema validation happens in the capability layer,
  // not here — the provider knows nothing about any capability's shape.
  generate(args: GenerateArgs): Promise<string>;
}
