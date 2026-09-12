# OIANO action guide

Started 2026-09-07. Implements the [continuation audit](OIANO_MARKET_ADOPTION_CONTINUATION_AUDIT.md). Read [Direction](OIANO_DIRECTION.md) first.

## Outcome

Users can understand current work, trust its state, act, return without reconstructing context, show credible evidence and bring collaborators into explicit working relationships.

## Execution order and live status

| Stage | Scope | Status / gate |
|---|---|---|
| 1 — Trust and continuity | R1 payment-return truth; R2 accurate context; R3 Communications errors/freshness | **Done** — see [implementation status](OIANO_IMPLEMENTATION_STATUS.md): R1 `1b9fbdb`, R3 `3f59045`, R2 `b80b90d`. One gate (new work appearing without reload) is wired but not observed end to end. |
| 2 — Shared visual grammar | R8 Creator Home, Artist Projects, Public Passport, Runsheet; bounded R6 presentation | Not started (stage 1 is done). Capture fixtures; semantic tokens, readable hierarchy, focus, responsive/print verification. |
| 3 — Entry and recovery | R4 invitation flow; R7 return intent; R5 auth/upload/conflict recovery | Pending. Acceptance must explain existing domain permissions; no silent membership grants. |
| 4 — Adoption journey | R9/R10 one review → evidence/share → contextual project invite → useful return | Pending earlier technical gates. Actual participation required; generic invitation attribution is not project access. |
| Validation | R12 baseline/formative tasks, R11 international correctness, R13/R14 later portability/pilot | Technical checks during each stage; human comprehension, retention and willingness to pay remain unmeasured until tested. |

## Boundaries

- Preserve unrelated shared-tree edits; inspect files before editing.
- Domain services own commands, money, permissions and evidence. Context/UI are read models and presentation.
- Maintain multi-studio scoping, Zod/AppError, shared API/auth store conventions and ports 4000/5173.
- Use current source over stale audit descriptions. No global raw-color replacement or full-app redesign.
- No production deployment, real payment, external message or real invitation delivery is part of this implementation.
- Independent reviewable changes; document partial status honestly. No implied human-test or CI pass.

## Stage 1 acceptance

- URL parameters cannot prove payment receipt, wallet credit or booking confirmation.
- Loading, error, stale and empty remain distinct; previously loaded work survives refresh failure.
- Successful mutations and stream reconnect/events refresh context and Communications.
- Pending/confirmed/underway sessions use truthful language and permitted actions.
- Pending work derives from domain state; notifications retain their role as dated history.
- Meaningful component and domain regression tests cover the actual rendering/data boundaries; mutation-check critical assertions.

## Required verification

Run both typechecks, API security/intelligence, web suite, build, secret scan and integration suite against a fresh temporary Postgres database. Inspect integration setup before execution. Validate changed screens with controlled fixtures. Record results, failures and limitations here. Never modify an existing database to make a test pass.

## Implementation record

- Initial audit defects reverified on the shared tree. Existing session-log/files/integration architecture edits belong to other work and are preserved.
- Implementation and verification results will be recorded below as work lands.
