**The last-linked Engineer profile deletion regression now verifies Person retention on PR16; PR16's duplicate scoped-abort test has been removed.**

This supersedes the [identity-scope follow-up record](./2026-10-28-canonical-identity-scope-follow-up.md).
The prior test follow-up covered deletion with a surviving sibling and removal
of an unclaimed Person, but not deletion of a linked user's final legacy
profile. The new case confirms reconciliation removes that profile while
retaining the Person for the still-existing login, clears the obsolete display
name, preserves the Person id and creation time, and is a no-op on repeat.

The duplicate scoped collision/source-mismatch case has been removed from the
PR16 backfill test; one copy remains. No resolver or route behavior changed in
this follow-up. The linked-Engineer-to-unclaimed transition remains outside its
scope.

**Evidence**

| Check | Result |
|---|---|
| Focused identity backfill integration file on a fresh checkout-local database | `19/19` passed; exit 0 |
| `npm run test:integration:local` | `286/286` passed; exit 0; 2026-10-28 22:40:25–23:11:11 +02:00 |
| `npm run typecheck --workspace=apps/api` | exit 0 |
| `git diff --check` | exit 0 |
| Full-suite report | Saved as `identity-followup-pr16-full-suite.txt` in session evidence |

An earlier full-suite attempt exposed an assertion that incorrectly expected
`Person.updated_at` to remain unchanged while the deleted record's name was
recomputed, plus one transient transaction-wait connection failure. The
assertion now checks the stable Person id and creation time and the cleared
name. The focused run and final full suite passed; the transaction-wait test
passed in the final suite. Its earlier output is retained as
`identity-followup-pr16-full-suite-attempt-1.txt`.

The integration runner used a fresh database in this worktree's local
PostgreSQL cluster; no shared or production database was used. External service
credentials were absent, and the runner disabled Stripe, email and AI
integrations.

**Not exercised:** the linked-Engineer-to-unclaimed transition, production
data, or live migrations. No source resolver change, commit or push was made.
