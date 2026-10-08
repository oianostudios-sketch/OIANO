// packages/shared/src/placeholderNames.ts
//
// A name is public: it shows on the profile, in discovery and on the passport. When
// the person gave none at signup, the account carries one of these until onboarding
// asks for a real one. Never derive a name from the email; that publishes part of a
// private address. Screens that address the person (a greeting, a name field) treat
// these as no name at all.
//
// Plain data with no imports, so the web app can import this file from source.
export const SIGNUP_PLACEHOLDER_NAMES = {
  ARTIST: 'New artist',
  PRODUCER: 'New creative professional',
  STUDIO_ADMIN: 'New studio operator',
} as const;

const PLACEHOLDERS: readonly string[] = Object.values(SIGNUP_PLACEHOLDER_NAMES);

/** True when the name is one signup stored because the person gave none. */
export function isSignupPlaceholderName(name: string | null | undefined): boolean {
  return name != null && PLACEHOLDERS.includes(name.trim());
}
