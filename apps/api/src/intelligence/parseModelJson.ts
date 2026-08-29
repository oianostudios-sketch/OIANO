// apps/api/src/intelligence/parseModelJson.ts
// Shared by every capability: models sometimes wrap JSON in markdown fencing
// or a sentence of preamble despite instructions not to — this extracts the
// first {...} block rather than requiring an exact-match response. Still
// fails (throws) on anything that isn't valid JSON; the caller is always
// responsible for then running it through that capability's own Zod schema.

export function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in model output');
  return JSON.parse(match[0]);
}
