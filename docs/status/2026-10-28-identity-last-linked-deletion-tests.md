**The last-linked Engineer profile deletion regression now verifies Person retention and discipline cleanup on PR39.**

This supersedes the [identity-scope follow-up record](./2026-10-28-canonical-identity-scope-follow-up.md).
The prior test follow-up covered deletion with a surviving sibling and removal
of an unclaimed Person, but not deletion of a linked user's final legacy
profile. The new case confirms reconciliation removes that profile and its
Engineer discipline while retaining the Person for the still-existing login,
clears the obsolete display name, preserves the Person id and creation time,
and is a no-op on repeat. PR39 has no duplicate scoped-abort test.

No resolver or route behavior changed in this follow-up. The
linked-Engineer-to-unclaimed transition remains outside its scope.

**Evidence**

| Check | Result |
|---|---|
| `npm run test:integration:local` | `291/291` passed; exit 0; 2026-10-28 23:12:07–23:39:51 +02:00 |
| `npm run typecheck --workspace=apps/api` | exit 0 |
| `git diff --check` | exit 0 |
| Full-suite report | Saved as `identity-followup-pr39-full-suite.txt` in session evidence |

The integration runner used a fresh database in this worktree's local
PostgreSQL cluster. Stripe, email, AI, R2 and Sentry credentials were blanked
for the run; no shared or production database was used.

**Not exercised:** the linked-Engineer-to-unclaimed transition, production
data, or live migrations. No source resolver change, commit or push was made.
