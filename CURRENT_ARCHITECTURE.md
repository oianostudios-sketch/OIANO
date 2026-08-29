# OIANO StudioOS — Current Architecture

**Purpose**: Phase 1 of the Public-Ready Scale & Account Architecture Audit. This document maps what actually exists in the codebase today — no redesign, no assumed best practices, no imagined infrastructure. Every claim below is grounded in a specific file and line number. Where something doesn't exist, that is stated explicitly rather than left implied.

**Method**: full-repo investigation across five parallel research passes (frontend, backend/API, database/schema, auth/security), each independently reading every relevant file in full rather than sampling.

**Snapshot date**: 2026-08-18. The codebase is a TypeScript monorepo — `apps/web` (React 18 + Vite), `apps/api` (Express + Prisma), `packages/shared`, `prisma/` — single Postgres database, currently operating in `SINGLE_STUDIO_MODE = true` even though the database and some route logic already model more than one studio (see §7).

---

## Layered request flow (as it actually exists)

```
Browser (React 18 SPA, one bundle per lazy-loaded route)
   │
   │  axios instance (lib/api.ts) — Bearer token from Zustand, no refresh, no timeout
   ▼
Vite dev proxy  →  Express app (single Node process, apps/api)
   │
   ├─ requestId → helmet → CORS allowlist → [raw body for /api/webhooks] → express.json()
   ▼
authenticate()  (JWT verify, HS256, 7-day expiry, no revocation)
   ▼
requireRole()  (string role check)              resourceAuthorization.ts  (ownership checks, opt-in per route)
   ▼                                                        ▼
resolveStaffStudio()  — fresh DB query every request, no cache, no studio_id in JWT
   ▼
Route handler — logic mostly INLINE in the route file (only 2 of 28 routers use a separate controller)
   ▼
Prisma (singleton client, pool_limit=20) ──────────────────────┐
   │                                                             │
   ▼                                                             ▼
PostgreSQL (Neon)                                    Cloudflare R2 / local disk (file uploads)
   │
   ▼
In-process event emitters, all synchronous, all single-instance-only:
   • SSE broadcast (notifications.routes.ts, in-memory Map<userId, Set<Response>>)
   • activityEventBus (console-logs activity events, no persistence beyond the ActivityEvent row)
   ▼
Pulse / Notifications / Passport are read models computed live from the same
Postgres tables on each request — none of them are precomputed, cached, or
served from anywhere other than a fresh query.

NOT PRESENT anywhere in this flow: a cache layer (Redis is stubbed-out but
commented off), a job queue, a second app instance, a CDN in front of the
API, or any cross-process fan-out for SSE.
```

---

## 1. Frontend Architecture

- **Stack**: React 18.3, React Router v7 (not v6 despite CLAUDE.md's documentation — `apps/web/package.json`), TanStack Query v5, Zustand v4, Tailwind, Vite 8, axios.
- **Structure**: `apps/web/src/{pages(42), components(34), hooks(1), lib(4), store(1), context(1)}`.
- **Routing** (`App.tsx`, 158 lines): all 30 page routes are `React.lazy()`-loaded under a single `<Suspense>` — real per-route code-splitting, not one giant bundle. Auth/role gating via a `RequireAuth` wrapper checking `useAuthStore`. **No catch-all 404 route exists** — an unmatched path renders blank, not an error page.
- **State**: exactly one Zustand store (`auth.store.ts` — token + user, persisted to `localStorage` under `oiano-auth`, `logout()` correctly calls `persist.clearStorage()`). React Query defaults: `staleTime: 30_000`, `retry: 1`, no `gcTime` override (library default 5 min), no `refetchOnWindowFocus` override (library default `true`).
- **API layer** (`lib/api.ts`, 24 lines, entire file): single axios instance, Bearer token injected via request interceptor from Zustand state. **No request timeout configured** (can hang indefinitely). **No refresh-token logic** — any 401 hard-logs-out and redirects. No retry/offline handling beyond React Query's generic `retry: 1`.
- **Real-time**: two independent transports. (1) App-wide SSE (`hooks/useSSE.ts`) via a ticket-gated `EventSource`, exponential-backoff reconnect (1s→30s cap), invalidates React Query keys + fires toasts on `booking_updated`/`session_delivered`/`wallet_updated`/`new_message`/`notification`/`studio_announcement`. (2) `SmartClock` has its own separate `WebSocket` attempt with a 3s timeout, falling back to 30s REST polling — not unified with the SSE hook.
- **Bundle concerns**: `three` + `@react-three/fiber` + `@react-three/drei` are pulled in for one decorative component (`SignatureUniverse3D.tsx`) with no `manualChunks` isolating it into its own vendor chunk.
- **Mobile**: no PWA manifest, no service worker. `MobileBottomNav.tsx` exists but is **ARTIST-role only** — Admin/Engineer/Producer have no mobile-optimized nav equivalent.
- **Error handling**: one app-wide `ErrorBoundary` (not per-page) + a `Toast` system (`success/error/info`, auto-dismiss 4s, capped at 5 visible). API errors beyond 401 are handled ad hoc per-page, not centrally.
- **Pagination**: the backend supports `?page=&limit=` (per CLAUDE.md), but the frontend **never exposes pagination UI** — grepped for `useInfiniteQuery`/`Load more`/`pageParam` across all of `src`: zero matches. Several list views (`DashboardPage`, `AdminDashboardPage`, `EngineerDashboardPage`, `PassportPage`) fetch `/bookings` with no `limit` param at all, relying entirely on the backend's default cap.
- **Tests**: **none exist**. No `*.test.tsx`, no test runner in `package.json` (no vitest/jest/playwright/cypress).

## 2. Backend Architecture

- **Bootstrap** (`app.ts`, 137 lines, entire file, middleware order): `dotenv` (loads `apps/api/.env`, not repo root) → `validateEnv()` → `requestId` → `helmet()` (default config) → CORS allowlist → `/api/webhooks` raw body (correctly mounted before JSON parsing) → `express.json()` → `GET /health` → 28 routers → `errorHandler`.
- **No `morgan`/request-logging middleware.** **No SIGTERM/SIGINT handling anywhere** — no graceful shutdown, no draining of open SSE connections or the Prisma pool on stop.
- `index.ts` runs an async startup assertion (`assertSingleStudioInvariant`, `index.ts:10-27`) that queries `studio.count()` and **refuses to boot** if more than one studio row exists while `SINGLE_STUDIO_MODE` is true — a real, currently-load-bearing guard (this session's own second-studio cleanup tripped it).
- **Controllers vs. routers**: only 3 files exist under `controllers/` (`index.ts` barrel, `auth.controller.ts` 260 lines, `bookings.controller.ts` 924 lines — the largest file in the backend). **25 of 28 routers have their logic written inline in the route file itself** — CLAUDE.md's documented controller/route split is the exception, not the rule, in practice. `producer.routes.ts` (541 lines), `passport.routes.ts` (453 lines), `admin.routes.ts` (449 lines) are the largest inline-logic files.
- **Background processes / job queue**: **none exist.** No cron, no node-cron, no Bull/BullMQ/Agenda. `docker-compose.yml` has a Redis service block that is explicitly commented out with the note "Uncomment when ready for Redis-backed notification queue" — a stub, not a running system.

## 3. Database Structure

- **39 models, 10 enums**, single PostgreSQL database (Neon-hosted — connection code specifically handles Neon's idle-disconnect errors, `lib/prisma.ts`).
- **Model groups**: Account/identity (`User`, `AdminAuditLog`) · Studio/workspace (`Studio`, `StudioStaff`, `Room`, `Engineer`, `ServiceOffering`, `AvailabilitySlot`, `StudioAnnouncement`, `StudioCircleMember`) · Booking/session (`Booking`, `SessionLog`, `BookingMessage`) · Project/creative-work (`Project`, `ProjectMessage`, `ProjectParticipant`, `ProjectCredit`, `RightsAgreement`, `RightsShare`, `PromotionalConsent`, `Deliverable`, `DeliverableVersion`, `DeliverableReview`, `Track`) · Financial (`Wallet`, `WalletTransaction`, `WalletTopUp`, `Payment`, `StripeWebhookEvent`) · Social/Passport (`Artist`, `ArtistPassport`, `PassportView`, `ArtistRelease`, `ArtistFile`, `PassportConnection`, `ConnectMessage`, `Producer`, `ProducerPassport`) · Admin/ops (`ActivityEvent`, `Feedback`, `AdminAuditLog`).
- **Connection handling** (`lib/prisma.ts`, 39 lines, entire file): singleton `PrismaClient` guarded against hot-reload duplication in dev. Connection pool explicitly raised to `connection_limit=20, pool_timeout=20` via a programmatic `DATABASE_URL` rewrite (`buildDbUrl()`) — the inline comment says this is specifically because "parallel routes (e.g. pulse) don't exhaust it" at the default pool size of 9.
- **Indexing — the single sharpest gap found in this pass**: `Booking`, the highest-traffic model in the system, **has zero `@@index` declarations**. Every hot query pattern is unindexed: `studio_id` + date range (booking lists, Pulse), `artist_id` filtering, and the room/time overlap conflict check that runs on every booking create and reschedule. `Notification`, `BookingMessage`, `WalletTransaction`, and `AvailabilitySlot` are similarly index-free despite being queried by exactly the fields you'd expect (`user_id`, `booking_id`, `wallet_id`). Everywhere else, indexing is deliberate and reasonably thorough (16 `@@index`/composite-`@@unique` declarations across the Passport/Project/Deliverable models).
- **Unbounded-growth tables with no retention or archival**: `Notification`, `ActivityEvent`, `AdminAuditLog`, `BookingMessage`, `WalletTransaction` — none have a TTL, archival job, or cascade-delete path. No cleanup job exists anywhere in the codebase for any of them.
- **Migration state**: 28 timestamped migrations under `prisma/migrations/`, actively used via `prisma migrate dev` (not just `db push`) as the day-to-day workflow. **Currently live discrepancy**: the working-tree `schema.prisma` has three uncommitted fields (`Deliverable.visibility`, `ProjectCredit.is_public`, `SessionLog.testimonial_public` — added this session via `prisma db push`) with **no corresponding migration file yet**. This is the schema-vs-migration-history drift pattern to watch for at scale — `db push` is safe for solo local dev but silently diverges migration history from actual DB state if used casually in a team/CI context.
- **Multi-tenancy**: `studio_id` is a required FK on every studio-operational model (`Room`, `Engineer`, `ServiceOffering`, `AvailabilitySlot`, `Booking`, `StudioStaff`, `StudioAnnouncement`, `StudioCircleMember`). Financial/creative-work models (`Payment`, `SessionLog`, `Deliverable*`, `BookingMessage`, `Project*`) are *not* directly studio-scoped — they're reached only by traversing through `booking.studio_id` or are legitimately cross-studio by design (a `Project` belongs to a `Producer`, never to a `Studio`). No schema-level guarantee exists for this scoping — it depends on every controller getting the join right.
- **Seed data** (`prisma/seed.ts`, 412 lines): idempotent (upsert-based throughout, gated wallet-funding, conditional demo-room cleanup). Creates 2 studios, 5 rooms, 5 engineers, 9 services, 6 users, 1 seeded artist + 1 producer. No bookings/notifications/deliverables are seeded.
- **JSON fields**: `AdminAuditLog.metadata`, `ArtistPassport.creative_dna`/`social_links`, `ProducerPassport.genres_produced`/`signature_tags`, `Track.tags`, `Notification.payload`, `ActivityEvent.payload`. Three of these (`genres_produced`, `signature_tags`, `Track.tags`) hold plain string arrays that could be native Postgres `String[]` (used elsewhere in the same schema) — a minor typing inconsistency, not a defect.

## 4. Authentication Implementation

- **JWT** (`auth.controller.ts:32-36`): `jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: '7d' })`. HS256 (default, no explicit algorithm pinning). Payload carries only `sub` + `role` — no `studio_id`, no `jti`, no device fingerprint.
- **One secret, three jobs**: `JWT_SECRET` signs the main auth token, signs the 5-minute MFA challenge token, *and* is SHA-256-derived into the AES-256-GCM key that encrypts TOTP secrets at rest (`lib/totp.ts:9`). A single leaked secret compromises all three simultaneously.
- **No refresh tokens.** Access-token-only, 7-day fixed expiry, not configurable via env.
- **Password hashing**: `bcryptjs`, cost factor 10, hardcoded (`auth.controller.ts:47,185`). Server-side strength requirement is `min(8)` only — no complexity rules, no breach-list check, no max-length cap before hashing.
- **MFA**: custom TOTP implementation (HMAC-SHA1, 30s period, ±1 step window, `crypto.timingSafeEqual` for comparison — good practice). **Enforced for `OIANO_ADMIN` only** — every other role (`STUDIO_ADMIN`, `ENGINEER`, `ARTIST`, `PRODUCER`) has no MFA path at all. **No backup codes / recovery mechanism** if an admin loses their authenticator device.
- **Password reset: does not exist.** No `/forgot-password` or `/reset-password` route anywhere. Email infrastructure (`email.service.ts`, SendGrid config already in `.env.example`) exists but isn't wired to any recovery flow. This is the single largest authentication gap for a public launch.
- **Session/token revocation: does not exist.** No blocklist, no `jti` tracking, no session table. "Logout" is purely client-side storage clearing — a captured token remains valid for its full 7-day life regardless of logout, password change, or a reported compromise. No concurrent-session limit either (structurally impossible to enforce without a session registry).

## 5. Authorization Implementation

- `middleware/auth.middleware.ts` (31 lines, entire file): `authenticate` verifies the JWT and sets `req.userId`/`req.userRole`; `requireRole(...roles)` is a pure string-membership check. Ownership logic is deliberately **not** in this file.
- `lib/resourceAuthorization.ts` (49 lines, entire file) centralizes ownership/state-transition checks: `canAccessBookingMessages`, `canManageOwnedProject`, `canArtistActOnProject`, `isConsentTransitionAllowed`, `isRightsTransitionAllowed`, `ownershipSharesAreValid`. This module is well-scoped and has real unit-test coverage (`resourceAuthorization.test.ts`) — but it's **opt-in per route**, not enforced by any shared middleware. `payments.routes.ts:43-46` does its own inline ownership check instead of using it, for example — the pattern exists but isn't mechanically guaranteed on every new route.
- **Studio-scoping**: `middleware/studioScope.middleware.ts` (23 lines, entire file). `resolveStaffStudio(userId)` runs a **fresh Prisma query on every single request** that needs studio context — no caching, no studio_id embedded in the JWT. Correctness is fine (always authoritative), but it's a guaranteed extra DB round-trip per studio-scoped request, on every route that needs it. A `STUDIO_ADMIN`/`ENGINEER` with no `StudioStaff` row gets a clean 403, not a data leak — the safe failure mode.

## 6. Account Model

Single `User` table with a `role` enum (`ARTIST | PRODUCER | STUDIO_ADMIN | ENGINEER | OIANO_ADMIN`), plus separate optional 1:1 "profile" tables (`Artist`, `Producer`, `StudioStaff`, `Engineer`) holding role-specific data. This is a hybrid model — one shared identity/auth table, not fully separate tables-per-role and not one flat table either. Nothing in the schema prevents a single `User` from holding more than one profile relation at once; `role` is presumed to govern which UI/permissions actually apply, but that presumption isn't schema-enforced.

## 7. Studio / Workspace Model

`Studio` is the tenant row. Staff access is via `StudioStaff` (`user_id` is `@unique` on this join table — **a hard one-to-one, not many-to-many**, despite the join-table shape). This directly determines the answer to §8 below. `Room`, `Engineer` (bookable resource), and `ServiceOffering` all belong to exactly one `Studio`. `SINGLE_STUDIO_MODE = true` is set in `packages/shared/src/constants.ts:2-3` and is actively enforced at boot (`index.ts`), but the database and parts of the route logic (`OIANO_ADMIN` cross-studio queries in `bookings.controller.ts`) already operate as if more than one studio exists — the codebase has organically outgrown its own stated single-studio invariant.

## 8. User-to-Studio Relationships

**Currently hard-locked to one studio per staff user.** `StudioStaff.user_id @unique` means a `STUDIO_ADMIN` or `ENGINEER` login can belong to exactly one `Studio`, ever, in the current schema — there is no join structure that would let a real person staff two studios with one account. This directly contradicts one of the audit's stated scale assumptions ("Producers/engineers may collaborate across multiple studios") and would need a schema change (turning `StudioStaff` into a true many-to-many, or introducing a separate per-studio-membership row keyed by `(user_id, studio_id)`) before that assumption can be true. Artists and Producers are not studio-scoped at all — they operate independently of any single studio and reach studios only through `Booking`/`Project` relations.

## 9. Sessions (Bookings)

`Booking` is the central transactional model — required `studio_id`, `artist_id`, `room_id`, `service_id`, optional `engineer_id`/`preferred_engineer_id`/`project_id`. `SessionLog` (1:1) holds post-session notes/ratings; `BookingMessage` holds the booking's chat thread. Booking creation runs a room/time overlap conflict check and a wallet-balance gate before allowing the write (`bookings.controller.ts`) — both currently unindexed hot paths (§3). Status lifecycle (`PENDING → CONFIRMED → IN_PROGRESS → COMPLETED / CANCELLED / NO_SHOW`) is enforced by an `enum`, and the newly-built `POST /bookings/:id/complete` endpoint (this session's work) is now the canonical path for completing a session with deliverables/credits/rights/notes together.

## 10. Projects

`Project` belongs to a `Producer` (required) and optionally an `Artist`, tracked through a `ProjectPhase` enum (`PRE_PRODUCTION → ... → DELIVERED`). Never studio-scoped. Carries `ProjectMessage` (cascade-deletes with the project), `ProjectParticipant` (external/internal collaborators), `ProjectCredit`, `RightsAgreement`/`RightsShare`, and `PromotionalConsent`. Most of `producer.routes.ts` (541 lines, entirely inline logic, no separate controller) is dedicated to this model and is one of the more thoroughly Zod-validated files in the backend, including a `.superRefine()` for the rights-split-must-sum-to-100 business rule.

## 11. Files

Two separate, not-yet-unified file systems:
- **`ArtistFile`** — a general per-artist library (`name`, `url`, `mime_type`, `size_bytes` (nullable, not enforced), `folder` free-text path, `source: "daw_watcher" | "manual"`). No index on `artist_id`.
- **`Deliverable` / `DeliverableVersion` / `DeliverableReview`** — a booking-scoped, versioned delivery record (immutable version history, artist approve/change-request workflow). `Deliverable.visibility` (`PRIVATE | STUDIO_ONLY | PASSPORT_PUBLIC`) was added this session and is not yet migrated (see §3).
- **Storage backend**: Cloudflare R2 (S3-compatible), local-disk fallback if R2 env vars aren't set. **Uploads are buffered fully in memory** (`multer.memoryStorage()`) when R2 is active, not streamed — capped at 10MB per file, MIME-type-only filtering (no magic-byte verification). Public URLs from R2 are **direct, non-expiring bucket URLs**; at least one file-access path goes through a ticket-gated proxy route instead (mixed pattern — not fully confirmed which upload types use which). **No storage-quota concept exists anywhere** — no per-artist or per-studio cap, tracked or enforced.
- Per the repo's own `docs/TEST_READY_V1_AUDIT.md`: the R2 production code path has never been live-exercised end-to-end (only typechecked, no R2 credentials in dev) — flagged there as an open risk (KI-01), independently corroborated by this pass.

## 12. Credits

`ProjectCredit` — `credited_name`, `role` (free string, not an enum at the DB level despite a fixed set of values enforced by Zod at the API layer), `scope`, optional `participant_id` link, `status` (`DRAFT | CONFIRMED | DISPUTED`, free string), `is_public` (added this session, always `false` unless the credited party's own later action flips it — see previous session's completion-screen work). Indexed on `(project_id, status)`.

## 13. Artist / Producer Passport

`ArtistPassport` and `ProducerPassport` are separate 1:1 models (each `@unique` on the owning artist/producer). `ArtistPassport` carries `creative_dna` (Json: genres/influences/vocal/energy) and `social_links` (Json), plus a `passport_code` (unique) and view-tracking via `PassportView` (deduped per viewer/day, cascade-deletes with the passport). `ArtistRelease` (indexed on `(artist_id, release_date)`) holds shown-on-passport releases. CLAUDE.md documents an `ai_summary`/`ai_summary_updated_at` caching pattern on this model — **not independently re-verified in this pass**; flagged as unconfirmed rather than asserted.

## 14. Pulse

Backed by `pulse.routes.ts` (mounted at `/api/studio/pulse`, 3 endpoints) — computed live on every request from `Booking`/`Payment`/`Room` queries scoped to the current studio and day, with no caching or precomputation layer. This is the route most explicitly flagged elsewhere in the codebase (`lib/prisma.ts` comment) as the reason the Prisma connection pool was raised from its default of 9 to 20 — Pulse's query fan-out is a known concurrency pressure point today, at current (low) scale.

## 15. Notifications

`notifications.routes.ts` (162 lines, entire file read): a `Notification` table (per-user, `type`/`title`/`body`/`payload` Json/`read_at`) plus a live SSE push layer. The SSE layer is **in-memory and single-process**: `const clients = new Map<userId, Set<Response>>()`. Clients authenticate via a short-lived (60s) signed ticket (EventSource can't send custom headers), reconnect with backoff on the frontend, and get a 25s server heartbeat. **This breaks the moment there is more than one API instance** — a notification triggered by a request landing on instance B will never reach a user whose SSE connection is open on instance A. No Redis pub/sub or other cross-instance fan-out exists; the commented-out Redis block in `docker-compose.yml` is the only acknowledgment of this in the codebase. `Notification` itself has no index despite being queried by `(user_id, created_at desc)` on every load.

## 16. Activity / Event Records

`ActivityEvent` (type + optional `artist_id` + Json `payload`, indexed on `type` and `artist_id` separately, not compositely) is a generic append-only log, fed by `emitActivityEvent(...)` calls scattered through controllers. Consumption is a single synchronous in-process listener (`services/clockActivityConsumer.ts`) that just `console.log`s — no queueing, no retry, no downstream processing. `AdminAuditLog` is a separate, better-indexed (`(actor_id, created_at)`, `(action, created_at)`) audit trail specifically for privileged admin actions. Neither has any retention/archival policy (§3).

## 17. API Routes

**28 routers, ≈146 endpoint registrations**, all mounted in `app.ts:101-133`. Full inventory:

| Router | Mount | Endpoints | Auth |
|---|---|---|---|
| auth.routes.ts | /api/auth | 5 | mixed, rate-limited |
| passport.routes.ts | /api/passport | 14 | auth |
| stats.routes.ts | /api/passport/stats | 1 | auth |
| pulse.routes.ts | /api/studio/pulse | 3 | auth |
| studio.routes.ts | /api/studio | 4 | **public** |
| availability.routes.ts | /api/availability | 1 | **public** |
| bookings.routes.ts | /api/bookings | 10 | auth |
| messages.routes.ts | /api/bookings/:id/messages | 2 | auth |
| project-messages.routes.ts | /api/projects/:id/messages | 3 | auth |
| artist-review.routes.ts | /api/bookings/:id/artist-review | 1 | auth |
| payments.routes.ts | /api/payments | 3 | auth |
| admin.routes.ts | /api/admin | 9 | auth (STUDIO_ADMIN) |
| discover.routes.ts | /api/artists/discover | 1 | auth |
| files.routes.ts | /api/artists | 5 | mixed |
| artists.routes.ts | /api/artists | 9 | auth |
| webhooks.routes.ts | /api/webhooks | 2 | public, signature-verified |
| studio-clock.routes.ts | /api/studio-clock | 2 | auth |
| notifications.routes.ts | /api/notifications | 14 | mostly auth; `/stream` via ticket |
| network-exchange.routes.ts | /api/network-exchange | 1 | auth |
| feedback.routes.ts | /api/feedback | 3 | auth |
| studio-circle.routes.ts | /api/studio-circle | 5 | auth |
| engineers.routes.ts | /api/engineers | 4 | auth |
| card.routes.ts | /api/bookings | 1 | auth |
| producer.routes.ts | /api/producer | 23 | auth |
| connect.routes.ts | /api/connect | 5 | auth |
| artist-projects.routes.ts | /api/artist-projects | 4 | auth |
| artist-activity.routes.ts | /api/artist-activity | 1 | auth |
| maintenance.routes.ts | /api/maintenance | 10 | auth |

`discover.routes.ts` is deliberately mounted ahead of `artists.routes.ts` to avoid its `/:id` catch-all swallowing `/discover`.

**Input validation**: Zod `.parse()` is the dominant, consistently-applied pattern across bookings/admin/producer/payments. One confirmed exception: `studio-clock.routes.ts:143` does a raw `req.body as {...}` cast with no runtime validation — a real deviation from the codebase's own stated invariant, low severity (authenticated-only, non-critical field).

## 18. Background Processes

**None exist.** No cron, no job queue, no scheduled tasks anywhere in `apps/api/src`. The only two `setInterval`s in the entire backend are the rate-limiter's counter-pruning loop and the SSE heartbeat — both request-serving infrastructure, not background jobs. The Redis block in `docker-compose.yml` is commented out and explicitly labeled as a future notification-queue stub.

## 19. Storage System

Covered in depth in §11. Summary: Cloudflare R2 (S3-compatible) primary, local-disk fallback; memory-buffered uploads; 10MB cap; direct public URLs for most content; no quota system; production R2 path not live-verified per the repo's own known-issues doc.

## 20. Deployment Configuration

- **`render.yaml`** (68 lines, entire file read): defines two Render.com services — `oiano-api` (Node web service, `healthCheckPath: /health`, free plan, Oregon) and `oiano-web` (static site, SPA rewrite routing). Explicitly notes Prisma migrations are **not** run automatically on deploy — must be triggered manually.
- **No Dockerfile anywhere in the repo.**
- **No `.github/workflows/` — no CI/CD pipeline of any kind exists.** No automated test run, lint check, or build verification happens on push or PR today.
- `docker-compose.yml` is dev-only (a single Postgres 16 container; the Redis service is commented out). No API/web containers defined — this file cannot stand up the full stack.
- No `vercel.json`, `fly.toml`, `railway.json`, or `Procfile`.

## 21. Environment Configuration

`lib/env.ts` (11 lines, entire file): hard-required — `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`. Conditionally required — `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, only when `STRIPE_ENABLED === 'true'`. R2 vars are validated separately and non-fatally in `lib/r2.ts` (absence just falls back to local disk). Loaded via `dotenv.config({ path: '../.env', override: true })` from `apps/api/.env` specifically — not the repo-root `.env`. `.env.example` was reviewed and contains no real secrets (placeholders/empty strings throughout); `.env` is correctly gitignored, alongside two specifically-named one-off scripts (`run-migration-pg.js`, `update-passwords.js`) excluded with a comment referencing "the July 2026 credential audit" — evidence of a prior credential-handling incident, though current state reads clean.

## 22. Caching

**Does not exist.** No Redis, no `node-cache`, no memoization layer anywhere in `apps/api/src`. The only `Map`-based in-memory state are the rate-limiter's counters and the SSE client registry — both connection-tracking structures, not response/data caches. Every read in the system, including Pulse's per-request aggregate queries, hits Postgres directly, every time.

## 23. Logging

No structured logger (no winston/pino). Logging is `console.log`/`console.error`/`console.warn`, 23 occurrences across 9 files. The one exception is `middleware/error.middleware.ts`, which emits a structured JSON log line (`timestamp, requestId, method, path, statusCode, userId, userRole, studioId, message`, with `stack` only for 5xx errors) — this is the closest thing to structured logging in the codebase, and it's scoped to errors only. No request-level logging middleware (no morgan) — successful requests are never logged at all.

## 24. Analytics / Telemetry

**Does not exist.** Grepped for Sentry, Datadog, New Relic, Prometheus, OpenTelemetry across the entire backend: zero matches for all five. No APM, no error-tracking service, no metrics endpoint (`/metrics` doesn't exist). `GET /health` is a static liveness check only — it does **not** verify database connectivity, so it would report healthy even with Postgres unreachable.

## 25. Error Handling

`middleware/error.middleware.ts` (50 lines, entire file): `ZodError` → 400 with issue details; `AppError` → its own status code; everything else → generic 500. **No response, of any error type, ever leaks a stack trace or internal detail to the client** — stack traces go to the server-side structured log only, and only for 5xx. Every response and log line carries a `requestId` for correlation (`middleware/requestId.middleware.ts`). Prisma errors are not specially handled at the middleware level — individual routes catch specific Prisma error codes (e.g., `P2002`) themselves where needed; anything uncaught falls through to the generic 500.

## 26. Rate Limiting

Custom in-process implementation (`middleware/rateLimit.middleware.ts`, 73 lines, entire file) — no external library. Sliding-window counter in a plain `Map`, keyed by IP, pruned every 5 minutes. **Applied only to `auth.routes.ts`** (`/signup`, `/login`, `/mfa/verify`, `/enter` — 10 req/min). **No rate limiting exists on any other route** — bookings, payments, file uploads, the SSE stream endpoint, and every other of the ~140 remaining endpoints are entirely unlimited. The limiter's state is per-process — it would not hold a shared limit across more than one horizontally-scaled API instance.

## 27. Existing Tests

- **Frontend (`apps/web`)**: zero test files, no test runner configured.
- **Backend (`apps/api`)**: exactly 2 test files — `lib/notificationStreamTicket.test.ts` and `lib/resourceAuthorization.test.ts` — both narrow unit tests of pure-function auth logic, run via Node's built-in `node:test` (`package.json` script `test:security`, which only globs `src/lib/*.test.ts`). **No controller, route, or integration-level test exists anywhere in the codebase.** There is no generic `"test"` script at all — only the security-scoped one.

---

## Quick-reference: what does not exist today

For a public launch at the scale described in the brief, these are the confirmed absences (not judgments — Phase 1 is mapping only):

- Password reset / account recovery flow
- Server-side token revocation, logout-everywhere, or any concurrent-session limit
- MFA for any role except `OIANO_ADMIN`, and no MFA backup codes even there
- A cache layer of any kind
- A background job queue or any scheduled/cron processing
- Cross-instance fan-out for SSE (notifications break silently under horizontal scaling)
- CI/CD of any kind (no automated tests, lint, or build checks on push/PR)
- A Dockerfile or containerized deployment path
- Rate limiting on anything other than the four auth endpoints
- Structured application logging or request logging (errors only, console-based)
- APM/error-tracking/metrics of any kind
- A storage-quota system for files
- Indexes on the `Booking`, `Notification`, `BookingMessage`, `WalletTransaction`, and `AvailabilitySlot` tables
- Retention/archival for any unboundedly-growing table (`Notification`, `ActivityEvent`, `AdminAuditLog`, `BookingMessage`, `WalletTransaction`)
- Multi-studio membership for a single staff account (`StudioStaff.user_id` is hard-unique)
- Route/controller/integration test coverage (2 unit test files total, backend only)
- A 404 page on the frontend
