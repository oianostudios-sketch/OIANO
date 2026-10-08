/**
 * The name a greeting may use: the person's own alias or name, or nothing.
 * Never part of their email address, which is not a name and may be shown on a shared screen.
 */
export function greetingName(person?: { alias?: string | null; name?: string | null } | null): string | null {
  return person?.alias?.trim() || person?.name?.trim() || null;
}
