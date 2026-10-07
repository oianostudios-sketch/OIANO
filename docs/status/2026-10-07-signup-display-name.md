**A new account's public name never comes from its email address, 2026-10-07.** Account
creation named a new artist or creative professional after the part of their email before
the `@` whenever no name was sent (`auth.controller.ts`), and that name is public: the
artist profile, artist discovery, producer discovery and the public passport all show it.
The web signup form had no name field, so every account created through it was named this
way, and `/api/auth/enter` always was.

- **What changed.** Two API paths derived the name from the email: `signup` when no name
  (or a blank one) was given, and `enter` always. Both now use a neutral placeholder,
  `New artist`, `New creative professional` or `New studio operator`, that contains nothing
  from the email. A name that was typed is kept, trimmed. The signup form gains an optional
  name field and sends it when filled. Artist onboarding already starts its "What should the
  world call you?" field empty; professional onboarding now starts empty instead of showing
  the placeholder, so its required name field asks for a real one. Admin walk-ins, studio
  registration and producer profile creation already took the name they were given.
- **Evidence.** `signup-display-name.integration.test.ts` signs up through the real routes:
  an artist and a professional who typed a name keep it (and the artist is published under
  it on profile, discovery and passport); signup without a name, with a blank name, and the
  unified entry produce `New artist`, and none of the profile, discovery entry or public
  passport contains the email's local part; a professional without a name is listed in
  producer discovery without it. With the email-derived names put back, the four nameless
  cases fail (the name equals the local part); restored from backup, confirmed with `cmp`.
  Integration 159 tests on a fresh database; API unit 102, intelligence 31, web suite, both
  typechecks, the build and the secret scan pass.
- **Not changed.** Existing accounts keep their names; there is no backfill, so accounts
  already named after their email stay that way until the person renames themselves. The
  artist dashboard's greeting still falls back to the email's local part when an artist has
  neither alias nor name; it is shown only to that person and, with every account now
  given a name, is not reached by new accounts.
