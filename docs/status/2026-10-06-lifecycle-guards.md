**Promotional consent, message requests, facility issues and Studio Circle consent each
apply an answer once, even when answers arrive together, 2026-10-06. Closes C38.** Each of
these read a record's status, checked it, and then wrote the new status by id alone. Two
requests sent together could both pass the check and both apply: an approval and a decline
of the same promotional consent could both succeed with the last one silently winning; five
"Confirm restored" clicks on a facility issue each restored it; five Studio Circle requests
each notified the artist; a studio's request racing the artist's acceptance could overwrite
the acceptance with REQUESTED; and a reply that auto-accepts a message request could
overturn a decline sent at the same moment. Deliverable review, also listed under C38, was
fixed earlier and is not touched here.

Every write is now conditional on the status that was read (`updateMany` with that status
in its `where`, the pattern already used by credit answers and deliverable review), and a
request that loses answers 409 and changes nothing. A notification that represents the
state change is created only after the claim succeeds.

- **Promotional consent** (`PATCH /api/artist-projects/:id/promotional-consents/:consentId`).
  The transitions are unchanged (`isConsentTransitionAllowed`: APPROVE or DECLINE from
  REQUESTED, WITHDRAW from APPROVED); the write is now guarded on the status read.
- **Message requests** (`PATCH /api/connect/:id/status`). Accept and decline answer a
  PENDING request, as the route's own comment and the auto-accept on first reply say; a
  request already answered is refused with 409. Before, the recipient could set any status
  from any status. The auto-accept in `POST /api/connect/:id/messages` is also guarded on
  PENDING, so a reply never overturns a decline.
- **Facility issues** (`PATCH /api/facilities/issues/:id`). Every move the API allowed
  stays allowed, including skipping and stepping back (VERIFY to REPAIRING), because
  nothing in the code says otherwise. What is refused is repeating the state the issue is
  already in; within ASSIGNED, a reassignment to a different person is still a change. The
  write is guarded on the status and assignee read.
- **Studio Circle request** (`POST /api/studio-circle/:id/request`). A membership already
  REQUESTED is refused with 409 rather than notifying the artist again; ACCEPTED still
  answers 200 with the membership unchanged, as before. ELIGIBLE, DECLINED and WITHDRAWN
  can still be requested. The invitation notification is created only when the claim wins.
- **Studio Circle consent** (`PATCH /api/studio-circle/:id/consent`). Accept from any state
  but ACCEPTED, decline from any state but DECLINED, withdraw only from ACCEPTED, which is
  what the consent centre offers and matches promotional consent's rule. Before, every
  action was allowed from every state. The consent centre no longer shows "Keep private"
  on a membership that is already declined.

**Evidence**

- New `apps/api/src/integration/lifecycle-guards.integration.test.ts`, 12 subtests on a
  real app and a fresh local PostgreSQL. For each lifecycle: the normal transition works; a
  repeat is a 409 and the stored row is unchanged; five answers sent together give exactly
  one 200 and four 409s, and the stored state is the winner's. Studio Circle also counts
  invitations: one for a request and its repeat, one for five requests sent together. Two
  two-way races run four rounds each: a reply racing a decline (a 200 decline must leave
  DECLINED) and a studio request racing the artist's acceptance (a 200 acceptance must
  leave ACCEPTED). The fixed code passed 5 of 5 runs.
- Verify table:

  | Check | Result |
  |---|---|
  | `npm run typecheck --workspace=apps/api` | pass |
  | `npm run typecheck --workspace=apps/web` | pass |
  | `npm test` | pass: 102 API unit, 31 intelligence, 85 web (12 files) |
  | `npm run test:integration:local` | pass: 127 of 127 |
  | `npm run build` | pass |
  | `npm run security:secrets` | pass |

- Each guard was put back and the test file run on a fresh database; every file was then
  restored from a copy and confirmed byte-identical with `cmp`.

  | Defect put back | Test that failed |
  |---|---|
  | Consent write by id only | answers sent together (2 of 2 runs; first round each time) |
  | Message request write by id only | answers sent together (2 of 2 runs) |
  | Message request write by id only and PENDING pre-check removed | answer once and repeat, and answers sent together |
  | Auto-accept on reply by id only | reply racing a decline (4 of 4 runs) |
  | Facility write by id only | confirmations sent together |
  | Facility repeat check removed | step once and repeat, and confirmations sent together |
  | Circle request write by id only | requests sent together, and request racing the answer (3 of 3 runs) |
  | Circle REQUESTED pre-check removed | request once and repeat, and requests sent together |
  | Circle consent write by id only | answers sent together (2 of 2 runs) |
  | Circle consent transition rules removed | answer once and repeat |

  The race tests are not deterministic in principle: each depends on the requests'
  reads overlapping. In these runs every mutant that relied on a race failed on every run,
  usually in the first of four rounds.

**Not exercised**

- Removing only the PENDING pre-check on message requests is not caught, and need not
  be: the guarded write refuses the repeat by itself. The pre-check stays for a clearer
  early answer.
- Live updates over server-sent events (`broadcastToUser`) are not observed by the tests.
  They are sent only after the claim succeeds, so they now fire once.

**Observed, not changed**

- A studio can request Circle consent again after the artist declined or withdrew, as
  before. Whether that should be allowed is a product decision.
- A RESTORED facility issue can still be moved back to an open state, as before, which
  leaves its `resolved_at` and `verified_by` from the earlier restoration.
- The Circle invitation notification is created after the claim, not in the same
  transaction, matching credit answers: if creating it failed, the membership would stay
  REQUESTED without an invitation.
