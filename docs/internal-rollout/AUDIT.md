# OIANO readiness audit

Date: 2026-10-27. Source: C:\projects\oiano, branch fix/production-parity-config-diagnostics, HEAD eaa0befc1e2ef12a0ce59e23a9796c2570daa437, plus pre-existing uncommitted documentation. This is a source and local-check audit; no production data or live service configuration was inspected.

## Baseline

The repository describes a Creative Work Network. Current implementation is a TypeScript monorepo: Express API, Prisma/PostgreSQL, React/Vite web application and shared package. It includes studio-scoped bookings, projects, contributions, invitations, communications, deliverables, rights decisions, professional profiles, feedback and a financial ledger. The frozen target expands identity, contextual contributions and Work through an ordered migration. That target is not evidence those models already exist.

Read AGENTS.md before executing commands. Node >=22 is declared at the root. Existing dependencies were available, so npm ci was not needed. The prescribed paths are npm run dev:local and npm run test:integration:local. Both depend on local PostgreSQL tooling. Shared .env databases must never be used for tests. Build packages/shared before typechecks. Production schema changes follow the repository's migration approval workflow; this audit authorizes none.

Authentication verifies the JWT and looks up the current role/auth_version in the database (apps/api/src/middleware/auth.middleware.ts, authenticate). Studio scope has dedicated middleware. Contribution invitations bind a claimed token to a user rather than matching an unverified signup email (routes/contributions.routes.ts). Project conversation access is independently checked server-side by accessibleProject. These are positive code observations, not proof of every authorization boundary.

render.yaml declares staging mode, the free plan, Stripe disabled and AI disabled. It declares external R2 and SendGrid configuration without values. These are checked-in settings, not a live infrastructure inventory. Production env.ts requires operational contacts, storage/email configuration and a recent restore record. The existence of that guard does not prove a restore happened.

Existing September readiness documents are historical. October status records describe later tenancy, access, session attachment and production-workflow fixes. Do not re-open September issues simply from their old labels. Current behavior needs fresh verification.

## Workflow assessment

| Journey | Source evidence | Current conclusion |
|---|---|---|
| Artist and staff coordinate sessions across studios | bookings.routes.ts; studioScope.middleware.ts; artist-links-bookings and artist-detach integration tests | Implemented with focused historical tests; local integration evidence recorded in HANDOFF; multi-user browser rehearsal required |
| Invite an additional creative into a project | producer.routes.ts ParticipantSchema and invitation endpoints; contributions.routes.ts; ContributionWorkspacePage.tsx | Token claim and contributor workspace exist; contributor labels and live updates have limitations below |
| Return to outputs, conversation and attribution | artist-projects.routes.ts; ContributionWorkspacePage.tsx; MessageThread.tsx | UI/API paths exist; real media upload/download, membership removal and phone use unverified |
| Report product friction | feedback.routes.ts; App.tsx mounts FeedbackWidget | Reuse existing feedback channel; operator role is required to read and resolve reports |

No entire end-to-end journey is marked production-ready by this audit.

## Findings

### IR-01 — Contributor conversation updates omit accepted collaborators

> **2026-10-27, batch 1:** confirmed and fixed locally; see IMPLEMENTATION_REPORT.md. The original finding is kept below unchanged.

Priority: P1 before relying on live team conversations. Confidence: confirmed source behavior; runtime reproduction pending.

Evidence: apps/api/src/routes/project-messages.routes.ts, accessibleProject and POST '/'. Readers include ACTIVE participants and qualifying staff/engineers. The broadcast recipient set includes only the named artist and project producer. apps/web/src/pages/ContributionWorkspacePage.tsx uses MessageThread with new_project_message SSE invalidation; MessageThread has no polling interval of its own.

Reproduce: accept a contribution as account C; keep C's project conversation open; send from project owner P; observe whether C updates without refresh or refocus. Compare with named artist A. A later refetch may reveal the saved message; the finding concerns missing immediate updates, not proven message loss.

Recommendation: derive notification recipients from current authorized membership, with explicit policy for staff/engineers. Do not broaden access just to fix delivery. Acceptance: active invited contributors receive updates, removed/unrelated users do not, and reconnect refetches persisted messages. Dependency: agree intended audience; regression test should cover each boundary.

### IR-02 — Conversation errors can appear as an empty thread or unexplained failed send

> **2026-10-27, batch 1:** confirmed and fixed locally for both variants; see IMPLEMENTATION_REPORT.md. Browser rehearsal still pending.

Priority: P1 before daily communication reliance. Confidence: confirmed source behavior; browser reproduction pending.

Evidence: apps/web/src/components/MessageThread.tsx destructures data/default [] and isLoading, but renders no query-error state; mutation has onSuccess but no rendered send error. apps/web/src/lib/api.ts rejects ordinary errors without a general toast (401 and a particular scope 409 redirect).

Reproduce: fail the conversation GET with a 500; after retries, inspect the empty-state message. Fail POST with 500 and inspect feedback and retained draft. No message-loss claim is made: draft clears on success only.

Recommendation: render explicit load/send errors with retry and preserve draft. Acceptance: failed load never claims the conversation is empty; failed send is visibly unsent and retryable; success clears the draft; ordinary errors stay on the page. Scope applies to booking and project variants.

### IR-03 — Contribution vocabulary and workflow phases remain music-oriented

Priority: P1 scope decision before welcoming non-music creatives as fully supported; P2 adaptation after supervised pilot begins if limitations are accepted. Confidence: confirmed request schemas.

Evidence: producer.routes.ts ParticipantSchema permits music roles, MANAGER and OTHER, with no explicit poet, cinematographer or model role and no custom role label in that request. Project creation/update accepts PRE_PRODUCTION, TRACKING, EDITING, MIXING, MASTERING, DELIVERED. This does not mean those people cannot hold accounts or accept invitations; it means the work cannot be accurately described through those fields alone.

Reproduce: inspect contribution-role and phase options while describing a film shoot or poetry commission; check whether a truthful role and completion path can be recorded. Recommendation: collect CREATIVE_INTAKE responses, map to the frozen contextual Contribution/Work design, and propose the smallest compatible representation. Avoid changing authentication roles for every profession. Acceptance: each pilot discipline can describe its contribution and completion criteria accurately; any temporary OTHER mapping is explicit and agreed. No schema expansion is authorized by this audit.

### IR-04 — Current project creation depends on a producer account

Priority: P2 for a producer-led studio pilot; P1 if independent artist/poet initiation is required immediately. Confidence: confirmed endpoint restriction; alternative full Work flow not verified.

Evidence: producer.routes.ts POST /projects requires PRODUCER and a producer profile, assigning producer_id. artist-projects.routes.ts supports reading and attaching own sessions, not a creation endpoint. The frozen architecture explicitly calls for any person to start Work through canonical migration.

Reproduce: attempt the producer project-create route as ARTIST; expect role refusal. Recommendation: pilot with an identified legitimate producer lead if acceptable; otherwise sequence the appropriate canonical work, rather than disguising everyone as a producer. Acceptance: agreed pilot initiation path is documented; broader self-initiation follows frozen migration gates.

### IR-05 — Deployment, external files and recovery are not yet verified for this pilot

Priority: P1 verification gate before irreplaceable real work. Confidence: unknown runtime state; this is not a confirmed outage.

Evidence: render.yaml; apps/api/src/lib/env.ts; scripts/backup-database.ps1; docs/PRODUCTION_MIGRATION_WORKFLOW.md and October production status. Checked-in staging settings and historical reports cannot prove current readiness. No live storage, mail, backup restore, deployed revision, production parity or capacity check was performed.

Verification: establish intended pilot URL and deployed revision; have the authorized operator demonstrate a successful restore into an isolated target, recovery ownership, a small real upload/download with correct access, and any required invitation/password recovery email. Verify payment path separately if used. Acceptance: dated evidence and recovery procedure for the actual pilot environment; no production secrets in documents. Do not enable money rails as a side effect.

### IR-06 — Fresh runtime verification remains a separate release gate

Priority: P1 verification gate. Confidence: see HANDOFF for actual command results.

The code has meaningful tests for tenancy, invitation claims, concurrent attachment, privacy and rights. Their existence and historical success do not establish today's full behavior. Run the local integration suite and the three multi-account journeys, including access removal and ordinary failures. Acceptance: recorded current results with environment, failures triaged, phone rehearsal completed. Environment startup failure must not be reported as product failure.

## What can be improved during use / deferred

Media constraint to validate in intake: apps/api/src/routes/files.routes.ts sets MAX_UPLOAD_BYTES to 200 MiB and limits artist-file management to the artist or authorized studio admin; accepted project membership alone does not grant this endpoint's upload permission. This is not a finding that every deliverable route shares that policy. For cinematographers, rehearse their actual file sizes and the exact deliverable route before promising raw-footage collaboration. A review proxy may suffice, but that is a user choice, not an assumed substitute.

Use existing feedback and contributor onboarding after the gates above. Collect precise primitive needs before broader discipline-specific workflows. Defer target-surface redesign, generalized recommendation intelligence, enterprise scale and expanded payments beyond this pilot unless the actual work requires them. No arbitrary user limit or hosting capacity is claimed.

## Verification

HANDOFF.md contains the current command ledger and remaining gaps. No browser rehearsal, remote service call, production database read, restore drill, load test or payment provider transaction was performed in this audit. No product code, schema or frozen architecture was changed.

Current check summary: npm test passed (5 repository checks, 128 security, 31 intelligence, 117 web); shared build, API/web typechecks, full build and tracked-file secret scan passed. Integration initially passed 255 with one shared-package file-load failure caused during an overlapping build; the affected file passed all five tests on a targeted sequential rerun. No clean full-suite rerun is claimed. See HANDOFF for the exact limitation.

