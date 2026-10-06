**A restored facility issue is closed, and a studio cannot ask for Studio Circle consent
again once the artist has declined or withdrawn, 2026-10-06.** These are two owner
decisions made on 2026-10-06, settling the questions
[`2026-10-06-lifecycle-guards.md`](2026-10-06-lifecycle-guards.md) left open under
**Observed, not changed**.

- **Facility issues are terminal at RESTORED.** `PATCH /api/facilities/issues/:id` on a
  RESTORED issue now answers 409 for every target status, including a reassignment or a
  change of notes, and changes nothing: "This issue is restored and closed. Report a
  recurrence as a new issue." Before, a restored issue could be moved back to an open
  state and kept the `resolved_at` and `verified_by` of its earlier restoration. Open issues
  still move as before: they can skip steps, step back (VERIFY to REPAIRING) and be
  reassigned. The console already offered no action on a restored issue, so the web app is
  unchanged.
- **Studio Circle: the studio does not ask again.** `POST /api/studio-circle/:id/request`
  on a DECLINED or WITHDRAWN membership now answers 409, as it already did for REQUESTED,
  and creates no notification: "The artist chose to keep this private. Only the artist can
  join the Circle now." The artist can still accept from their side, under the consent rules
  set in the lifecycle-guards change. A request racing the artist's decline is refused too,
  because the write is still guarded on the status it read. The studio dashboard already
  offered "Invite" only on ELIGIBLE members. Members who declined or withdrew now show
  "Kept private by the artist" where the dashboard used to show nothing.

**Evidence**

- `apps/api/src/integration/lifecycle-guards.integration.test.ts` gains three subtests
  (15 in all):
  - *facility issue: a restored issue is closed to every change* sends six changes to a
    restored issue (ASSIGNED, ASSIGNED to someone else, REPAIRING, VERIFY, RESTORED, and
    REPAIRING with notes). Each one answers 409 with the new-issue message, and the stored
    row is unchanged.
  - *facility issue: open issues still skip, step back and reassign* checks the paths that
    stay allowed: REPORTED to RESTORED, VERIFY to REPAIRING, and a reassignment within
    ASSIGNED.
  - *Studio Circle: a studio may not ask again after the artist declined or withdrew*
    covers one membership the artist declined and one they accepted, then withdrew. A
    request on either answers 409 and creates no invitation, and the row is unchanged.
    The artist can still accept each one afterwards.

  The earlier *a request notifies once* subtest still shows an ELIGIBLE membership can be
  requested.
- Verify table:

  | Check | Result |
  |---|---|
  | `npm run typecheck --workspace=apps/api` | pass |
  | `npm run typecheck --workspace=apps/web` | pass |
  | `npm test` | pass: 102 API unit, 31 intelligence, 88 web (12 files) |
  | `npm run test:integration:local` | pass: 140 of 140 |
  | `npm run build` | pass |
  | `npm run security:secrets` | pass |

  The first `npm test` run failed: the web suite's test workers timed out while starting
  ("Timeout waiting for worker to respond"), with no test failing. The machine was busy
  with parallel sessions. The re-run passed.
- Each rule was put back and the test file run on a fresh database. Each file was then
  restored from a copy kept in a folder only this change used, and checked byte-identical
  with `cmp`.

  | Defect put back | Test that failed |
  |---|---|
  | RESTORED check removed | restored issue closed (`ASSIGNED` out of RESTORED answered 200) |
  | DECLINED dropped from the request refusal | studio may not ask again (request after DECLINED) |
  | WITHDRAWN dropped from the request refusal | studio may not ask again (request after WITHDRAWN) |
