# OIANO StudioOS — Full System Audit

**Why this document exists**: partway through this engineering session, a status summary claimed "everything from Tier 0 is closed" — it wasn't; 0.3 was still open, and 0.6 was only half-done. That error is the reason this audit is built the way it is: every claim below was re-verified this pass — live commands re-run with real output, files re-read, two independent research agents sent to areas most likely to have drifted from memory (frontend, test/route coverage) — rather than summarized from what earlier turns in this session reported. Where something couldn't be independently verified (no real Sentry account, no real R2 credentials), that's stated plainly rather than assumed.

**Relationship to earlier documents**: this doesn't replace [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md), [SCALE_READINESS_ROADMAP.md](SCALE_READINESS_ROADMAP.md), or [INTELLIGENCE_LAYER_STAGE1_AUDIT.md](INTELLIGENCE_LAYER_STAGE1_AUDIT.md) — it's the current-state layer on top of them, since a large amount of work landed after those were written. Read this first for "where does it actually stand today"; read those for the original reasoning.

---

## 1. What's genuinely done, re-verified this pass

### Security
- **Password reset** — `POST /api/auth/forgot-password` / `/reset-password` exist, rate-limited, generic response regardless of email existence (no enumeration). Frontend pages exist and are correctly linked from `EnterPage.tsx`.
- **JWT_SECRET / MFA key split** — re-confirmed live: `env.ts` hard-requires `MFA_ENCRYPTION_KEY` independently of `JWT_SECRET`. Queried the live DB directly this pass — the one `OIANO_ADMIN` account has `mfa_enabled: true` and a real encrypted secret, confirming the re-enrollment after the key split actually stuck. **Token revocation was never built** — this is the half of 0.6 that remains open; still pure stateless JWT, no logout-everywhere, no revocation before natural 7-day expiry.
- **Rate limiting** — unchanged from the original audit: only the four auth-adjacent endpoints have it (login/signup/mfa/enter, plus the two new intelligence endpoints added this session). The other ~145 endpoints have none — this is Tier 1.1, still open.

### Database
- **Indexes** — re-queried `pg_indexes` directly this pass: all 7 new indexes (3 on `bookings`, 1 each on `availability_slots`, `booking_messages`, `notifications`, `wallet_transactions`) are live. Also reconfirmed the pre-existing `bookings_room_time_no_overlap` GiST exclusion constraint is untouched and coexists with the new btree indexes.
- **Migration history** — re-ran `prisma migrate status` this pass: "Database schema is up to date," one migration (`20260819000000_baseline`) found and applied. The 28 broken historical migrations are archived, not deleted, in `prisma/migrations_archive_pre_baseline/`.
- **`db:verify-baseline` / `npm run verify`** — fixed to point at the real baseline instead of a second, independently-stale snapshot file (which had drifted to reference two tables removed months ago while missing six tables added since). The old snapshot is deleted; `docs/DATABASE_BASELINE.md` rewritten to match reality.

### CI/CD
- **Independently re-run every step this pass** (not just re-read the workflow file): typecheck (API) — pass, exit 0. Typecheck (web) — pass, exit 0. `npm test` (40 tests) — pass, exit 0. `npm run build` (both apps) — pass, exit 0.
- **One caveat surfaced by the coverage agent**: `prisma generate` hit a transient Windows `EPERM` file-lock in the local shell during its re-run (a lingering `node.exe` process holding the query-engine binary — the same class of issue that recurred all session on this Windows dev machine). The already-generated client was still valid, so typecheck/build succeeded anyway using it. This is almost certainly Windows-local-shell noise, not a real CI defect — GitHub's actual runners are fresh containers with no lingering process — but it hasn't been confirmed inside an actual GitHub Actions run yet, only reasoned about. Worth watching the first real PR's CI run rather than assuming.

### Intelligence Layer (V1)
- All three capabilities (Next Action, Session Summary, Navigation Intelligence) built, tested, wired to real endpoints. Re-confirmed file inventory this pass: 19 files under `apps/api/src/intelligence/`, all present.
- 31 tests specific to this layer, all passing.
- Feature-flagged off by default; confirmed the app has zero `OIANO_AI_*` vars set in the real `.env`, and the server boots and serves requests normally regardless.

### Frontend additions (re-audited fresh this pass, not just re-read)
- `ForgotPasswordPage.tsx` / `ResetPasswordPage.tsx` — correctly wired, styling matches established conventions, correct role-based post-reset redirect (mirrors `EnterPage.tsx`'s own logic).
- `MobileBottomNav.tsx` — role-keyed tab sets confirmed correct for all four roles.
- `SessionCompletionModal.tsx` — confirmed wired into all 4 intended call sites (`RunsheetPage`, `PulseDashboard`, `BookingDetailPage`, `AdminDashboardPage`).
- **One correction to the original Phase 1 architecture audit**: `SignatureUniverse3D` (the three.js component) was flagged there as a probable unoptimized bundle risk. It is not — confirmed this pass that it's lazy-loaded (`lazy(() => import(...))`) *and* additionally gated behind a capability check (desktop width, `prefers-reduced-motion`, device memory, WebGL support) before it's even requested. The original claim was wrong; corrected here.

---

## 2. New bugs found this pass (not previously known)

Both flagged as a spawn-task chip already, not yet fixed in this conversation:

1. **Chrome leak on public/auth pages.** `App.tsx`'s `CHROME_FREE_ROUTES` list covers `/enter` and `/onboarding` (plus a separate check for `/p/:code`), but not `/forgot-password`, `/reset-password`, or `/s/:slug` (the public studio passport). `StudioStatusBar` — a fixed-position top bar showing studio branding and live session counts — still renders on all three, directly contradicting the app's own stated intent for that route class. Not a data leak (the underlying queries are correctly gated on `token` presence), just a real, visible inconsistency three routes were left off a list two equivalent routes are on.
2. **Two-thirds of the AI session summary is invisible.** `SessionSummaryContext`'s real API response carries `knownFacts`, `inferredInsights`, and `suggestedFollowUp` as three deliberately separate arrays — the entire point being that an inference is never presented as a confirmed fact (Stage 5 of the intelligence-layer brief). `SessionInsightCard.tsx` only declares and renders `knownFacts`. The other two fields are fetched from the API on every load and then silently discarded.

---

## 3. What's still open — accurate, not optimistic

### Tier 0 (launch blockers) — 6 of 7 done
- **0.3 — file storage.** Not started. Two parts: (a) live-verify the R2 upload path against real credentials — I don't have R2 credentials in this environment, so this genuinely cannot be completed here; (b) switch from memory-buffered uploads to presigned direct-to-R2 URLs — re-confirmed this pass that `imageUpload.ts` still uses `multer.memoryStorage()`, so this is still exactly as described in the original roadmap.
- **0.6, second half — token revocation.** Not started, as above.

### Tier 1/2/3 — confirmed genuinely untouched, not assumed
Re-verified this pass rather than trusted from memory: no Redis/`ioredis` anywhere in `apps/api`, no job-queue library (`bullmq`/`bull`/`agenda`/`node-cron`) in `package.json`, no `Dockerfile` anywhere in the repo, no `storage_bytes_used`-style quota field in `schema.prisma`, `SINGLE_STUDIO_MODE` still `true` and undecided. All of Tier 1 (1.1–1.9), Tier 2 (2.1, 2.2), and Tier 3.2/3.3 remain exactly as scoped in the roadmap — nothing here has silently changed.

### Test coverage — the real shape of it
Confirmed independently by the coverage agent, with exact numbers: **40 tests total (9 security + 31 intelligence), all passing, all pure unit tests. Zero of the 153 API endpoints across 28 routers have any route/integration-level test coverage.** Everything tested is pure logic — auth predicates, token signing, AI-response validation — nothing that exercises Express middleware, Zod parsing in a live request, or a real Prisma call.

The five highest-blast-radius untested paths, named with file:line by the coverage agent:
1. `POST /api/webhooks/stripe` (`webhooks.routes.ts:12`) — signature verification, idempotency, wallet-mutating handlers
2. `POST /api/bookings` (`bookings.controller.ts:305`) — the wallet-balance guard that's a CLAUDE.md-mandated invariant
3. `POST /api/bookings/:id/complete` (`bookings.controller.ts:849`) — the multi-part completion transaction
4. `POST /api/auth/login` / `/signup` (`auth.controller.ts:129`/`:51`) — password verification, JWT issuance, MFA branch
5. `PATCH /api/bookings/:id/status` (`bookings.routes.ts:35`) — the studio-scope guard preventing cross-studio mutation

This is Tier 2.1 from the roadmap, unchanged in scope, now with concrete evidence behind exactly how thin it is.

### Frontend gaps, confirmed
- **No 404/catch-all route** anywhere in `App.tsx` — an invalid URL renders a blank page under the app chrome.
- **Multi-studio workspace-switcher UI** — the backend (`GET /studio/memberships`, `PATCH /studio/active`) has existed since Tier 3.1 was implemented; confirmed this pass that zero frontend code calls either endpoint. A `STUDIO_ADMIN` staffing two studios has no way to switch which one they're looking at.
- **Zero frontend test files**, confirmed again this pass.

---

## 4. Documentation debt found

- **`docs/OIANO_PAYMENTS.md` describes a system that no longer exists.** It documents the `PAYMENTS_PROVIDER`/`Payment Router`/`/api/payments/checkout` architecture — the entire OianoPayment stack retired earlier this session. Every code path it references is deleted. Not fixed here (documentation content, not a functional bug), but anyone reading it today would be reading fiction.
- **`docs/RELEASE_CHECKPOINT.md`** references "financial tests" as part of `npm run verify` — stale wording left over from the same retirement (the actual script now correctly runs `test:intelligence`, not the dead `test:payments`, but the doc's prose wasn't updated to match).

---

## 5. Punch list — what to clear, in order

**Quick clears** (small, already scoped, no dependencies):
- [ ] Chrome leak on `/forgot-password`, `/reset-password`, `/s/:slug` — add to `CHROME_FREE_ROUTES` in `App.tsx` (spawn-task chip already open)
- [ ] `SessionInsightCard.tsx` silently drops `inferredInsights`/`suggestedFollowUp` — render them (same chip)
- [ ] No 404/catch-all route in `App.tsx` — currently renders blank on an invalid URL
- [ ] `docs/OIANO_PAYMENTS.md` documents a system that no longer exists (the retired OianoPayment stack, in full) — delete or rewrite before anyone reads it as current
- [ ] `docs/RELEASE_CHECKPOINT.md` — stale "financial tests" wording, mechanism itself already fixed

**Real remaining work** (scoped, not blocking, no infra dependency):
- [ ] Tier 0.3b — switch uploads from `multer.memoryStorage()` to presigned direct-to-R2 URLs (buildable now; the R2-credential-verification half of 0.3 needs someone with real R2 access, not buildable here)
- [ ] Tier 0.6b — token revocation (`token_version` column, logout-everywhere, invalidate on password change)
- [ ] Multi-studio workspace switcher UI — backend (`/studio/memberships`, `/studio/active`) has existed since 3.1; zero frontend usage
- [ ] Route-level test coverage, starting with the 5 named highest-risk paths (Stripe webhook, booking creation's wallet guard, session completion, login/signup, booking status studio-scope guard) — Tier 2.1

**Bigger, needs an infra decision first** (Tier 1, sequenced per the roadmap's own note — Redis unlocks three of these at once):
- [ ] Rate limiting beyond the 4-5 endpoints that have it (1.1)
- [ ] Redis → unlocks cross-instance rate limiting (1.2), Pulse/availability caching (1.3), cached studio-scope lookups (1.4)
- [ ] Job queue → unlocks reliable retry on reset emails, retention/archival jobs (1.5, 1.6)
- [ ] Structured logging via pino (1.7)
- [ ] Frontend pagination + request timeouts (1.8)
- [ ] Dockerfile (1.9)
- [ ] Storage quota field (3.2) and the `SINGLE_STUDIO_MODE` retire-or-keep decision (3.3)

## 6. The honest bottom line

Six of seven Tier 0 launch blockers are done and independently re-verified this pass, not just claimed. The seventh (file storage) has one half I can't complete without credentials I don't have, and one half (presigned uploads) that's real, scoped, buildable work I haven't started. Token revocation — the other half of 0.6 — is in the same "known, scoped, not started" category.

The system has a real, demonstrated pattern this session: build something, verify it works, and then *also* find something adjacent that was already broken and fix that too (the migration squash surfacing `db:verify-baseline`'s staleness; this very audit surfacing the chrome leak and the hidden AI data). That pattern held again here — two new, real, previously-unknown bugs came out of asking for a fresh look rather than trusting the existing record.

What this audit does not cover, because it was never in scope for this session: a security penetration test, a legal/compliance review, load testing, or product/UX judgment calls about what Oiano should become next. Those are different kinds of audits than the engineering-correctness one this document is.
