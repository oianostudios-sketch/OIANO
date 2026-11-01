**T04 studio/booking browser rehearsal is blocked on local API readiness; no new journey is marked passed.**

Continued from `faf63a9` on `chore/reviewed-local-checkpoint`. Inspected the
existing artist attachment integration tests, booking message route, studio
membership/switching route and related web pages. Existing automated evidence was
not rerun. No product, dependency, schema, permission or financial change was made.

## Evidence

| Check | Result |
|---|---|
| Local runner | Started `npm run dev:local` twice using a generated VS Code task |
| Database safeguard | Runner identified `oiano_dev_test` at loopback port 55432; guarded fixture setup independently checked the database name and PostgreSQL data directory against this checkout's `.oiano/postgres` |
| Migrations | Both attempts reported 21 migrations and none pending |
| Web | Vite started and the entry page rendered; an early navigation timed out before rendering |
| API health | Browser probes received `ERR_CONNECTION_REFUSED`; both bounded PowerShell readiness checks exited 1, the second with an explicit 120-second deadline |
| API logs | Reached the ts-node-dev startup line without a captured exception. The first attempt's later transcript also contained the API startup banner, but no successful health response was observed before cleanup. A banner alone is not a readiness pass |
| Recovery attempt | Stopped the verified stalled API child, then stopped only its runner tree and retried the supported local runner once; the second health deadline also failed |
| Rehearsal | **Not run**: no authenticated studio switching, booking messages or attach/detach browser result is claimed |
| Replay source | Guarded fixture script and browser replay assertions syntax-checked with `node --check`, exit 0; syntax success is not runtime verification |

This is a local startup/readiness blocker, not evidence that production is down or
that a product code change caused the failure. The root cause is not established.
Do not attribute it to PostgreSQL, a dependency or resource pressure without
further evidence. Preserve the previously successful contributor-browser
[checkpoint](2026-10-27-contributor-browser-rehearsal.md).

## Fixture and cleanup

Created unique synthetic fixtures only in the checkout-local test database:
three studios, two Artist accounts, a project lead, two staff accounts, three
zero-value confirmed booking fixtures and an artist-named project. These were
direct test fixtures following integration-test setup, **not** a booking/payment
flow or evidence of money readiness. No payment, wallet, ledger, refund or
settlement was initiated. The multi-studio staff fixture had an explicit
non-management capability array; no real user received privileges.

Cleanup archived the fixture project, detached the fixture bookings, randomized
all five fixture password hashes and incremented their authentication versions.
The transient fixture manifest was removed. Synthetic rows remain local; no
immutable audit records were deleted. No browser fixture tokens were saved,
because readiness failed before login setup.

Stopped the exact task-owned process trees and removed only the generated task
definition. Pre-existing PostgreSQL, VS Code settings, unrelated documentation
and PR #54's original branch were left alone. No push, deployment, production
connection, network-exposure change or participant contact occurred.

## Next bounded work

Diagnose startup under the supported local runner with bounded, timestamped
readiness evidence and task-owned process inspection. Reuse existing build/test
evidence; do not reinstall dependencies or change product code speculatively.
Only resume the prepared studio-scope, attach/detach and booking-message
scenarios once the actual API health endpoint returns 200.

Physical phone remains explicitly deferred. T04, intake, production parity and
operational acceptance remain open.
