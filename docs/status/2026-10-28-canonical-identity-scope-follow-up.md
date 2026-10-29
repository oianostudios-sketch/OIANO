**The canonical identity-scope P2 follow-up is covered by real Artist-route and partial-scope regressions on PR39.**

This supersedes the earlier [scope repair record](./2026-10-27-canonical-identity-scope.md).
The prior record did not cover a multi-profile account through the real routes or
the requested scope combinations. No resolver or route behavior changed in this
follow-up; the work adds integration assertions while preserving PR39 discipline
mirroring.

The route regression signs up an Artist with the genuine Artist session token,
creates a Producer sibling directly through Prisma, establishes the two-profile
baseline once, then calls the real profile, portfolio and status PATCH routes.
After each request it checks both profiles, owner links, handles and creation
times; the unchanged Producer row is compared in full; Person naming is checked
from the signup placeholder through the named Producer fallback and subsequent
Artist name; discipline codes, primary flags and link timestamps remain stable;
and full identity parity must remain clean.

Backfill regressions cover mixed user/legacy-id union scopes with duplicates,
missing IDs and a control Person; linked Engineer deletion with a surviving
Producer; an unclaimed Person retained by a canonical-only profile; owner
movement with stable sibling/control rows and surviving discipline-link
timestamps; idempotent repeats after completed mutations; and scoped collision/
source-mismatch aborts before canonical writes. The linked-Engineer-to-unclaimed
transition remains unsupported by this repair, as noted in the review.

**Evidence**

| Check | Result |
|---|---|
| Focused identity integration files on a fresh checkout-local test database | `30/30` passed; exit 0 |
| API typecheck | exit 0 |
| `git diff --check` | exit 0 |
| Original-resolver negative control | expected real-route regression failed; process exit 1; repaired source restored with matching SHA-256 |
| Full local integration suite before the final assertion correction | `288/290` passed; the identity assertion had the then-incorrect primary-discipline expectation |
| Full local integration suite after correction | Not run |

Secret-redacted command output, summaries and source hashes are saved in the
session evidence files. No shared or production database, external service,
commit, merge or push was used.

**Not exercised:** the full post-fix integration suite, concurrent runtime
reconciliation, production data, or the linked-Engineer-to-unclaimed transition.
