# OIANO Intelligence Layer — Stage 1 Architecture Audit

**Scope of this document**: Stage 1 only, per explicit instruction. No implementation code in this pass. This is the architecture audit, the data-relationship trace, the safe-context analysis, the risk list, the must-not-change list, the proposed integration boundary, and the proposed file-change map — nothing has been built yet.

**Method**: grounded in direct inspection of the running repository (schema, routes, controllers, middleware, existing tests, existing AI code) plus this session's own `CURRENT_ARCHITECTURE.md`, which already covers much of the same ground for a separate audit — cross-referenced rather than re-derived where they overlap.

---

## 0. The one finding that changes the plan

**There is already an AI integration in production.** `apps/api/src/services/ai-summary.service.ts` generates an "artist brief" via a direct `fetch()` to `https://api.anthropic.com/v1/messages` (model `claude-haiku-4-5-20251001`), wired into `GET /api/artists/:id/summary` and cached on `ArtistPassport.ai_summary` / `ai_summary_updated_at`. It is:

- A raw `fetch` call, no SDK, no provider abstraction.
- **No timeout** — can hang indefinitely on a slow/stuck response.
- **No response schema validation** — returns whatever text comes back.
- **No retry, no rate limiting, no telemetry.**
- The API key is read inline via `process.env.ANTHROPIC_API_KEY` with no centralized validation (it's absent from `env.ts`'s required-vars list — the app boots fine with or without it, and the route just throws at call time if it's missing).

This is exactly the anti-pattern Stage 2 of the brief asks the new architecture to avoid ("do not scatter direct model/API calls throughout existing routes and components"). It is **live, working, and out of scope for V1** — none of the three requested capabilities (Next Action, Session Summary, Navigation Intelligence) require touching it, and Stage 10's "protect the existing application" rule means it should not be refactored just to make the new architecture tidier. It's documented here because:

1. It's the reason `ANTHROPIC_API_KEY` already exists as a real, working env var in this environment — the new layer reuses it rather than introducing a second key.
2. It's proof the team is already comfortable with Claude, Haiku specifically, and a cache-on-the-model-row pattern — useful precedent to follow, not fight.
3. It's a visible example of what "ungoverned" looks like, which makes the contrast with the new provider abstraction concrete rather than theoretical.
4. It's a natural (but explicitly *not V1*) future candidate to migrate onto the new provider once the new architecture is proven — noted as a fast-follow, not a task.

The good precedent this same code establishes and that V1 should preserve: `ArtistPassport.ai_summary_public` (the artist must opt in before AI-generated text about them goes public) and `ai_summary_edited` (the artist can overwrite/correct the AI's output, and the system remembers they did). Both are exactly "Oiano owns truth, AI owns suggestions" already lived out in shipped code — good signal that this pattern will feel native, not bolted on.

---

## 1. Architecture inventory

*(Full detail already captured in `CURRENT_ARCHITECTURE.md` §1–§8; summarized here with the specific facts this project needs.)*

- **Frontend**: React 18 + Vite, `apps/web/src`. Role-gated routing via `RequireAuth` in `App.tsx`. A single `CommandPalette.tsx` exists today as a **static, hardcoded, role-filtered action list** (Cmd+K style) — no ranking, no dynamic scoring of any kind. This is the most natural home for "Navigation Intelligence" to eventually influence prominence, without inventing a new UI surface.
- **Backend**: Express + Prisma, `apps/api/src`. Convention is `routes/` (mostly fat, inline logic) + a thin `controllers/` (2 files) + `services/` (business/integration logic — `email.service.ts`, `ai-summary.service.ts`, `studio-circle.service.ts`, `clockActivityConsumer.ts`) + `lib/` (pure utilities) + `middleware/`. **The new intelligence layer should live under `apps/api/src/intelligence/`, following the `services/` convention** — not a `server/` root, which doesn't exist in this monorepo.
- **Auth**: Stateless JWT (`{ sub: userId, role }`, HS256, 7-day expiry), `authenticate` middleware sets `req.userId`/`req.userRole`. `requireRole(...)` for coarse role gates. `resourceAuthorization.ts` (`lib/`) centralizes fine-grained ownership checks (booking-message access, project ownership, consent/rights state-transition guards) — **this is the correct existing authority to consult for "can this user see this entity," and the intelligence layer must call into it rather than re-implement permission logic.**
- **Studio scoping**: `resolveStaffStudio(userId)` — fresh DB lookup per request, no caching, respects the newly-added multi-studio-membership model (`StudioStaff` is now a real `(user_id, studio_id)` join, not 1:1).
- **Database**: PostgreSQL via Prisma, 39+ models. Central transactional entity is `Booking`. Migration workflow is `prisma migrate dev`, though a **known, partially-unresolved gap** exists where several historical migrations don't cleanly replay from empty (documented separately) — irrelevant to this feature except that any new intelligence-layer schema field should go through `migrate dev` normally like anything else, not `db push`, to avoid adding to that debt.
- **Feature-flag convention**: there is no feature-flag *service* in this codebase. The only precedent is a plain env-var boolean, checked inline: `process.env.STRIPE_ENABLED === 'true'`, used in exactly two places (`lib/env.ts`'s conditional validation, `maintenance.routes.ts`'s status check). **`OIANO_AI_ENABLED` etc. should follow this exact pattern** — no new flag library, no LaunchDarkly-style abstraction; that would be architecture the codebase doesn't otherwise have.
- **Rate limiting**: one existing implementation, `middleware/rateLimit.middleware.ts` — in-process sliding-window `Map`, currently applied only to the four auth routes. **Reusable as-is** for the new AI endpoints (`rateLimit({ max, windowMs, message })`), no new rate-limiter needed.
- **Testing**: Node's built-in `node:test`, not Jest/Vitest. Exactly 2 test files exist today, both under `apps/api/src/lib/*.test.ts`, run via the `test:security` npm script which **only globs `src/lib/*.test.ts`**. This matters directly for Stage 11: if intelligence-layer tests live outside `lib/`, they won't be picked up by the existing test command unless the script is extended — flagged as a real decision point, not assumed away.
- **Existing background/async infra**: none. No job queue, no cron. The intelligence layer must be purely request-scoped (called inline from a route, awaited, with its own timeout) — there is no infrastructure to defer work to a background worker even if that were desirable later.
- **Existing caching precedent**: `pulse.routes.ts` runs an in-process `Map`-based 60-second TTL cache keyed by `studioId`, justified in its own comment ("each load fires 8 DB queries, so caching is a significant win"). **Directly reusable pattern** for caching AI responses (e.g., a Next Action suggestion doesn't need to be regenerated on every page load) — same shape, same tradeoffs, same file-local `Map`, no new dependency.

---

## 2. The data chain: Booking → Session → Project → Files → Credits → Pulse → Passport

This is the actual shape, traced through the real schema and controllers (not assumed):

```
Booking  (studio_id, artist_id, room_id, service_id, engineer_id?, project_id?)
   │
   ├── SessionLog (1:1)  — notes, quality_rating, artist_rating, artist_testimonial,
   │                       tracks_worked[], ai_summary (existing, separate field —
   │                       see §0), started_at/ended_at
   │
   ├── Deliverable[] (booking-scoped) — title, status, visibility
   │      └── DeliverableVersion[] — immutable, file_urls[], notes, version_number
   │      └── DeliverableReview[] — artist's approve/change-request decisions
   │
   └── Project? (optional FK — a Booking may or may not belong to a Project)
          ├── ProjectCredit[]  — credited_name, role, scope, status (DRAFT|CONFIRMED|
          │                      DISPUTED), is_public (only ever true via the credited
          │                      party's own later action, never set by staff)
          ├── ProjectParticipant[]
          ├── RightsAgreement[] → RightsShare[]  (PROPOSED|APPROVED|DISPUTED, never
          │                                        auto-approved)
          └── ProjectMessage[]

Pulse — NOT a stored entity. Computed live, per request, from Booking/Payment/Room
        aggregates scoped to studio + day/week (pulse.routes.ts), 60s cached.

ArtistPassport (1:1 with Artist, NOT with Booking/Project directly) —
        creative_dna (Json), ai_summary (existing, artist-bio field — distinct
        from SessionLog.ai_summary above), ai_summary_public, profile_strength.
        Reached from a session only by traversing Booking → Artist → Passport.
```

**Key structural facts that shape what "context" safely means here:**

- A `Booking` is the only node that directly touches almost everything else — it's the natural anchor for "Session Summary" and "Next Action" context-gathering, exactly as the brief's examples imply (review completed session, confirm credits, upload deliverables).
- `Project` is optional on `Booking` — a large fraction of sessions have **no** project, meaning no credits, no rights, no project messages exist to summarize. Any capability that reads project data must degrade gracefully to "no project" rather than erroring.
- Credits and rights are **never auto-confirmed by the system today** (this session's own recent work on the completion-screen enforces exactly this: `is_public` and `CONFIRMED` status can only be set by the credited party or project owner, never by staff, never automatically). The intelligence layer inherits this constraint directly — an AI suggestion to "confirm credits" is a *recommendation to a human*, never a trigger that could plausibly be confused with the real confirmation action.
- `SessionLog.ai_summary` (existing, currently unused as far as I found — no route reads or writes it) and `ArtistPassport.ai_summary` (existing, actively used, see §0) are **two different fields on two different models with the same name** — a naming collision worth knowing about so the new "Session Summary" capability doesn't accidentally look like it's reusing `SessionLog.ai_summary`'s storage when designing its own response shape (V1's Session Summary is explicitly request-time/read-only per Stage 7 — it does not need to persist anywhere yet, sidestepping this collision entirely for now).

---

## 3. Where AI can safely receive context

Three natural seams, in order of how directly they map to the requested V1 capabilities:

1. **A per-request context builder called from inside an already-authenticated, already-authorized route handler.** The handler has already run `authenticate` + `requireRole` + (where relevant) `resourceAuthorization.ts` checks before the intelligence layer is ever invoked — so the context builder's job is narrow: given an entity the *current request* has already proven access to, assemble a small structured object (not a raw Prisma row) for the specific capability. This means **the intelligence layer never makes its own authorization decision** — it only ever runs after Oiano's existing authorization has already run, for the exact entity the request is already scoped to.
2. **The existing `include`/`select` shapes already in use are the ceiling, not the floor.** e.g., `bookings.controller.ts`'s existing `getBookings`/`getBookingById` include shapes already define what a given role is allowed to see about a booking. The context builder should select a *strict subset* of those same fields — never a wider shape "because the AI might need it."
3. **Pulse's existing studio-scoped aggregate queries** are a ready-made, already-privacy-conscious source for "Navigation Intelligence" signal (what's actually busy/urgent right now) without needing new queries against raw booking/message data.

Concretely, for the three V1 capabilities:

- **Next Action**: context = one `Booking` (+ its `SessionLog`, `Deliverable` statuses, `Project`/`ProjectCredit` statuses if present) that the requesting user is already authorized to view, reduced to a small typed object (status enums, counts, booleans) — never raw notes/messages text unless a future capability specifically needs it.
- **Session Summary**: context = the same `Booking` scope, plus whatever message/file content the *current user's role* is already permitted to read (per `resourceAuthorization.canAccessBookingMessages` and the existing deliverable-visibility rules) — nothing wider.
- **Navigation Intelligence**: context = aggregate counts/signals only (how many pending items of each type, recency), sourced the same way Pulse already sources them — never individual records' content.

---

## 4. Security, privacy, and architectural risks

| Risk | Why it matters here specifically | Mitigation this architecture must enforce |
|---|---|---|
| Cross-tenant/cross-role leakage via AI context | The existing `ai-summary.service.ts` proves the pattern of "pass a Prisma object into a prompt" is already normalized in this codebase — easy to accidentally repeat with a wider object for a new capability | Context builder takes typed, capability-specific DTOs only, built *from* already-authorized query results, never raw Prisma model instances |
| AI response treated as fact | Booking/credit/rights state today is deliberately human-confirmed at every step (this session's own completion-screen work) | Strict output schemas (Stage 4) + the UI copy itself must read as a suggestion ("Next likely step," not "Next step") |
| Silent AI-driven state change | No existing route lets AI write anything today | V1 is contractually read-only (Stage 7) — no new capability gets a Prisma `.update()`/`.create()` call anywhere in its path |
| Hung/slow request blocking a normal page load | No timeout exists in the one precedent (`ai-summary.service.ts`) — a real, already-latent bug, not hypothetical | Provider abstraction enforces a hard timeout + fallback on every call, from day one, unlike the existing service |
| API key exposure | Key is currently read inline in a service file with no central validation | Server-side only (already true — nothing currently sends this key to the browser); centralize the read in one config module so there's exactly one place that ever touches `process.env.ANTHROPIC_API_KEY` |
| Rate/cost abuse | No existing AI route is rate-limited at all | Reuse `rateLimit.middleware.ts` on every new intelligence endpoint from the start |
| Prompt/context logging exposing user content | No existing logger is structured (console-based, per `CURRENT_ARCHITECTURE.md` §23) | Telemetry logs capability/confidence/entity-id/latency — never the prompt body or raw response text |
| Feature-flag-off not actually restoring old behavior | N/A today (no AI-dependent UI exists yet outside the artist-brief card) | Every new UI element must have a real, tested "capability disabled" render path that is visually identical to "capability doesn't exist" — not a broken/empty state |

---

## 5. Existing functionality that must not change

- `ai-summary.service.ts` and its `GET /api/artists/:id/summary` route — untouched, not migrated, not refactored in V1.
- `resourceAuthorization.ts`'s existing exported functions and their signatures — the intelligence layer *calls* these, never modifies them.
- `CommandPalette.tsx`'s existing static item list and behavior when Navigation Intelligence is absent/disabled — must render exactly as it does today.
- `Booking`/`Project`/`ProjectCredit`/`RightsAgreement` status-transition rules (who can set what, DRAFT→CONFIRMED, PROPOSED→APPROVED, etc.) — the intelligence layer reads these enums, never writes them.
- `pulse.routes.ts`'s existing cache/query shape — Navigation Intelligence may *read* Pulse's output, but does not modify how Pulse itself computes or caches.
- The existing `rateLimit.middleware.ts` behavior on the four auth routes — unaffected by adding new usages elsewhere.
- `env.ts`'s existing required-vars list — `ANTHROPIC_API_KEY`/`OIANO_AI_*` flags are additive and conditional (mirroring the `STRIPE_ENABLED` pattern), never promoted to hard-required, so the app continues to boot with zero AI configuration present.

---

## 6. Proposed integration boundary (adapted to this repo)

The brief's proposed `server/intelligence/...` tree doesn't match this monorepo (there is no `server/` root — the API lives at `apps/api/src`). Adapted:

```
apps/api/src/intelligence/
  intelligence.service.ts       # single entry point every route calls through
  intelligence.types.ts

  providers/
    provider.interface.ts       # generic "generate(prompt, schema) -> T" contract
    claude.provider.ts          # the only implementation in V1; wraps the SAME
                                 # Anthropic API ai-summary.service.ts already
                                 # calls, but with timeout/schema/telemetry —
                                 # NOT a rewrite of that file, a parallel,
                                 # properly-governed path for new capabilities

  capabilities/
    next-action.ts               # V1, Stage 5
    session-summary.ts           # Stage H (after Next Action is proven)
    navigation.ts                # Stage H

  schemas/
    next-action.schema.ts        # zod, matching the codebase's existing
    session-summary.schema.ts    # validation convention exactly (Zod is
    navigation.schema.ts         # already the only validation library used
                                 # anywhere in apps/api)

  policies/
    confidence.ts                # low-confidence → fail-safe-to-nothing
    context-limits.ts            # enforces "minimum necessary context" per
                                 # capability at the type level, not by convention

  context/
    context-builder.ts           # capability-specific builders, each one calling
                                 # existing authorized queries/resourceAuthorization
                                 # checks — never a new independent query path

  config.ts                     # the ONE place OIANO_AI_ENABLED / _NEXT_ACTION /
                                 # _SESSION_SUMMARY / _NAVIGATION / ANTHROPIC_API_KEY
                                 # are read from process.env, mirroring env.ts's
                                 # existing conditional-validation style
```

Deliberate deviations from the brief's literal proposal, and why:

- **No separate `permissions.ts`/`privacy.ts` policy files.** This repo already has one canonical authorization module (`lib/resourceAuthorization.ts`). Adding parallel `intelligence/policies/permissions.ts` would create two sources of truth for "can this user see this." The intelligence layer calls the existing module directly instead.
- **No `telemetry/intelligence-events.ts` as a persistent event system.** There is no event/analytics infrastructure in this codebase at all (`CURRENT_ARCHITECTURE.md` §24: no Sentry/Datadog/Prometheus/etc.) — inventing one just for AI telemetry would be exactly the "large uncontrolled implementation" Stage 10 warns against. V1 telemetry is a structured console log line (matching `error.middleware.ts`'s existing JSON-line convention), not a new event bus. Upgradeable later without touching the capability code, since it's called through one function.
- **`config.ts` added** (not in the brief's tree) because this repo's convention is a single small config-reading module per concern (`lib/env.ts` is the precedent) rather than scattering `process.env.OIANO_AI_*` reads across capability files.

---

## 7. Proposed file-change map (planning only — nothing built yet)

**New files** (all additive, zero risk to existing behavior by construction):
- `apps/api/src/intelligence/*` — the full tree above (config, service, provider, one capability: Next Action, per Stage 5's "implement one capability" ordering)
- `apps/api/src/intelligence/**/*.test.ts` — co-located, `node:test` style matching the two existing tests exactly

**Modified files** (small, additive touch points only):
- `apps/api/src/lib/env.ts` — add the conditional `OIANO_AI_ENABLED` block, mirroring the existing `STRIPE_ENABLED` block exactly (~4 lines)
- `apps/api/package.json` — extend `test:security`'s glob (or add a sibling script) so new tests actually run; exact choice is a Stage 3 decision, not made here
- **One** existing route (likely `bookings.routes.ts` / `bookings.controller.ts`, since `Booking` is the anchor entity) — add a single new `GET /api/bookings/:id/next-action` endpoint. Nothing existing in that file changes; this is a pure addition.
- `.env.example` — document the new flags (empty/placeholder values, matching existing convention)

**Frontend** (deferred until the backend capability is proven per Stage F — noted here only as the eventual shape): a small, non-modal UI element on `BookingDetailPage.tsx` reading the new endpoint, rendered only when `OIANO_AI_NEXT_ACTION` is on and the response validates — exact component TBD in Stage C/D, not designed yet.

**Explicitly not touched by any of the above**: `ai-summary.service.ts`, `resourceAuthorization.ts`'s internals, `pulse.routes.ts`'s computation logic, `CommandPalette.tsx`, any Prisma schema field (V1 needs no new persisted state — Next Action is computed fresh per request, not cached/stored).

---

## Summary

The codebase already has one working but ungoverned AI integration, a real (if minimal) feature-flag convention to extend rather than replace, an existing authorization module the new layer must defer to rather than duplicate, and no event/telemetry infrastructure to over-build against. The safest adaptation of the brief's proposed structure drops two speculative files (`permissions.ts`, `privacy.ts`, `intelligence-events.ts` as a system) in favor of calling what already exists, and adds one file (`config.ts`) the repo's own conventions actually call for. Next Action is the correct first capability per Stage 5/Step E — it has the narrowest context requirement (one `Booking` and its immediate children) and the clearest existing precedent to build the provider/schema/policy machinery against before Session Summary and Navigation Intelligence reuse it.

Ready for Stage 2 (or Step C's exact implementation plan) on your go-ahead — no code has been written.
