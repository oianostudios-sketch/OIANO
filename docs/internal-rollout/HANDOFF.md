# OIANO internal rollout handoff

Read README.md first. This file is the current checkpoint; the audit checkpoint it
replaced is preserved at the end.

## Production preflight and first-five preparation - 2026-10-27

Continued on `chore/reviewed-local-checkpoint` without repeating the completed local
database, application build or unit-suite verification. Reused PR #54's names-only
configuration diagnostics and isolated tests on this branch; PR #54 and its original
branch remain unchanged. The production runbook identifies the environment secret
and two repository Actions variables and explains the trusted-base execution rule.
No current credentials or production services were accessed.

The [first-five checklist](FIRST_FIVE_CHECKLIST.md) contains an owner-send invitation
draft, current account paths, private completion checklist, rehearsal and operational
gates. The approved questionnaire was not changed and nobody was contacted.

New source-confirmed blocker: `EnterPage` preserves invitation `next` only for Artist
accounts; Creative professional and studio-staff sign-in drops the destination, and
professional onboarding also drops it. The next recommended implementation is T09
in [the backlog](BACKLOG.md), with targeted routing tests. Until resolved and rehearsed,
sign in first and reopen the original private link during supervised onboarding.
Do not silently assign a false discipline or create a studio to bypass account limits.

Evidence and limits:
[production preflight](../status/2026-10-27-production-parity-preflight.md) and
[first-five preparation](../status/2026-10-27-first-five-preparation.md).
Production parity, intended deployment/recovery evidence and browser/phone rehearsal
remain outstanding. Intake invitations can be prepared independently of migration;
real-work reliance still needs the operator and participant gates.

## Current Git and validation checkpoint - 2026-10-27

The owner authorized checking and committing aligned pending work. The 22 messaging,
rollout and intake paths in this checkout matched `claude/creative-intake` exactly;
that branch's existing commits were reused rather than duplicated. The current branch
is `chore/reviewed-local-checkpoint`, based on `claude/creative-intake`. The
`fix/production-parity-config-diagnostics` branch and PR #54 were left unchanged.

The remaining agent-guidance changes were reviewed and committed. Local schema parity
passes with 21 migrations, both typechecks pass, and a fresh local integration run
passes 264/264. Production parity remains unverified; the inspected PR #54 comparison
run had missing configuration. Nothing was pushed, deployed or run against production.
See [the checkpoint record](../status/2026-10-27-reviewed-local-checkpoint.md) for
verification limits and deliberately uncommitted paths.

Next actions: owner sends the existing questionnaire to the first five participants;
authorize and configure the production parity check separately. Browser/phone rehearsal
remains outstanding. Do not treat this local checkpoint as migration or pilot approval.

## Latest — creative intake kit (Claude Code, 2026-10-27)

The owner asked to work towards the creative intake (T01). Documentation only; no
product code. Added `docs/internal-rollout/intake/`:
- `README.md`: how to run the round, privacy, who to ask first, and when it's done.
- `QUESTIONNAIRE.md`: for participants; plain language, not music-specific.
- `RECORD_TEMPLATE.md`: keeps told, today, proposed and confirmed separate.
- `CURRENT_SUPPORT.md`: what OIANO does today per primitive, checked against the code.
- `SYNTHESIS.md`: empty until records are confirmed.

Status record: `docs/status/2026-10-27-creative-intake-kit.md`. Committed on local branch
`claude/creative-intake`, stacked on `claude/conversation-reliability`; not pushed.

**Privacy rule:** the repository is public. Participants' answers, names and records
stay in a private place the owner chooses, never in the repository.

**Private records location (owner's choice, 2026-10-27):** a folder in the owner's
OneDrive, `Documents\OIANO Intake - Private`, so it is on the machine and in the owner's
own online storage, shared with nobody. It has `responses\`, `records\` (with
`_TEMPLATE.md`), `KEY.md` (the only place names are linked to record ids) and a copy of
the questionnaire. Nothing from it is committed here.

**Next action:** the owner sends the questionnaire to the first five people listed in
`intake/README.md`. When a transcript is shared
in a session, an agent fills a private record (told, then today), drafts proposals for
the person to confirm, and updates only `SYNTHESIS.md` in the repository, by record id.
Batch 1's next actions below still stand (PR decision, browser rehearsal).

## Checkpoint — implementation batch 1 (Claude Code, 2026-10-27)

### Authorization

Owner message of 2026-10-27 authorized: T02 / IR-01 (contributor project-message
updates), T03 / IR-02 (conversation load and send errors), the local verification
part of T04, and updating the audit, backlog, status record and this handoff. It did
not authorize deploying, pushing, merging, production data changes, enabling
payments, canonical schema migration, or changing the frozen architecture. A second
owner message the same day added the broader rollout direction and asked for
`IMPLEMENTATION_REPORT.md` with a bounded next-step plan; it is not authorization to
build later features.

### Repository state at start

- Branch `fix/production-parity-config-diagnostics` (open PR #54), HEAD
  `eaa0befc1e2ef12a0ce59e23a9796c2570daa437`, unchanged since the audit.
- Pre-existing, not ours, left alone: `CLAUDE_CODE_PROMPT.md`, `docs/README.md`
  (modified); `.github/copilot-instructions.md`,
  `docs/OIANO_CANONICAL_ARCHITECTURE_V1_RECONCILIATION.md`,
  `docs/status/2026-10-21-copilot-agent-instructions.md` (untracked).
- From the Codex audit (untracked): `docs/internal-rollout/*`,
  `docs/status/2026-10-27-internal-rollout-audit.md`.
- No branch or open PR touched `project-messages.routes.ts` or `MessageThread.tsx`.

### Verified before changing code

- IR-01 confirmed: `accessibleProject` admits the artist, producer, ACTIVE claimed
  participants, engineers (role ENGINEER) on the project's bookings, STUDIO_ADMINs
  holding a membership at a booking's studio, and OIANO_ADMIN. POST broadcast only
  to artist and producer.
- Additional gap: `useSSE` re-reads `['context']` and `['communications']` on
  reconnect but not message threads, so a message missed while disconnected stayed
  hidden until refocus or reload.
- IR-02 confirmed: `MessageThread` renders no load or send error.

### Progress

- [x] T02 project-message audience — `project-messages.routes.ts`: one
  `conversationMembers` list now decides both reading and live delivery, sent with
  `broadcastToUsers` (one event per person). Staff/engineer policy unchanged:
  those who could already read now also hear live. Platform operators keep read
  access and are not sent messages live (decision recorded in DECISIONS.md).
  New `apps/api/src/integration/project-message-updates.integration.test.ts`: 4/4 on
  fresh local database `oiano_msgupdates_20261027001320314_test`. Five defects put
  back one at a time, each failed it, file restored: old artist+producer audience;
  duplicate delivery; non-ACTIVE participants counted; sender hears own message;
  admins of any studio.
- [x] T02 reconnect recovery (code) — `useSSE.ts` re-reads `['project-messages']`
  and `['booking-messages']` on reconnect. Server side, the test proves a message
  sent while disconnected is returned by the next read. New
  `apps/web/src/hooks/useSSE.test.ts` (1 test) proves both conversation families
  re-read on reconnect and not on first connect; three defects put back, each failed.
- [x] T03 conversation states — `MessageThread.tsx`: separate loading, could-not-load
  (with Try again), empty and populated states; a failed refresh keeps showing the
  loaded messages with a notice; a failed send shows "Your message wasn't sent" with
  Try again and keeps the draft; the draft clears only after success and only if it
  still matches what was sent. New `apps/web/src/components/MessageThread.test.ts`
  (6 tests, both variants). Defects put back, each failed: alert removed, empty shown
  on error, send failure hidden, draft cleared on failure.
- [x] Verification ledger (below)
- [x] BACKLOG, DECISIONS, AUDIT notes, status record
  `docs/status/2026-10-27-conversation-reliability.md`, IMPLEMENTATION_REPORT.md
- [ ] Browser and phone rehearsal: **not done**, no browser tooling in the session

### Commits

Branch `claude/conversation-reliability`, created from `origin/main` (`89eb1d1`) without
switching this checkout. It was built from a separate index, so this checkout stays on
`fix/production-parity-config-diagnostics` with its files as they were. Not pushed, no PR.

- `80f161d`: product code and tests (the six files under `apps/`).
- The next commit on that branch: these rollout documents and both 2026-10-27 status
  records.

The working-tree copies of these files remain here, uncommitted on this branch. Delete
them from this checkout only once the branch has merged.

### Verification ledger (2026-10-27, run one after another, never overlapping)

| Check | Result |
|---|---|
| New integration test, fresh local db `oiano_msgupdates_20261027001320314_test` | 4/4 |
| API defects put back (5) | Each failed the test; file restored, grep confirmed |
| New web tests (MessageThread 6, useSSE 1) | 7/7 |
| Web defects put back (9) | Each failed its test; files restored |
| `npm run build --workspace=packages/shared` | Pass |
| API and web typechecks | Pass, no diagnostics |
| `npm test` (NODE_ENV=test, unreachable credential-free DATABASE_URL) | Exit 0: 5, 128, 31, web 124 in 19 files |
| `npm run build` | Exit 0 |
| `npm run test:integration:local` on `oiano_integration_20261027001922352_test`, 21 migrations | **264/264**, exit 0, a single clean run |
| `npm run security:secrets` | Pass (536 tracked; 539 with the new test files staged) |

Tests ran on this working tree (`eaa0bef` plus the changes). The branch is
`origin/main` plus the same files; `eaa0bef` differs from main only in
`scripts/production/`. Local databases created this session were kept; prune with
`npm run db:local:prune` when convenient.

### Remaining uncertainties

- Not exercised in a browser or on a phone.
- Booking-conversation recipients were not reviewed (`messages.routes.ts`).
- Whether studio admins want every linked project's messages live (DECISIONS.md).

### Next action

1. Owner: review branch `claude/conversation-reliability` and decide whether to push and
   open a PR. Answer the questions in IMPLEMENTATION_REPORT.md section 8.
2. Next agent, with a browser: `npm run dev:local`, then rehearse the six steps in
   IMPLEMENTATION_REPORT.md section 5 with an isolated producer, an accepted
   contributor, a removed contributor and an unrelated account. Record the results
   here.

---

## Audit checkpoint (Codex, 2026-10-27) — superseded by the checkpoint above

- Repository: C:\projects\oiano
- Branch: fix/production-parity-config-diagnostics
- Starting HEAD: eaa0befc1e2ef12a0ce59e23a9796c2570daa437
- Pre-existing modified files: CLAUDE_CODE_PROMPT.md; docs/README.md.
- Pre-existing untracked files: .github/copilot-instructions.md; docs/OIANO_CANONICAL_ARCHITECTURE_V1_RECONCILIATION.md; docs/status/2026-10-21-copilot-agent-instructions.md.
- This audit adds docs/internal-rollout documents and one dated docs/status record. It changes no product code or schema. No commit, merge or deployment was performed.
- Authorization: audit, safe local verification and documentation only. Product implementation is proposed for later owner approval.

### Completed

Inspected repository instructions, current source for project creation, contributor claim/access, messaging, session attachment/detachment, authentication, feedback, environment checks and local-test runners. Compared historical readiness with later status records. Captured the owner's studio-first group and additional creative disciplines. Created six audit/intake/continuation documents with six findings and eight bounded tasks.

### Command ledger

| Check | Actual result |
|---|---|
| Git status, branch and HEAD | Captured above; initial sandbox reads had access errors, resolved with approved external-repository execution |
| npm test | Pass: secret-check tests 5/5; API security 128/128; intelligence 31/31; web 117/117 across 17 files |
| npm run build --workspace=packages/shared | Pass |
| npm run typecheck --workspace=apps/api | Pass; execution advanced to the next check without reported diagnostics |
| npm run typecheck --workspace=apps/web | Pass; no reported diagnostics |
| npm run security:secrets | Pass across 536 tracked files; new untracked audit documents are outside that scanner's tracked-file scope |
| npm run test:integration:local | Initial run: 255 passed, 1 file-load failure; 21 migrations applied. Failed file rerun after build: all 5 tests passed. See execution conflict below. |
| npm run build | Pass: API and web build completed |

Unit checks explicitly set NODE_ENV=test and a credential-free unreachable localhost DATABASE_URL. Integration uses the repository's fresh local runner on port 55432 and database oiano_integration_20261026235912328_test. The runner pins NODE_ENV=test and DATABASE_URL despite Prisma printing that it loaded .env; log confirms localhost target. Local PostgreSQL state is retained; no shared database was tested or changed. No blanket cleanup of databases or processes is authorized.

### Evidence locations

Local audit logs live under C:\Users\oiano\Documents\Codex\2026-10-27\so-i-m-thinking-why-not\work after checks complete. User-facing document copies are under that chat's outputs/internal-rollout folder. Repository documents are the continuation source of truth; update those when later work starts.

### Integration execution conflict

The full run reported 256 tests: 255 passed and one file failed before its subtests loaded because @oiano/shared/dist/index.js was temporarily absent. The audit ran npm run build while integration was still running; that build deletes and recreates shared dist. The affected feedback-and-equipment-scope file then passed all five tests with the build finished, on the same disposable database. This supports an execution conflict, not a reproduced product defect. Do not report a clean single full-suite run: the combined evidence is the initial run plus the targeted rerun. Run builds and integration sequentially in future. The shell wrapper's final exit was masked by Get-Content on the initial run; the test summary, not that wrapper exit, is authoritative. Targeted rerun preserved exit status and returned 0.
