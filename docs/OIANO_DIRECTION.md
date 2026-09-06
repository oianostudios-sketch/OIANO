# OIANO — Direction and Working Map

**Status:** current as of commit `565227b`, 2026-09-06.
**Audience:** any agent or engineer picking up this repo — Codex, Claude, or a human.
**Read this before `AGENTS.md` or `CLAUDE.md`.** Those files are largely accurate on
*conventions* and substantially wrong on *facts*. Section 1 says exactly where.

---

## 1. Read this first: the shared instructions are stale

`AGENTS.md` and `CLAUDE.md` are near-identical copies of the same original brief.
They were written against a much smaller system and have not tracked it. Verified
against the tree at `565227b`:

| The docs say | Actually true |
|---|---|
| "Full 15-model schema" | **56 models** |
| Roles: `ARTIST \| STUDIO_ADMIN \| ENGINEER` | **5 roles** — also `PRODUCER` and `OIANO_ADMIN` |
| `model Passport` | `ArtistPassport` **and** `ProducerPassport` |
| `wallet.balance` | `Wallet.balance_usd` (Decimal) |
| "Fix `Dashboard.tsx`" (top P0) | **No such file.** Long since replaced |
| ~17 API endpoints | **33 route modules, 50 web pages** |
| Single studio, scope every query to `dreamz-music-lab` | **Multi-studio.** See §4 |

Of the 14 sampled "Open tasks", **13 are already implemented**. The list is a
historical record, not a work queue. Do not pick work from it.

### One instruction in those files is actively harmful

`AGENTS.md` / `CLAUDE.md` instruct, under `[P2]`:

```ts
import { SINGLE_STUDIO_MODE } from '@oiano/shared/constants';
if (!SINGLE_STUDIO_MODE) throw new Error('Multi-studio mode not yet supported');
```

`SINGLE_STUDIO_MODE` is **`false`** (`packages/shared/src/constants.ts:2`), because
the product genuinely became multi-studio. Implementing that assertion as written
**stops the API from booting**. It has not been implemented; leave it that way.

The multi-studio reality: `StudioStaff` is uniquely keyed on `(user_id, studio_id)`
so one person can staff several studios; `User.active_studio_id` selects which one a
request is scoped to; `studioScope.middleware.ts` resolves it and returns a `409
"Active studio selection required"` when a multi-studio user has not chosen one;
the web app has `/select-studio` and the shared axios instance redirects on exactly
that 409 and no other.

**What in those files is still correct and binding:** the frontend conventions
(§"Critical frontend patterns"), the error/validation contract (`AppError`, Zod on
every body, the `error.middleware` flow), the design tokens, and the ports. Treat
those as live. Treat the schema, roles, API surface and task list as expired.

---

## 2. What OIANO actually is

OIANO is not a booking tool. Booking is the cheapest verifiable unit of real work,
which is why it came first — not because scheduling is the product.

**OIANO is an operating system for creative work in which a person's standing is
derived from verified activity rather than claimed.**

Everywhere else, a producer's credibility is a list of assertions: a bio, a
follower count, a credit nobody checked. Here, the record is a by-product of work
that actually happened and that a second party confirmed. A session was booked,
delivered, and completed. A rights split was proposed and every named holder
approved it. A credit was offered and the credited person accepted it. Each of
those is a fact with a counterparty, and each leaves evidence.

That gives the system its loop:

```
WORK → EVIDENCE → CONNECTION → TRUST → LOWER FRICTION → CLEARER TRANSACTION → MORE WORK
```

Trust here is not a score. It is the accumulated, inspectable answer to
"why should I believe this?" — and the answer is always a row you can point at.

### Three definitions that are locked

- **A Node is a growing creative entity.** Artist or Studio today; Producer next.
  Keyed to the entity's own id, never to `User` — so one person controlling several
  creative identities gets several Nodes, which the schema already permits.
- **A Connection is a meaningful relationship between Nodes**, and it is only ever
  as real as the evidence behind it.
- **Evidence is why a Connection exists** — a specific domain record, not a summary.

`activity_count` on a connection means "worked together N times" and is backed by
one evidence row per occurrence. It is deliberately explainable. There is no opaque
relationship score anywhere in this system, and there should never be one.

### What OIANO is explicitly not becoming

No follower graph. No likes. No popularity ranking. No social feed. No decorative
network visualisation standing in for architecture. No AI-generated relationship
score. If a feature's value depends on a number nobody can account for, it is the
wrong feature for this product.

---

## 3. The space to become

Ordered by how much each depends on the layer beneath it. This is a direction, not
a backlog — none of it is scheduled.

1. **Portable professional record.** The evidence already exists; what is missing is
   the artifact a creative can take elsewhere. A passport that says "14 completed
   sessions across 3 studios, 4 confirmed credits, 2 approved rights splits" and can
   prove every line is categorically different from a résumé.
2. **Trust-priced friction.** A studio deciding deposit terms, or an artist deciding
   whether to prepay, is currently a judgement made blind. The relationship history
   is the input that makes that judgement cheap. Money must stay owned by the ledger
   (§5) — the Weave may *explain* a pricing decision, never *define* one.
3. **Discovery by real relationship.** "Engineers who have actually delivered work
   with artists like you" is answerable from evidence. "Recommended for you" is not.
4. **Multi-market operation.** Geo is already private-by-default and city-level. The
   market layer is what lets a Freetown studio and a London artist find terms.
5. **Skills / agentic assistance.** Only worth building on top of a domain whose
   truth ownership is clean. It is not clean enough yet (§6).

The through-line: **every one of these is a projection over evidence that already
exists.** None requires inventing a new kind of truth. That is the discipline —
when a feature seems to need a new authoritative fact, that is the signal to stop
and check whether it is really derivable.

---

## 4. The functioning structure

```
COMMAND            an HTTP request asking for a change
   ↓
DOMAIN RULES       validation, permission, state-machine guards
   ↓
AUTHORITATIVE FACT the row that owns this truth  ← everything below is derived
   ↓
EVENT / EVIDENCE   a durable record that it happened
   ↓
PROJECTION         rebuildable read models
   ↓
NETWORK CONTEXT    the Weave: who has worked with whom, and why
   ↓
UI / INTELLIGENCE  representation and suggestion
   ↓
ACTION             which becomes the next command
```

### Who owns which truth

| Truth | Owner | Never owned by |
|---|---|---|
| Booking / completion | `Booking` row; effects via `lib/bookingCompletion.ts` | the clock, the UI |
| Session record | `SessionLog` via `lib/sessionLog.ts` | the clock |
| Money | `FinancialTransaction` + `FinancialLedgerEntry`, written **only** by `lib/financialLedger.ts` | the Weave, the UI |
| Wallet | `Wallet` + `WalletTransaction` | anything else |
| Rights / consent | `RightsAgreement` / `PromotionalConsent`, settled by `agreementStatusFromDecisions` | read-side counters |
| Node identity | `Artist` / `Studio` — `WeaveNode.id` *is* their id | `User` |
| Connection meaning | `WeaveConnection` — a **projection**, never a source | — |
| Studio circle | `StudioCircleMember` — projection, full recompute from Booking | — |
| Operating state | `studio-clock.routes.ts` — **representation only** | it owns nothing |

### Projections and how to rebuild them

| Projection | Rebuild path |
|---|---|
| Weave (Node/Connection/Evidence) | `npm run db:backfill-weave` — idempotent, verified |
| `StudioCircleMember` | `syncStudioCircleMembership` — full recompute, self-healing |
| clock cache | 5s TTL, in-memory |
| `ArtistPassport.profile_strength` | `recalculatePortfolioScore` — recomputes, but private and per-artist only (§6) |
| `ProducerPassport.profile_strength` | **none** (§6) |

### Events

`lib/activityEvents.ts` persists to `activity_events` and emits on an in-process bus.
Seven types, all past tense, all facts: `profile.created`, `status.changed`,
`session.booked`, `session.completed`, `booking.confirmed`, `booking.cancelled`,
`payment.received`.

**This is event notification, not event sourcing.** No domain reconstructs state
from the log; relational tables stay authoritative. Do not describe this system as
event-sourced, and do not begin treating the log as a source of truth without a
deliberate decision to do so. Consumers (`clockActivityConsumer`, `sseActivityBridge`)
are log-and-forward only and must stay that way — a consumer that makes a business
decision is a bug.

---

## 5. Rules that actually hold

1. **Every fact has an owner. Every projection has a source. Every action has a boundary.**
2. **The ledger owns money.** `lib/financialLedger.ts` is the only writer. It enforces
   balance (`debit !== credit` throws), rejects non-positive amounts, and is idempotent
   on `(source_type, source_id)`. Do not touch Stripe, wallet settlement, payouts,
   refunds, tax, or pricing as a side effect of unrelated work.
3. **The Weave interprets relationships; it never defines them.** It reads Booking. It
   must never own booking, session, project, credit, availability or financial truth.
4. **The clock represents operating state and owns nothing.** It had one write; that
   write now goes through the session-log domain.
5. **Zod parses every request body.** There are currently zero raw `req.body` reads —
   keep it that way.
6. **Derived state must be rebuildable.** If a projection can go wrong and cannot be
   recomputed from authoritative truth, that is a defect, not a maintenance task.
7. **`AppError(message, statusCode)`** for domain failures; `error.middleware.ts` handles it.

---

## 6. Known debt, honestly

- **`profile_strength` is partly rebuildable, and the gap is narrower than it looks.**
  Worth stating precisely, because an earlier reading of this got it wrong.
  `portfolioScore()` (`passport.routes.ts:50`) is a pure function of authoritative data
  — artist, passport, releases, projects, bookings — and `recalculatePortfolioScore()`
  fetches that truth, recomputes, and writes only on change. That is a genuine recompute
  path, the same shape as `syncStudioCircleMembership`. Three real gaps remain: it is
  **private to `passport.routes.ts`**, so nothing else can trigger it; there is **no bulk
  path** to recompute every artist after a scoring change; and **`ProducerPassport` has no
  equivalent at all** — its `profile_strength` is only ever written directly. The other
  writes (`auth.controller.ts:128,154,263`) are signup constants superseded on first
  recompute. The fix is to lift the calculator into `lib/`, add a backfill alongside
  `db:backfill-weave`, and give Producer the same treatment — not to invent a rebuild
  path that already half exists.
- **Statuses are free-text `String`** on rights, consent and session log rather than
  enums, so illegal states are representable. The state machines in
  `resourceAuthorization.ts` are centralised and correct, which is the load-bearing part.
- **`ActivityEvent` has no version field** and `artist_id` is a hard FK, so a
  studio-only event has nowhere to go and the first payload change will be silent.
- **Reconciliation is partial.** Ledger entries are queryable by account and owner, but
  `status` never leaves `POSTED` — no pending/voided lifecycle, no external-rail
  comparison.
- **No React component is tested.** The web suite covers `lib/` and `store/` only.
- **Release blockers, all external:** Render is on `plan: free`; `NODE_ENV` stays
  `staging` until the production checklist in `lib/env.ts` is genuinely satisfied
  (notably a real backup restore recorded in `BACKUP_RESTORE_TESTED_AT`); R2 and
  SendGrid have never run against live credentials.

---

## 7. How work is done here

**Verify against reality, not against documentation — including this file.** The
staleness in §1 happened because a document was trusted over the tree. Re-check
before relying on any claim here.

**A green test run is not proof a test works.** Every important assertion in this repo
has been checked by deliberately reintroducing the bug and confirming the test fails.
This has caught a bad test more than once — including one that asserted a token was
gone from storage while passing with the logout fix removed. Mutation-check anything
load-bearing.

**Local green is not CI green.** They run different Node versions and different ICU
builds. CI is pinned to Node 24 (`.nvmrc`, `engines: >=22`) because jsdom's `undici`
calls a built-in absent from Node 20.

**CI logs need repo-admin auth**, which agents here do not have. The test step
re-emits failures as `::error::` annotations, which *are* readable from the public
API. Use them instead of guessing at a cause.

**The working tree is shared.** More than one agent works in this repo concurrently.
Stage explicit file lists, never `git add .`; review `git diff --cached` before every
commit; isolate by hunk when a file carries someone else's in-flight work. Forward
commits only — never rewrite pushed history.

**Verification that counts:** typecheck both apps, the API security and intelligence
suites, the web suite, the full build, the secret scanner, and the Postgres-backed
integration suite against a *freshly created* database. Typechecking is not a
substitute for running the integration suite.

---

## 8. Recent work, for continuity

Last twelve commits, newest first:

| Commit | What it did |
|---|---|
| `565227b` | Gave `SessionLog` one owner — six hand-rolled writers had drifted |
| `f21b600` | Gave booking completion one owner; stopped the clock destroying session notes |
| `48e4a4b` | Pinned Node — jsdom could not load on CI's Node 20 |
| `1269a66` | Made CI failures readable without repo-admin access |
| `10e2fc4` | Stopped time tests depending on the runner's ICU build |
| `615a010` | First frontend test suite (vitest + jsdom) |
| `eeb135d` | Proved the artifact Render starts actually builds and boots |
| `3fb9add` | Fixed rights/consent status semantics — counters queried a value nothing writes |
| `12164f6` | Encoded session and rights state as signal, not just text |
| `9b5f827` | Required R2/SendGrid in production |
| `d7f1b58` | Normalised uploaded images instead of trusting the browser |
| `51ea695` | Completed creative professional identity end to end |

The pattern worth carrying forward: **the defects that mattered were silent.** A DAW
ping quietly erased an engineer's notes. A delivered session quietly never reached
the artist's feed. Counters quietly reported zero. None threw, none failed a test.
They were found by asking *who owns this fact* and following every writer.

---

## The standard

Simple is not the same as easy.
Facts should be durable. Derived state should be rebuildable.
Commands ask for change. Events record what happened.
The domain owns business rules. The ledger owns money.
The Weave interprets relationships. The UI represents context.
No layer should secretly own another layer's truth.

OIANO may become large. It must not become tangled.
