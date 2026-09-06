# OIANO — Seamless Experience Audit

**Verified against `8562bae`, 2026-09-06. No code changed to produce this.**
Companions: [`OIANO_DIRECTION.md`](OIANO_DIRECTION.md) (what OIANO is),
[`OIANO_COMPLETION_BRIEF.md`](OIANO_COMPLETION_BRIEF.md) (self-operation).

---

## A. Executive assessment

**The domain layer is in better shape than the experience layer, and the gap between
them is the product problem.**

Underneath: money has one writer and balances, the Weave is clean, boundaries are
mostly honest, and as of this week a studio can onboard, be charged, and be paid
without an operator. That is a real operating system.

On top: **55 routes named after database tables.** `/projects`, `/bookings/:id`,
`/contributions`, `/workrooms`, `/passport`, `/connect/:artistId`. A creator arriving
with "I want to make a song" must translate that intention into OIANO's schema and
then walk it themselves.

Three findings define the work:

1. **There is no next-best-action for creators.** The only deterministic guidance
   surface, Pulse, is `requireRole('STUDIO_ADMIN')`. `getNextAction()` exists but is
   AI-gated behind `OIANO_AI_ENABLED` (false in `render.yaml`) *and* scoped to a single
   booking. The operator is guided; the creator is not.
2. **The command layer exists and points the wrong way.** `CommandPalette.tsx` has
   **17 `navigate()` calls and 1 API call**. Its labels are destinations — "Calendar",
   "Runsheet", "Facilities" — not outcomes. The surface is right; it invokes routes
   where it should invoke capabilities.
3. **The Passport counts work that has not happened.** See §D — this is an evidence
   integrity defect, not a UX one, and it is the most urgent item in this document.

The correct response is not a rewrite. It is a thin intent/context layer above domains
that are already separate, plus one integrity fix.

---

## B. Current architecture map

```
apps/web  50 pages · 55 routes · React Query per page, no shared context layer
    │
    │  axios instance (lib/api.ts) — auth header, 401 logout, 409 studio-select
    ▼
apps/api  33 route modules → controllers → lib/* domain services
    │
    ├── lib/financialLedger.ts   ONLY writer of money (double-entry, idempotent)
    ├── lib/studioPayout.ts      settlement; reserves in-ledger to block double payout
    ├── lib/bookingCompletion.ts one owner for "a booking completed"
    ├── lib/sessionLog.ts        one owner for the session log
    ├── lib/weave/sync.ts        Node / Connection / Evidence projection
    └── lib/activityEvents.ts    7 durable event types + in-process bus
    ▼
Postgres  56 models · 18 migrations
    ▼
Stripe (checkout live, Connect built-unverified) · R2 · SendGrid — all gated off
```

**Frontend has no context layer.** `DashboardPage.tsx` is **812 lines** stitching
**8 independent queries** (`me`, `bookings`, `wallet`, `passport`, `studio`,
`notifications`, `artist-activity`, `studio-announcement`) and assembling meaning in
the browser. Every page that needs a picture of the user's world rebuilds it.

---

## C. Domain boundary map — what owns what

| Truth | Owner | Health |
|---|---|---|
| Money | `lib/financialLedger.ts` — sole writer | **Strong.** No pricing arithmetic anywhere in `apps/web` (verified: zero matches) |
| Payout settlement | `lib/studioPayout.ts` | **Strong.** Double payout blocked by ledger movement, not a lock |
| Booking completion | `lib/bookingCompletion.ts` | **Strong.** One owner, three call sites |
| Session log | `lib/sessionLog.ts` | **Strong.** Atomic append (`ON CONFLICT`) |
| Relationships | Weave — projection, never source | **Strong.** Rebuildable |
| Activity | `activity_events` — 7 types | **Thin.** See §G |
| Creator identity | `Artist` / `Producer` / `Engineer` — three models | **Weak.** See §E |
| Next action | *nobody* | **Absent for creators** |
| Context ("where am I") | *the browser* | **Absent** |

---

## D. Journey friction map

### Artist — "I have a song I want to make"

| Stage | Reality |
|---|---|
| Arrive | `/enter` → onboarding: **Identity → Status → Calendar → Formation** |
| First value | **Good.** Step 4 creates a *real booking*, not a profile field |
| Then | Dropped at `/dashboard` — 8 queries, no stated next action |
| Find a producer | `/discover` or `/producers` — a separate destination they must know exists |
| Book | `/book` — **1003 lines, 7 tracked choices**, no wizard/step model |
| Pay | Wallet balance guard; top-up is another surface |
| Session → files → revision | `/bookings/:id`, `/workrooms`, `/contributions` — three vocabularies for one piece of work |
| Evidence | `/passport` |

**Friction score: 6/10 (moderate-high).** Onboarding genuinely reaches first value —
that is better than most systems at this stage and should be protected. Everything
*after* onboarding reverts to navigation: the creator must know which of 55 routes
corresponds to their intention.

**Worst single moment:** after onboarding's booking, the creator lands on a dashboard
that reports state but never says what to do next.

### Producer — "I want to work and get paid"

**Friction score: 7/10 (high).** `/producer`, `/producer/passport`,
`/producer/projects/:id`, `/contributions`, `/contributions/:id/workspace`,
`/workrooms`, `/connect/:artistId`. Contribution, workroom and project are three
words for overlapping ideas. No inbound opportunity surface — a producer cannot see
"work available to me", only work already assigned.

### Studio — "I want my studio working"

**Friction score: 4/10 (lowest).** Pulse, Runsheet, Facilities, `/admin` are genuinely
operational and Pulse *does* provide deterministic guidance. **The operator is the
best-served user in the product.** That is precisely backwards for a creator platform.

### The finding that outranks the rest

`passport.routes.ts` lines 115 and 226 select bookings with
`status: { in: ['CONFIRMED','IN_PROGRESS','COMPLETED'] }` and then report
`sessions: artist.bookings.length` on the **public** passport (lines 161, 244).

**A booking confirmed for next month is counted as a completed session, publicly.**
`profile_strength` rewards it too. This is fabricated evidence — the one thing
`OIANO_DIRECTION.md` says the product must never do — and it is a five-line fix.

---

## E. Complexity / entanglement audit

| Issue | Severity | Evidence |
|---|---|---|
| Public passport counts unperformed work | **Critical** | §D |
| Role conditionals scattered through UI | High | **41 occurrences across 17 files**; `BookingDetailPage.tsx` alone has 9 |
| No context layer; pages re-derive world state | High | Dashboard: 812 lines, 8 queries |
| Three creator models for one person | Medium | `Artist`, `Producer`, `Engineer` each carry own `name`/`bio`/`avatar_url` (AUD-018) |
| Overlapping vocabularies | Medium | contribution / workroom / project / connection |
| `getNextAction` AI-first | Medium | Disabled by flag ⇒ no guidance at all |
| Free-text statuses | Low | Guards centralised in `resourceAuthorization.ts` |

**Notable strength:** no business-critical money logic in the frontend. Searching
`apps/web` for pricing arithmetic returns **zero** matches. That boundary held.

---

## F. Adoption loop audit

```
DISCOVER → UNDERSTAND → JOIN → FIRST WIN → CREATE → PROVE → SHARE → RETURN → INVITE
   ok         ok         ok      ✅ good     ok      ⚠️      ❌       ❌        ❌
```

- **FIRST WIN works** — onboarding ends in a real booking.
- **PROVE is compromised** — the passport overstates (§D).
- **SHARE is a dead end** — `/p/:code` renders a public passport, but nothing prompts
  a creator to share it and nothing converts a visitor.
- **RETURN has no trigger** — no next-action, no re-engagement surface for creators.
- **INVITE exists only for studio staff** (`/accept-studio-invite`). A creator cannot
  invite a collaborator into the product.

**The loop breaks after PROVE.** Everything before it is stronger than expected.

---

## G. Event / activity architecture

Existing: 7 past-tense types in `lib/activityEvents.ts` — `profile.created`,
`status.changed`, `session.booked`, `session.completed`, `booking.confirmed`,
`booking.cancelled`, `payment.received`. Durable in `activity_events`, plus an
in-process bus. **Notification, not event sourcing** — relational tables stay
authoritative. Consumers are log-and-forward only.

**Missing from the brief's canonical set:** `PROJECT_CREATED`, `COLLABORATOR_JOINED`,
`FILE_UPLOADED`, `VERSION_CREATED`, `MIX_READY`, `DELIVERABLE_APPROVED`,
`CREDIT_CONFIRMED`, `PROJECT_COMPLETED`, `PASSPORT_EVIDENCE_ADDED`.

**Structural limits:** `ActivityEvent.artist_id` is a hard FK, so a studio- or
producer-only event has nowhere to go; there is no `version`, `actor`, or
`correlation_id`. Adding events without fixing the subject shape will entrench it.

**Recommendation:** widen the subject (`subject_type` + `subject_id`, the polymorphic
convention already used by `ProjectParticipant` and `WeaveEvidence`), add `version`
and `actor_id`, then add events. An outbox is **not** justified at this scale —
in-process emission plus durable rows is sufficient, and the upgrade path is intact.

---

## H. Seamless experience architecture

```
INTENT        "continue Midnight Rain" · "I need somewhere to record"
   │          ← CommandPalette, already built, currently navigating
CONTEXT       GET /api/context — one call: who, what's moving, what's owed, what's next
   │          ← does not exist; the browser does this in 8 queries
NEXT ACTION   deterministic rules over domain state (NOT AI-first)
   │          ← getNextAction is AI-gated and disabled
ORCHESTRATION intent handlers that call domains in sequence
   │          ← does not exist
DOMAINS       projects · booking · sessions · payments · files   (already separate — keep)
   │
EVENTS        canonical, versioned, subject-agnostic
   │
PROJECTIONS   Home · Pulse · Passport · Weave
```

**The orchestration layer must not become a god service.** `START_SONG` sequences
project creation, discovery, booking and payment by *calling* those domains — it never
absorbs their rules. The test: deleting the intent layer must leave every domain
independently usable, exactly as they are today.

---

## I. Infrastructure gap matrix

| Gap | Severity | User impact | Risk | Effort | Depends on | Action |
|---|---|---|---|---|---|---|
| Passport counts unperformed bookings | **Critical** | Trust destroyed if noticed | Low | XS | — | **FIX NOW** |
| No creator context endpoint | High | Every page rebuilds the world | Low | S | — | BUILD |
| No deterministic next-action | High | No sense of progress | Low | M | context | BUILD |
| Command palette navigates, not acts | Medium | Intent unusable | Low | M | capabilities | REFACTOR |
| Event subject is artist-only FK | Medium | Blocks canonical events | Medium | S | — | REFACTOR |
| Missing canonical events | Medium | Projections can't be built | Low | M | subject fix | BUILD |
| No creator invite | Medium | Loop can't close | Low | S | — | BUILD |
| Three creator models | Medium | Duplicate identity | **High** | L | — | DEFER |
| Role conditionals in UI | Low | Maintenance | Low | M | — | SIMPLIFY |
| No React component tests | Low | Regression risk | Low | M | — | BUILD |

---

## J. Disposition

**KEEP** — financial ledger, payout reservation, Weave, `bookingCompletion`,
`sessionLog`, `studioOnboarding`, Pulse, onboarding-to-first-booking, the axios
boundary, CI.

**HARDEN** — passport evidence (§D); event subject shape.

**SIMPLIFY** — role conditionals; contribution/workroom/project vocabulary.

**CONNECT** — context endpoint; next-action; canonical events → projections.

**REFACTOR** — command palette to capabilities; dashboard to consume context.

**REPLACE** — nothing.

**BUILD** — creator invite; share prompt; component tests.

**DELETE** — nothing. No dead subsystem found.

---

## K. Migration plan

Every step additive and independently revertable.

1. **Fix passport evidence.** Restrict counted sessions to `COMPLETED`. Backwards
   compatible; numbers go *down*, which is the point.
2. **Add `GET /api/context`** alongside existing endpoints. Nothing consumes it yet.
3. **Add deterministic next-action** inside context. No AI, no flag.
4. **Dashboard consumes context** — one query replaces eight. Old endpoints stay.
5. **Widen event subject** (`subject_type`/`subject_id`, `version`, `actor_id`),
   backfilling existing rows to `subject_type='ARTIST'`.
6. **Emit the missing events** at existing domain write points.
7. **Palette invokes capabilities** — labels become outcomes.

---

## L. Test plan

Journey-level E2E on fresh Postgres, mirroring the existing integration suite:
signup → first booking; booking → payment → session → deliverable → approval;
producer contribution → credit; project → completion → **passport evidence reflecting
only completed work**; failed payment recovery; duplicate webhook; concurrent booking;
studio switching.

Domain unit coverage stays as-is. Every new assertion **mutation-checked** — reintroduce
the bug, watch it fail. That discipline has caught two bad tests of mine this session.

---

## M. Adoption instrumentation

Derive from the canonical events; do not add frontend analytics.

**Time to First Value** (signup → first booking) · **Time to First Work**
(→ session completed) · **Time to First Proof** (→ evidence) · **Repeat Work Rate** ·
passport share → visitor → signup.

---

## N. Prioritized backlog

**P0** — Passport evidence fix (`passport.routes.ts:115,226`).

**P1** — `GET /api/context`; deterministic next-action; dashboard consumes it.

**P2** — Event subject widening + canonical events; palette → capabilities;
creator invite; share prompt.

**P3** — Unified creator object (schema-heavy, defer); role-conditional cleanup;
component tests; AI *explaining* next-actions it did not invent.

---

## O. First implementation slice

**Smallest slice proving the whole model end to end:**

> A creator opens OIANO. One call returns their context. It names one meaningful next
> action derived from real domain state — *"Your session at Northside is tomorrow at
> 18:00. Confirm you're coming."* They act. A canonical event is recorded. The
> projection updates. They see progress.

Touches every layer — intent, context, deterministic action, domain call, event,
projection, UI — while adding **one endpoint and one card**. If this feels right, the
model is right. If it feels like another widget, stop before building more.

**Do not start it before the P0 fix.** A next-action surface built on a passport that
counts work nobody did makes the wrong number more visible.

---

## Final test, answered honestly

1. Reduces creator work? — *Not yet. Today OIANO asks the creator to navigate it.*
2. Progress visible? — **No.** State is visible; progress is not.
3. Can OIANO infer instead of ask? — **Largely yes, and it doesn't.**
4. Exposing internal concepts? — **Yes.** 55 routes named after tables.
5. Domains independently understandable? — **Yes.** Genuinely good.
6. Trustworthy evidence? — **Not currently** (§D).
7. Failure recoverable? — Partly; payouts yes, uploads unproven.
8. Contributes to repeat activity? — **No trigger exists.**
9. Sensible at 10×? — Domains yes; 55 hand-maintained routes no.
10. **Remove the navigation menu — could a user still do what they came for?**
    **No.** That is the whole finding.
