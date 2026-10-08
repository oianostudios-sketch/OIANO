// From source: the web build on Render does not build packages/shared first.
import { isSignupPlaceholderName } from '../../../../packages/shared/src/placeholderNames';

/**
 * The name a greeting may use: the person's own alias or name, or nothing.
 * Never part of their email address, which is not a name and may be shown on a shared screen,
 * and never the placeholder signup stores when no name was given ("New artist").
 */
export function greetingName(person?: { alias?: string | null; name?: string | null } | null): string | null {
  const own = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed && !isSignupPlaceholderName(trimmed) ? trimmed : null;
  };
  return own(person?.alias) ?? own(person?.name);
}
