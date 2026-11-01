**Professional onboarding now accepts participants' own creative practice labels through the existing profile contract.**

The existing profile API already accepts up to six discipline strings, each up to
60 characters. The onboarding screen offered only fixed suggestions, and the
display helper replaced every unfamiliar label with "Creative professional."
Participants can now add their own words, choose a primary label, and remove
labels while keeping at least one. Existing authored labels remain selectable on
revisit. Suggestions keep their existing API identifiers.

Blank, duplicate (case-insensitive label or identifier), oversized and over-limit
additions show explicit errors. Enter adds a label without saving the profile.
Known display labels are unchanged; authored labels display faithfully rather
than being reclassified. Practice labels remain separate from permissions and
project roles.

This is an additive improvement, not a replacement identity model. No schema,
authentication, authorization, financial logic or migration gate changed.

## Evidence

- Before implementation, the four new onboarding regressions failed: authored
  display, adding/saving, validation and revisiting/removing custom labels.
- After implementation, focused onboarding and entry tests passed (37 tests at
  that stage).
- Additional coverage verifies keyboard addition using a suggested identifier,
  duplicate identifiers, the final-label invariant, primary fallback and the
  exact 60-character limit.
- The full suite exposed an existing assertion that unknown labels must be
  discarded. Updated that assertion to the intentional authored-label contract,
  retaining neutral fallback coverage for absent/blank values.
- Final web suite: 26 files, 239 tests passed.
- Web typecheck and production web build passed.
- Repository secrets scan passed across 594 tracked files; whitespace check passed.

## Not exercised

No live browser session or database-backed profile round trip was run for this
increment. Save/refresh and invitation-return behavior are covered with mocked
API responses. No production operation was performed.

## Observed, not changed

Signup still uses its existing role and suggested-discipline contract. This
increment applies to professional onboarding and display, not universal account
or organization onboarding. Existing initialization of services, location and
biography on onboarding revisit was not expanded into profile editing.
Canonical identity/organization migration remains gated separately.
