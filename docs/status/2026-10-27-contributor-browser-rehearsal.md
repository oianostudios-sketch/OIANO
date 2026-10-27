**T04 contributor messaging now has separate-account browser evidence for T02/IR-01 and T03/IR-02; phone and wider T04 acceptance remain open.**

Continued from `bf8caf2` on `chore/reviewed-local-checkpoint`. Used the existing
`npm run dev:local` runner against this checkout's `oiano_dev_test` database at
loopback port 55432, with external integrations disabled. API health returned 200
and the local web entry rendered. No production service or real participant was
contacted.

No product defect was reproduced in these scenarios, so no product code, access
policy, schema, money behavior or dependency was changed. This record supplements
[batch 1 evidence](2026-10-27-conversation-reliability.md) and
[T09 evidence](2026-10-27-invitation-return-continuity.md); it does not replace
their automated results or close the release gates.

## Evidence

Three synthetic professional accounts were created through the actual API: a
lead, an accepted contributor and an unrelated account. The lead created a unique
project and invitation; the contributor claimed and accepted it. Separate,
non-persistent browser contexts signed in through the real entry page.

| Browser scenario | Observed result |
|---|---|
| Live exchange | Lead's message appeared in the contributor workspace without refresh; contributor's reply appeared in the lead workspace without refresh |
| Persistence | Reload retained the reply; API readback contained each live/reconnect message exactly once |
| Disconnect recovery | Contributor context went offline; its observed EventSource was explicitly closed and an error dispatched to trigger reconnect. A lead message saved during the interruption was absent offline and appeared after reconnect, with a replacement stream |
| Initial GET outage | Injected 503 responses produced the explicit load error, not the empty-conversation copy; Try again recovered actual saved history |
| Cached GET outage | Injected 503 responses after a synthetic refresh event produced the refresh error while retaining previously loaded history; retry recovered |
| POST outage | One injected 503 produced the send error and retained the exact draft; retry cleared it only after success, with exactly one saved copy after reload |
| Removal while open | Contributor first received a live message. After removal, both the removed contributor and unrelated account received no new project-message event during a two-second observation per open stream |
| Access boundaries | Removed/unrelated GET messages, POST message and workspace requests each returned 404; the removed account's reloaded workspace showed Workspace unavailable; anonymous message GET returned 401 |
| Owner persistence | The post-removal message was saved once and remained readable to the lead |

These are interactive Playwright assertions against the actual local API, not a
CLI E2E suite. All three scenarios returned successful structured results; there
is **no E2E process exit code** to report. Deliberate 503s, refresh-event injection
and forced EventSource interruption are fault injection, not evidence of a
naturally flaky mobile network. Finite negative observation is not a guarantee
that a stream can never receive an event; prior integration tests provide
complementary audience coverage.

Existing verified automated evidence was reused, not rerun: 264 integration tests
from the checkpoint; 180 web tests and the web typecheck/build from T09. No
mutation check was needed because no new product assertion or fix was added to
the repository. Replay modules and a detailed report are retained in the session
artifacts; the modules were syntax-checked, but their assembled module runner was
not executed as a CLI suite.

## Cleanup

All isolated browser contexts were closed. The synthetic project was archived
through its owner's API; the list readback confirmed `is_active: false`.
Synthetic accounts and archived history remain only in the checkout-local test
database. Temporary fixture credentials were cleared from browser session storage.
The T04 API/web process tree and generated local task definition were removed;
the pre-existing PostgreSQL cluster and local VS Code settings were left alone.

## Not exercised

- Physical phone/touch, explicitly deferred by the owner at T09.
- Booking-message browser behavior, multiple studio memberships and cross-studio
  booking/project attachment and detachment: T04 remains partial.
- Decline/correction UI, expired-session UX, recovery-mail delivery, real proxy
  behavior or real mobile-network interruption.
- Production parity/configuration, deployment, backup restore, storage, mail,
  payment readiness, or real participant onboarding.

## Next bounded work

Rehearse existing artist/staff studio scope and booking attachment/detachment in
separate local browser sessions, with save/reload and refusal evidence. Do not
change money flows or grant capabilities to make the rehearsal pass. Keep phone,
intake and operator gates separately visible.
