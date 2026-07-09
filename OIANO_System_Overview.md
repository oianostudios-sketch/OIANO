# OIANO StudioOS — System Overview

*A full description of what was built, how it works, how to use it, what it solves, and why it wins if it sells.*

---

## 1. What This Is

OIANO StudioOS is a studio operating system for the music business, built for Dreamz Music Lab. It is not a booking widget bolted onto a calendar, and not a generic CRM repurposed for musicians. It is the connective layer that a recording studio runs on: bookings, payments, staff, rooms, and — most distinctively — a portable artist identity (the "Passport") that persists across sessions, producers, and eventually studios.

It speaks to three different people through one system:

- **The artist**, who is spending real money and creative trust on every session.
- **The producer**, who manages multiple artists and projects across weeks, not single bookings.
- **The studio operator**, who runs the business and needs total situational awareness from one screen.

Everything below describes the system as it is actually built today, not as a pitch deck.

---

## 2. How It's Built

**Architecture:** a TypeScript monorepo with two applications sharing one database and one set of constants.

```
apps/api      Express + Prisma + PostgreSQL + Zod + JWT           (port 4000)
apps/web      React 18 + Vite + Tailwind + React Query + Zustand  (port 5173, proxied to the API)
apps/watcher  A DAW-side helper that pings the API when an artist saves a file, so session
              activity and file uploads can happen automatically during tracking, not after.
packages/shared   Constants shared by both apps (studio slug, single-studio flag)
prisma/           One schema, one seed script, one source of truth for the data model
```

**Why this stack:** Prisma gives a typed, migration-driven data layer over Postgres so the schema is enforced in code, not tribal knowledge. Zod validates every request body server-side — nothing reaches a controller unchecked. React Query owns all server state on the frontend (no manually-synced local copies of API data), and Zustand holds the two things that need to survive a refresh: the auth token and the current user. Server-Sent Events (SSE) push live updates (booking status changes, wallet credits, new messages, studio announcements) to open browser tabs without polling.

**Data model (15 Prisma models):** Users authenticate; a `User` optionally owns exactly one `Artist` or one `Producer` profile (role-based). A `Studio` owns `Rooms`, `Engineers`, `ServiceOfferings`, and `Bookings`. A `Booking` is the hub: it ties a studio, artist, room, service, and optional engineer/project together, and owns one `Payment` and one `SessionLog`. An `Artist` owns a `Wallet` (studio credit balance + transaction ledger), an `ArtistPassport` (identity/creative-DNA record), files, and session history. A `Producer` owns a `ProducerPassport` and a set of `Projects`, each of which can span multiple bookings and moves through phases (pre-production → tracking → editing → mixing → mastering → delivered). `PassportConnection` and `ConnectMessage` let artists message each other directly, gated by accept/decline, independent of any studio.

---

## 3. How It Works, Role by Role

### The Artist

Sign-up creates a `User` + `Artist` + `ArtistPassport` + `Wallet` in one transaction — an artist has a fully working account, a $0 wallet, and an empty passport the moment they finish the form. From there:

- They book a session against real room/engineer/service availability. Booking creation checks their wallet balance *before* the booking is committed — no session gets created that the artist can't cover, and no studio chases a payment after the fact for a self-serve booking.
- Their **Passport** — genres, vocal type, energy profile, key themes, a profile-strength score, and an AI-generated brief — is their identity artifact. It is meant to be shown, not just stored: it's what a producer hands an engineer before a session so the engineer already knows the artist's sound before they walk in the room.
- They see their own dashboard: upcoming sessions, wallet balance framed as creative capital (not a shrinking meter), session history, and hours logged at the studio.
- They can top up their wallet or pay per-booking via Stripe Checkout.
- They can browse and message other artists on the same studio (Discover + Connect) — ranked by creative-DNA overlap (shared genres, shared themes, complementary vocal roles), so the studio's own roster becomes a network, not just a client list.

### The Producer

A producer is a separate role from an artist, with its own Passport (genres produced, signature tags, profile strength) and its own view: a **production board**, Kanban-style, with every active project as a card in a phase column (pre-production through delivered). Producers create projects, optionally link them to an artist, advance phases with one click, and track notes per project — session continuity that survives staff turnover, because the state lives in the system, not in someone's head or a group chat.

### The Studio Operator (Admin)

The admin gets a command center, not a spreadsheet:

- **Analytics dashboard** — total artists, total bookings, revenue collected, a 14-day revenue/session sparkline with week-over-week comparison, and a booking-status funnel (pending → confirmed → completed vs. cancelled/no-show), all from one aggregated endpoint rather than five separate widgets each hammering the database.
- **Studio Pulse** — a higher-level, cached intelligence feed: today's utilization percentage against available room-hours, the trending genre across the last 30 days of bookings, session-count milestones worth calling out ("Artist X hit their 25th session"), and a "next moves" list (unconfirmed bookings, overdue payments, artists who haven't been back in 30+ days) so the operator sees what needs action without querying anything themselves.
- **SmartClock** — a live 24-hour radial view of the day's bookings: what's active right now, what's ending soon, what's overtime, what's next — the visual instrument for "who's in the building right now."
- **Runsheet** — the printable/operational daily schedule: call times, room, engineer, payment status, and automatic room-conflict detection (flags two bookings in the same room that overlap, before it becomes a problem at the front desk).
- **Walk-in booking** — a studio admin can book someone who has never signed up, on the spot: name, phone, room, time, duration. The system creates a lightweight guest record behind the scenes so the booking still fits the same data model as every other session, and records the payment as cash/pending for reconciliation.
- **Credit management** — admins can credit an artist's wallet directly (comps, adjustments, refunds) and see pending credit requests artists have submitted.
- **Studio announcements** — one message broadcasts live to every connected client via SSE.

### The Engineer

Engineers get their own runsheet view (their sessions only), can log session notes, quality ratings, and tracks worked, and can mark session files as delivered — which flips the booking to completed and notifies the artist by email and in-app.

---

## 4. Feature Inventory (what actually exists in the code)

| Area | What it does |
|---|---|
| Auth | Email/password signup+login, JWT bearer auth, role-based access (`ARTIST`, `PRODUCER`, `STUDIO_ADMIN`, `ENGINEER`), rate-limited login/signup to blunt brute force |
| Bookings | Create/view/cancel/reschedule, wallet-balance guard, room-conflict detection, recurring weekly bookings, studio-scoped status transitions |
| Passport (Artist) | Creative DNA (genres, influences, vocal type, energy, themes), profile strength score, AI-generated brief (cached, regenerated only when the profile actually changes), shareable |
| Passport (Producer) | Genres produced, signature tags, profile strength, project pipeline stats |
| Wallet & Payments | Studio-credit wallet with transaction ledger, Stripe Checkout for per-booking payment and wallet top-ups, cash payments for walk-ins, webhook-driven payment status updates |
| Discover & Connect | Artist-to-artist discovery ranked by creative overlap, direct messaging gated by connection accept/decline |
| Projects | Producer-owned, phase-tracked, linkable to bookings and artists |
| Notifications | Persisted in-app notifications + live push via SSE (booking updates, wallet changes, new messages, studio announcements) |
| Files | Artist file uploads (session bounces, stems) to Cloudflare R2 with local-disk fallback for dev, folder-organized, sourced from either manual upload or the DAW watcher |
| Analytics & Pulse | Studio-wide KPIs, utilization, trending genres, milestone detection, actionable next-steps list |
| SmartClock | Live radial visualization of the day's session timeline |
| Runsheet | Daily operational schedule with conflict detection, for both admins and engineers |
| Walk-ins | Book an unregistered guest on the spot without breaking the data model |
| Admin tools | Wallet credits, credit-request inbox, studio-wide announcements |

---

## 5. How To Use It

**Local development:** `npm run dev` from the repo root starts both the API (port 4000) and the web app (port 5173, proxied to the API) concurrently. `start-all.bat` does the same thing plus port-clearing, for a one-click Windows launch. Demo credentials exist for both an admin (`admin@dreamzmusiclab.com`) and an artist (`demo@artist.com`) via the seed script — rotate them before anything touches a real deployment.

**Day to day, as the studio:** log bookings from the calendar or let artists self-serve; check SmartClock and Pulse each morning for a 10-second situational read; use the Runsheet each day for room/engineer logistics; credit wallets and post announcements from the admin dashboard as needed.

**Day to day, as an artist:** book a session against real availability, top up the wallet ahead of time so booking is one click, keep the Passport filled out so every engineer who works with you starts from context instead of zero.

**Day to day, as a producer:** track every active project on the board, advance phases as work moves, keep notes current so nothing depends on memory.

---

## 6. What It Actually Solves

Every one of these is a real, specific failure mode in how small-to-mid studios run today, not a hypothetical:

- **"Did the engineer get my notes?"** — session and creative context lives on the booking and the Passport, not in a text thread that gets lost.
- **Chasing payment after the session.** Wallet balance is checked *before* a booking commits, so the studio isn't extending credit it didn't mean to extend.
- **"Who's actually in the building right now?"** — answered by one screen (SmartClock) instead of a walk down the hall.
- **Double-booked rooms** — caught automatically at booking time and again on the Runsheet, instead of discovered at the front desk.
- **Artist identity that resets to zero every visit.** The Passport means a returning artist — or an artist visiting a *different* room, different engineer, three weeks later — doesn't start from scratch.
- **Producers losing the thread on multi-week projects.** The phase board is the single source of truth for where a project actually stands.
- **Walk-in traffic that doesn't fit the "normal" booking flow.** Handled without a separate, disconnected system.
- **Revenue and utilization living in someone's head or a spreadsheet.** Surfaced automatically, in a form the operator can act on immediately (who hasn't been back, what's overdue, what's trending).

---

## 7. Why This Is Inevitable — If It Sells

The argument for inevitability isn't "the UI is nice." It's that the system is built around a flywheel with compounding, not linear, value — and once a studio's operational and relational data lives inside it, the switching cost is real:

1. **The Passport is a data asset that grows every session, not a static profile.** The longer an artist uses OIANO, the more valuable *and more portable* their Passport becomes — genres, session history, an AI-maintained brief. That's the artist's incentive to stay inside the ecosystem rather than treat it as disposable booking software.

2. **The studio's intelligence compounds, it doesn't reset.** Trending genres, utilization patterns, which artists are regulars, who's gone quiet — none of this exists without months of accumulated booking data *inside the same system*. A studio that's used OIANO for two years has an operational advantage a competitor studio starting from a spreadsheet cannot replicate quickly, and can't buy — it has to be earned session by session.

3. **Three-sided network effects, not two.** Most studio software is studio-to-artist. OIANO is artist-to-artist (Discover/Connect), producer-to-studio (projects and Passports), and studio-to-operator (Pulse/Command Center) simultaneously. Every new artist makes Discover more useful to every existing artist. Every producer who brings a new artist means that artist's Passport starts building from session one, inside the ecosystem, not outside it. That's a network effect competitors who only solve scheduling don't have.

4. **Switching cost is operational, not just financial.** Once wallet balances, session history, room/engineer relationships, and passport data for an entire roster live in the system, migrating away means either losing that history or manually rebuilding it elsewhere. That's a powerful retention mechanic that a simple booking calendar never earns.

5. **It's positioned as infrastructure, not a feature.** A calendar app can be replaced by another calendar app in an afternoon. An operating system that a business's daily rhythm depends on — and that its clients (artists) have their own identity inside — gets embedded, not swapped.

If it sells well, it sells well *because* studios adopt it as the substrate their whole operation runs on, and every additional artist, producer, and session makes leaving more costly and staying more valuable. That compounding — not a feature list — is what makes a category winner "inevitable" rather than merely competitive.

---

## 8. Honest Caveats (as of this writing)

- **The system is currently single-studio.** `SINGLE_STUDIO_MODE` is hardcoded true and every query scopes to one hardcoded studio slug (`dreamz-music-lab`). Turning this into a true multi-tenant SaaS product — the natural next step if it's going to be sold to *other* studios, not just Dreamz — requires real schema and auth changes (the `Artist` model, for instance, currently has no studio relation at all) and was flagged as a deliberate follow-up, not yet built.
- **Stripe is wired for both booking payments and wallet top-ups but is feature-flagged off unless `STRIPE_ENABLED`/keys are configured** — cash and wallet-credit flows work standalone.
- **File storage** defaults to local disk in dev and only uses Cloudflare R2 when credentials are present — fine for one studio, worth confirming before scaling to many.
- **AI-generated Passport briefs** depend on an external Anthropic API key being configured; the caching layer (only regenerate when the profile actually changed) keeps cost bounded, but the feature degrades gracefully (not blocks the app) if the key is missing.

None of these are architectural dead ends — they're the honest list of what "built for one studio" still needs before it's "built to sell to many."
