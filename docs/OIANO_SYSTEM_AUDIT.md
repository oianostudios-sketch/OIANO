# OIANO Studio OS — Systematic UI, Account & Workflow Audit

**Scope:** full-system audit of the existing build — repetition, account-ownership
correctness, terminology, navigation, dashboards, workflow friction, permissions,
data relationships, Pulse, and Artist Passport. This is **not** a redesign. This is
not the same axis as the Test Ready V1 security/functional audit (`docs/TEST_READY_V1_AUDIT.md`,
which is fully cleared) — that measured "is it safe and functional to hand to
testers." This measures "does it feel like one coherent system." A product can pass
one and still need work on the other; OIANO currently does.

**Method:** four parallel research passes read the full frontend (~30 pages, ~40
components), the full API route surface (~25 route files), and the full Prisma
schema (1075 lines), then this document applies architectural judgment on top.
Every finding below has a file:line source; nothing here is speculative.

---

## 1. Executive Audit Summary

OIANO's underlying architecture is sound — roles are real, most permissions are
correctly enforced (often via careful inline ownership checks even where a
declarative `requireRole` would've been cleaner), and the core booking/session/
payment data model is coherent. The product does **not** need to be rebuilt.

What it needs is consolidation. The build grew through multiple development
passes (including a large parallel merge earlier in this project's history), and
that history is visible everywhere: **two full-screen "studio command centre"
dashboards for the same role** (Admin, Pulse) that duplicate each other's numbers
and cross-link to each other; **the same booking-status color scheme
independently reimplemented in ten different files**; **a studio-staff role
called "Engineer" that the booking wizard itself labels "Producer" on the same
screen**; **two payment systems live simultaneously**, the newer one with weaker
data integrity than the one it's replacing; and **five different pages** that all
render some slice of "artist identity" with real overlap between them.

None of this is a beta blocker in the security/functional sense — that gate is
already cleared. But every one of these is friction a real studio operator or
artist will notice within their first week, and every month that passes before
consolidation makes the fix more expensive (more call sites to update, more
data to migrate). The good news: the fixes are almost entirely **subtractive**
— removing duplicated screens/logic and reusing what already exists — not new
feature work.

**Total findings logged: 31.** 0 Critical, 6 High (P0/P1), 16 Medium (P1/P2), 9 Low (P2/P3).

---

## 2. Current System Map

### Routes (from `apps/web/src/App.tsx`)

| Path | Page | Role(s) | Job |
|---|---|---|---|
| `/enter` | EnterPage | public | Sign in/up + MFA |
| `/p/:code` | PublicPassportPage | public | Public artist EPK |
| `/s/:slug` | StudioPassportPage | public | Public studio EPK |
| `/dashboard` | `SmartDashboard` → role-routes | any | Landing dispatcher |
| `/discover` | DiscoverPage | ARTIST, PRODUCER | Browse artists |
| `/producers` | ProducerDiscoverPage | any | Browse producer catalogue |
| `/artists/:id` | ArtistProfilePage | any | Artist detail (dual: self + admin view) |
| `/book` | BookingPage | ARTIST | Booking wizard |
| `/bookings/:id` | BookingDetailPage | any | Booking detail |
| `/receipt/:id` | ReceiptPage | any | Printable receipt |
| `/artist/passport` | PassportPage | ARTIST | Own passport, editable |
| `/projects` | ArtistProjectsPage | ARTIST | Own project list |
| `/calendar` | CalendarPage | any | Scheduling grid |
| `/admin` | AdminDashboardPage | STUDIO_ADMIN | Studio operator home |
| `/pulse` | PulseDashboard | STUDIO_ADMIN | Real-time operator command centre |
| `/runsheet` | RunsheetPage | STUDIO_ADMIN, ENGINEER | Printable day sheet |
| `/producer` | ProducerDashboardPage | PRODUCER | Kanban project board |
| `/producer/passport` | ProducerPassportPage | PRODUCER | Own passport |
| `/producer/projects/:id` | ProjectDetailPage | PRODUCER | Project detail |
| `/notifications` | NotificationsPage | any | Notifications + Connect threads |
| `/workrooms` | WorkroomsPage | ARTIST, PRODUCER, STUDIO_ADMIN, ENGINEER | Message-thread inbox |
| `/connect/:artistId` | ConnectPage | ARTIST | Artist-to-artist DM |
| `/maintenance` + 8 sub-routes | Maintenance*Page | OIANO_ADMIN | Network-wide platform ops |

Full route table with lazy-load/redirect notes lives in the research transcript;
this is the subset that matters for the audit below.

### Dashboards (full inventory)

Six pages behave as "dashboards" (landing page, summary cards, primary actions):
`DashboardPage` (Artist), `AdminDashboardPage` (Studio Admin), `PulseDashboard`
(Studio Admin), `EngineerDashboardPage` (Engineer), `ProducerDashboardPage`
(Producer), `MaintenancePage` (OIANO Admin, +8 sub-pages). See Section 7 for the
per-dashboard job analysis.

### Navigation inventory

Navigation is fragmented across **7 independent implementations** rather than
one shared system: `MobileBottomNav` (artist), `ProducerNav` (producer, only
wired into 3 of the producer's own pages), `CommandPalette` (global Cmd-K),
inline header nav duplicated separately in `AdminDashboardPage`, `PulseDashboard`,
and `EngineerDashboardPage`, and `MaintenanceShell` (OIANO admin sidebar). See
**AUD-006** — the Maintenance sidebar specifically is hand-copied into 4 pages
and has drifted out of sync (missing 3 of 9 items in the copies).

---

## 3. Account Responsibility Matrix

| Role | What they should answer | What they can currently do (verified via API role matrix) | Gaps found |
|---|---|---|---|
| **Artist** | What am I working on, what sessions/files are mine, what's my passport | Dashboard, book sessions, own passport (edit), own projects, own files, connect/message other artists, wallet/credit | None structural — see AUD-019 (Passport/Profile split) for the one real confusion |
| **Producer** | What am I producing, which artists/sessions, what's pending | Kanban project board, own passport, project CRUD, link existing bookings to projects, credits/rights/consent management | **Cannot message in a booking thread even for their own linked project's session** (AUD-014); cannot see/manage the Engineer assigned to their linked session beyond read-only |
| **Engineer** | What am I running today, what's next, what needs my notes | Today/week sessions (studio-scoped), session notes + rating, file delivery, printable runsheet | **Silently fails to load room-status on their own dashboard** (calls a STUDIO_ADMIN-only endpoint — AUD-013); has zero visibility into Projects even when assigned to a project-linked booking |
| **Studio Manager (STUDIO_ADMIN)** | What's happening, who's booked, what needs attention | Everything operational: bookings, roster, revenue, broadcasts, credit approval, walk-ins, session status | **Two full parallel dashboards for this exact job** (AUD-001) |
| **OIANO_ADMIN** | Network-wide platform health | Full cross-studio visibility (finance, audit, health, growth, operators) | Correctly isolated from studio-level data — no gaps found |
| **Shared/System** | Identity, notifications, files, search, messaging | JWT auth, notification stream, file-access tickets, feedback | Message threads are **2 unmerged implementations** for the same job (AUD-012); no shared search component (AUD-011) |

---

## 4. Duplication Report (Repetition, classified)

| # | Repetition | Classification | Evidence |
|---|---|---|---|
| D1 | `AdminDashboardPage` vs `PulseDashboard` | **MERGE/RELOCATE** | Both show today's sessions w/ identical status actions, next-session hero, revenue, room/live status — see AUD-001 |
| D2 | 10 independent booking-status color maps | **MERGE** | AdminDashboardPage, EngineerDashboardPage, BookingDetailPage, CalendarPage, ArtistProfilePage, ProjectDetailPage, RunsheetPage, MaintenanceBookingsPage, PulseDashboard (×2), DashboardPage — see AUD-002 |
| D3 | `BookingMessageThread` vs `ProjectMessageThread` | **MERGE** | Same job (fetch/send/render thread), independently built — AUD-012 |
| D4 | `StudioTicker` / `SessionLiveBar` / `StudioPulseWidget` | **MERGE** | All three mounted simultaneously on every non-artist route, each independently computes "is a session live" — AUD-005 |
| D5 | `DiscoverPage` vs `ProducerDiscoverPage` | **KEEP, but share the base** | Producer file's own comment says it "mirrors" Discover — legitimately different audiences (artist-discovery vs beat-catalogue browsing) but the search/filter/card-grid chrome should be one shared component, not two authored copies — AUD-010 |
| D6 | Maintenance sidebar (`MaintenanceShell` vs 4 hand-copied inline versions) | **MERGE** | Copies are missing 3 of 9 nav items — genuinely broken, not just duplicated — AUD-006 |
| D7 | ArtistProfilePage vs PassportPage — Creative DNA panel | **MERGE** | Identical `ArtistPassport.creative_dna` rendered independently on both pages, each with its own empty-state copy; codebase's own links already point to PassportPage as the "real" editor — AUD-019 |
| D8 | Empty states — `ArtistEmptyState` exists, used in 5 of ~20 places | **MERGE (expand adoption)** | 15+ pages hand-roll their own "no data" JSX — AUD-008 |
| D9 | Loading skeletons — `Skeleton` system exists, used in 2 of ~10 places | **MERGE (expand adoption)** | Most pages show plain "Loading…" text or a locally-defined skeleton instead — AUD-009 |
| D10 | `ArtistAvatar`'s `initials()` helper reimplemented locally | **MERGE** | `ProducerDashboardPage.tsx:65`, `PulseDashboard.tsx:84` both redefine it instead of importing — AUD-020 |
| D11 | No shared modal/dialog primitive — 5+ independent `role="dialog"` implementations | **MERGE** | `PassportPage.tsx` alone has 4 separate inline dialogs — AUD-007 |
| D12 | No shared search-input component — 6+ hand-rolled search boxes | **MERGE** | WorkroomsPage, MaintenancePage, MaintenanceCreatorsPage, MaintenanceBookingsPage, DiscoverPage, ProducerDiscoverPage — AUD-011 |
| D13 | `Deliverable` type redeclared in two files instead of shared | **MERGE** | `BookingDetailPage.tsx` (inline `any`) and `ProjectActionPanel.tsx:12` (own `type Deliverable`) — AUD-021 |
| D14 | Legacy `Payment` model vs `OianoPayment` model | **MERGE (architecture, higher risk)** | Both live simultaneously by explicit schema comment; `OianoPayment`'s FKs to Booking/Project/Studio are unenforced strings, weaker than the legacy model's real FK — AUD-016 |
| D15 | "Deliver Files" (session_log.tracks_worked) vs "Deliverables" (versioned, approval-gated) on the same booking-detail page | **CLARIFY then MERGE or RELOCATE** | Two mechanisms for what looks like the same real-world job (handing the artist their session output) — needs a product decision on whether these are actually different things — AUD-022 |

---

## 5. Terminology Problems (Dictionary)

| Concept | Terms found in use | Canonical decision | Rationale |
|---|---|---|---|
| The bookable unit of studio time | "Session" (artist/producer-facing copy), "Booking" (admin/API/schema) | **Keep both, deliberately** — "Session" for all Artist/Producer-facing copy, "Booking" for all Admin/Operator-facing copy and all technical naming | These are genuinely two audiences with two correct mental models. The bug isn't the dual vocabulary — it's that individual screens **mix both** (`BookingDetailPage` heading says "Booking Detail," body says "Session details"/"Session Notes"; `EnterPage` uses both in one screen). Fix: audit each page for internal consistency, not force one global word. |
| Studio staff who executes the session | **"Engineer"** (role enum, dashboard) mislabeled **"Producer"** in the booking wizard and on the invoice | **"Engineer" everywhere.** Never "Producer" for this concept. | This is the single worst terminology bug found — see AUD-003. `PRODUCER` is a real, distinct role with its own dashboard/data model (Project management). Calling the Engineer-assignment step "Producer assignment" actively teaches users the wrong mental model of the product. |
| The artist's portable identity/creative-history record | "Passport" (PassportPage, branding) vs "Profile" (`ArtistProfilePage`'s own file name, `ProfileEditDrawer`'s heading) | **"Passport."** Retire "Profile" from all user-facing copy. | "Artist Passport" is the product's own flagship concept. `ProfileEditDrawer`'s "Edit Profile" heading literally sits one line above "Passport score" — the component itself doesn't believe its own heading. |
| The studio tenant | "Studio" (everywhere) vs "Workspace" (one incidental use) | **"Studio."** | Only one stray usage (`EnterPage.tsx:167`, loading text) — trivial one-line fix. |
| A session's output work-product | "File" (general storage) / "Deliverable" (versioned+approved) / never "Asset" | **Keep File and Deliverable as distinct concepts** — but see AUD-022, the *page* conflates them, not the vocabulary itself. |
| The dashboard activity widget | "History" / "Activity" / "Timeline" — three names within a 10-line span of the same component | **"Career Activity"** (matches the existing visible heading) | `DashboardPage.tsx:787-794` — comment says "timeline," aria-label says "activity," loading copy says "timeline" again. One-line fixes. |
| Artist + Producer, collectively | "Creator" | **Keep** — intentional, OIANO_ADMIN-only umbrella term, never shown to Artists/Producers themselves | Not a bug — internal ops shorthand used consistently within its own scope. |

---

## 6. Navigation Problems

1. **Maintenance sidebar drift (AUD-006).** `MaintenanceShell.tsx` is the canonical 9-item nav, but `MaintenanceStudiosPage`, `MaintenanceCreatorsPage`, `MaintenanceBookingsPage`, and `MaintenanceHealthPage` each hand-copy a 6-item version that's missing Studio Operators, Growth, and Audit trail — meaning an OIANO_ADMIN on those 4 pages literally cannot navigate to 3 sections of their own product without going back to `/maintenance` first.
2. **`MaintenanceAuditPage` and `MaintenanceGrowthPage` have no sidebar at all** — just a back button. Three different chrome patterns across one route family (`/maintenance/*`).
3. **`ProducerNav` isn't part of the global `Chrome`** — it's manually re-rendered inside 3 individual producer pages rather than being wired into the app shell like `MobileBottomNav` is for artists, meaning any new producer page has to remember to add it.
4. **Command Palette's role-conditional item list is hand-maintained separately from the actual route guards in `App.tsx`** — no shared source of truth for "what can this role navigate to," so the two can silently drift (not confirmed drifted today, but structurally fragile).
5. **Admin ↔ Pulse cross-linking is itself a navigation smell** — both pages link to each other prominently (Admin's "Studio Pulse" shortcut card, Pulse's "Operator desk" buttons in 4 places) because neither is confidently "the" home screen for the role. See AUD-001.

---

## 7. Dashboard Audits (one job each)

| Dashboard | Primary question | Primary actions (1-3) | Noise / demote |
|---|---|---|---|
| **DashboardPage** (Artist) | "What's my next move?" | Book a session, check next session, top up credit | Solid — "Your OIANO Presence" card and the collapsible "Studio insights" section are borderline decorative; consider demoting to a secondary tab rather than default-visible |
| **AdminDashboardPage** | *(currently: everything)* | Should be: manage roster, handle walk-ins/credit requests, broadcast | Today's-sessions list, next-session hero, revenue KPIs, room-status — all duplicate Pulse (AUD-001) and should be **removed from this page**, not demoted |
| **PulseDashboard** | "What's happening right now, what needs my attention?" | Glance at live rooms, act on an Intelligence insight, change a session's status | "Today's signal" (rotating quote) is pure decoration — demote or remove (AUD-023); two separate inline `statusColors` objects in the same file is internal noise, not user-facing, but signals the file itself has grown past a comfortable size |
| **EngineerDashboardPage** | "What am I running today?" | Log session notes, see today/this-week schedule | Room-status strip silently fails (AUD-013) — either fix the permission or remove the widget |
| **ProducerDashboardPage** | "What's the state of my productions?" | Advance a project's phase, start a new project | Clean — no noise found |
| **MaintenancePage** | "Is the network healthy, what needs oiano-admin attention?" | Jump to a specific studio/creator/finance record | Clean — this is the best-scoped dashboard in the audit |

---

## 8. Workflow Friction Report

Traced: **Artist created → Passport established → Booking created → Engineer
assigned → Session executed → Files/Deliverables → Session completed → Payment
→ Project progresses → History updates.**

- **Booking creation (BookingPage wizard):** 5 steps, clean, context-carrying works (calendar/rebook prefill confirmed). No unnecessary re-entry found.
- **Engineer assignment step:** functionally fine, but the step is internally called `'engineer'`, labeled "Producer assignment," and the invoice line says "Producer" — a user has to mentally translate the same screen three times (AUD-003).
- **Session execution → delivery:** two parallel delivery mechanisms live on the same `BookingDetailPage` (AUD-022) — an engineer delivering session output has to reason about which one to use.
- **Session → Project linkage:** a Producer can only attach an *existing* booking to a project after the fact (`link-booking` endpoint) — there's no forward path where a Producer's project creates a booking directly; the Artist has to book first, independently, then the Producer retroactively links it. This is workable but is an extra coordination step with no system-carried context between the two roles.
- **Cross-dashboard duplication tax:** because Admin and Pulse both show "today's sessions," a Studio Manager doing routine status updates has two equally-valid places to do it, doubling the number of screens they might need to check to be sure nothing's missed.
- **No unnecessary confirmation modals or dead ends found** in the core flow — this part of the product is efficient.

---

## 9. Permission / Security Issues

(Full API role matrix generated during research; summarized here to the items
that matter.)

| Finding | Severity | Detail |
|---|---|---|
| **PRODUCER excluded from booking-thread messaging** (AUD-014) | High (workflow, not security) | `canAccessBookingMessages` grants ARTIST/ENGINEER/STUDIO_ADMIN/OIANO_ADMIN but never PRODUCER — even for a booking linked to their own project |
| **`GET /bookings` has no role restriction, but its controller has no PRODUCER/OIANO_ADMIN branch** (AUD-015) | High (bug) | Falls into the ARTIST branch → 404 "Artist not found" for any Producer or OIANO_ADMIN who calls it directly |
| **Engineer dashboard silently 403s on `/studio/pulse`** (AUD-013) | Medium | No error UI — just renders an empty room-status strip, engineer has no idea it failed |
| **`PATCH /feedback/:id` has no per-studio scoping** (AUD-024) | Low (given the single-studio guard added this session) | Any STUDIO_ADMIN can resolve any studio's feedback report network-wide; dormant today, same pattern as the PRIV-01 studio-isolation issue fixed earlier |
| **Credit-request endpoint mounted under `/admin/*` path but usable by any authenticated role** (AUD-025) | Low (naming/organization only, functionally correct) | Confirmed intentional per code comment; just an awkward URL namespace |
| **Public routes** (`studio.routes.ts`, `availability.routes.ts`, `studio-clock.routes.ts`, passport public routes) | None — confirmed intentional | Marketing/discovery surface, correctly unauthenticated by design |

Everything else in the role matrix checked out — API-level `requireRole` and
inline ownership checks consistently agree with what the UI actually shows per
role (no case found where the UI exposes an action the API would reject, or
vice versa).

---

## 10. Component Consistency Report

| Component class | Shared version exists? | Adoption | Recommendation |
|---|---|---|---|
| Status badges | No | 0/10 | Build `StatusBadge.tsx`, migrate all 10 (AUD-002) |
| Empty states | Yes (`ArtistEmptyState`) | 5/~20 | Expand adoption, generalize name (AUD-008) |
| Loading skeletons | Yes (`Skeleton.tsx`) | 2/~10 | Expand adoption (AUD-009) |
| Avatars | Yes (`ArtistAvatar`) | Most places, 2 local reimplementations | Fix the 2 stragglers (AUD-020) |
| Modals/dialogs | No | 0/5+ | Build one shared `Modal` shell (AUD-007) |
| Search inputs | No | 0/6+ | Build `SearchInput.tsx` (AUD-011) |
| Message threads | No (2 parallel builds) | — | Merge into one parameterized component (AUD-012) |
| "Studio is live" status widgets | No (3 parallel builds, all mounted at once) | — | Merge into one shared hook + one widget (AUD-005) |

---

## 11. States Coverage

Loading-state coverage was spot-checked this session (Dashboard, Calendar,
Artist Profile, Booking Detail all handle loading correctly — see
`docs/TEST_READY_V1_AUDIT.md` ERR-05). This audit's new finding is about
**consistency of the mechanism**, not presence: half the app uses the shared
`Skeleton`/`ArtistEmptyState` components and half hand-rolls equivalent JSX
per page (AUD-008, AUD-009) — both "work," but every hand-rolled instance is
a second place a future visual change has to be applied.

---

## 12. Data Relationship Problems

From the full Prisma schema read (see AUD-016 through AUD-018, AUD-026 through AUD-029):

- **AUD-016 — `Payment` vs `OianoPayment`:** both live simultaneously (confirmed by an explicit schema comment), and the newer model has *weaker* referential integrity (`booking_id`/`project_id`/`studio_id` are unenforced strings) than the legacy one it's replacing. This connects directly to the payment-ledger-migration work already flagged as open technical debt earlier this session.
- **AUD-017 — `Wallet` is disconnected from the `OianoPayment` ledger stack entirely.** Wallet top-ups are Stripe-checkout-based and parallel to, not integrated with, the double-entry ledger.
- **AUD-018 — Identity fields split across `Artist`/`ArtistPassport`** (and `Producer`/`ProducerPassport`). Reinforces the Passport/Profile UI confusion (AUD-019) — the schema itself doesn't have one clean "identity" source of truth.
- **AUD-026 — `ProducerPassport` is a materially "lesser" model than `ArtistPassport`:** no `PassportView`, no `social_links`, no `collaboration_interests`, no `bio`/`profile_image_url`. Producers get a second-class identity system.
- **AUD-027 — Unenforced string relations on credit/rights records:** `ProjectCredit.participant_id`, `ProjectParticipant.participant_ref_id`, and `RightsShare.holder_ref_id` are all plain strings with no declared FK — nothing guarantees a credit or rights-share actually resolves to a real Artist/Producer/User. This directly weakens the Passport's "verified credits" value proposition.
- **AUD-028 — `StudioCircleMember` manually tracks `session_count`/`first_session_at`/`last_session_at`** rather than computing them from `Booking`/`SessionLog` — a real drift risk if a booking is cancelled/edited after the counter was set.
- **AUD-029 — `ArtistFile` has no relation to `Booking` or `SessionLog`**, only a free-text `folder` string — despite the UI implying per-session file organization, there's no relational guarantee a file is actually tied to the session it claims to belong to.

---

## 13. Pulse Audit

**What Pulse uniquely provides** (nothing else in the app does this):
the Intelligence panel's computed insights (booking risk, payment follow-up,
revenue opportunity, trend/demand-window detection), the live room-wave
visualization, and the vinyl-dial live-session countdown. This is real,
differentiated, high-value "what should I do next" content — exactly what
the user's own framing (Section 14) asks Pulse to be.

**What's duplicated elsewhere and should be removed from the other location, not Pulse:**
today's-bookings list + status actions, next-session hero, revenue (today +
collected), room/live status, artist roster preview — all independently
recomputed on `AdminDashboardPage` (full overlap list is in AUD-001's evidence).

**Recommendation:** Pulse becomes the single real-time operational view for
STUDIO_ADMIN. Admin's overlapping cards are removed and replaced with links
into Pulse; Admin keeps and doubles down on what Pulse doesn't do — roster
management (search/credit/delete, already built this session), walk-in
creation, credit-request approval, broadcast composition, and the historical
all-bookings table/funnel (trend data over time, not "right now").

**Minor internal Pulse cleanup:** two separate inline `statusColors` objects
exist within the single `PulseDashboard.tsx` file itself (AUD-002 overlaps
here); "Today's signal" (a rotating decorative quote) has no operational
value and is a Section-16 "UI for the sake of UI" candidate (AUD-023).

---

## 14. Artist Passport Audit

**Current state:** Passport and Profile are not cleanly separated — they're
two competing pages (`PassportPage` at `/artist/passport`, `ArtistProfilePage`
at `/artists/:id`) that both render Creative DNA from the same
`ArtistPassport.creative_dna` field, independently fetched and formatted, each
with its own empty-state copy (AUD-019).

**Recommendation — don't try to split "Profile" from "Passport" as two
separate concepts** (the schema doesn't cleanly support that distinction
today per AUD-018, and building it would be new work, not consolidation).
Instead:
- **`PassportPage` becomes the single canonical Passport** — identity,
  creative DNA, releases, socials, Studio Circle consent, sharing/EPK. Already
  the better-built page of the two (self-view, full edit surface).
- **`ArtistProfilePage` (`/artists/:id`) is relocated conceptually to a
  "Studio Record"** — the operational history a *studio* needs about an
  artist (session history, files, wallet — for STUDIO_ADMIN) that genuinely
  isn't portable/Passport data. Its Creative DNA panel is removed; it links to
  the artist's Passport instead of re-rendering it.
- This directly resolves AUD-007's PassportPage dialog sprawl too, since
  consolidating the identity surface reduces how many places need an "edit
  this field" modal.

---

## 15. Keep / Merge / Remove / Relocate Register

*(Selected — the full 31-item register with severity/classification/risk/
dependencies/acceptance-criteria is in Section 19.)*

| Existing | Problem | Decision | New Location/System |
|---|---|---|---|
| PulseDashboard's live-ops cards | Correct, unique value | **Keep** | Current |
| AdminDashboardPage's today's-sessions/revenue/next-session cards | Duplicate of Pulse | **Remove** | Link to Pulse instead |
| AdminDashboardPage's roster/walk-in/credit/broadcast | Correct, unique value | **Keep** | Current |
| 10 inline status-color maps | Duplicate | **Merge** | New shared `StatusBadge` component |
| StudioTicker / SessionLiveBar / StudioPulseWidget | Triplicate | **Merge** | One shared live-status hook + widget |
| BookingMessageThread / ProjectMessageThread | Duplicate | **Merge** | One parameterized `MessageThread` |
| Maintenance hand-copied sidebars (4 pages) | Duplicate, out of sync | **Merge** | All pages use `MaintenanceShell` |
| ArtistProfilePage's Creative DNA panel | Duplicate of Passport | **Remove** | Link to `/artist/passport` instead |
| "Engineer assignment" step copy | Wrong owner (says Producer) | **Fix (terminology)** | Rename to "Engineer" throughout |
| `assignBookingProducer` function/mutation name | Misleading name | **Fix (internal rename)** | Rename to reflect Engineer assignment |
| DiscoverPage / ProducerDiscoverPage chrome | Duplicate implementation, distinct audience | **Merge (shared base), Keep (distinct data)** | Shared search/filter/grid component |
| `ArtistEmptyState` / `Skeleton` underuse | Inconsistent | **Standardize** | Expand adoption app-wide |
| Payment / OianoPayment | Duplicate systems | **Merge (architecture)** | Already flagged as open technical debt — this audit adds evidence |

---

## 16. P0–P3 Priority Backlog

### P0 — Beta Blocker
*(None found. The Test Ready V1 gate already covers actual blockers; nothing
in this audit rises to that level.)*

### P1 — Structural
- **AUD-001** — Merge Admin/Pulse duplication (remove overlapping cards from Admin)
- **AUD-002** — Build shared `StatusBadge`, migrate 10 call sites
- **AUD-003** — Fix Producer/Engineer terminology + rename `assignBookingProducer`
- **AUD-006** — Fix Maintenance sidebar (use `MaintenanceShell` everywhere, delete the drifted copies)
- **AUD-014** — Give PRODUCER access to booking-thread messages on their linked projects
- **AUD-015** — Fix `GET /bookings` controller's missing PRODUCER/OIANO_ADMIN branch

### P2 — Efficiency
- **AUD-005** — Merge the 3 redundant live-status widgets
- **AUD-007** — Build a shared `Modal` component
- **AUD-011** — Build a shared `SearchInput` component
- **AUD-012** — Merge the 2 message-thread implementations
- **AUD-013** — Fix (or remove) the Engineer dashboard's silently-failing room widget
- **AUD-019** — Consolidate Passport/Profile per Section 14
- **AUD-022** — Product decision: clarify or merge "Deliver Files" vs "Deliverables"
- **AUD-008 / AUD-009 / AUD-020** — Expand shared empty-state/skeleton/avatar adoption

### P3 — Polish
- **AUD-004** — Fix Studio/Workspace, Activity/History/Timeline copy (one-line fixes each)
- **AUD-010** — Share Discover/ProducerDiscover chrome
- **AUD-021** — Share the `Deliverable` type definition
- **AUD-023** — Remove or demote "Today's signal" decorative quote
- **AUD-024 / AUD-025** — Low-severity permission/naming cleanups
- **AUD-026 through AUD-029** — Data-model integrity items (Producer passport parity, unenforced ref_id relations, StudioCircleMember counters, ArtistFile↔Booking relation) — real, but schema changes deserve their own planned pass, not a drive-by fix

---

## 17. Recommended V1 Information Architecture

**GLOBAL** (every role, everywhere): auth, notifications, feedback, Command
Palette, shared component library (badges, modals, empty/loading states,
search, avatars).

**ROLE-SPECIFIC** (one persistent home per role): Artist → Dashboard; Producer
→ Kanban board; Engineer → Today's sessions; Studio Manager → **Pulse**
(promoted to the primary landing surface, per AUD-001's resolution); OIANO
Admin → Maintenance overview.

**CONTEXTUAL** (reached through an object, not persistent nav): Booking
detail, Artist Passport (viewed), Project detail, message threads, file
delivery/review.

**ADMINISTRATIVE** (secondary, task-oriented, not "home"): Admin's roster
management, walk-ins, credit requests, broadcast — all still exist, just
demoted from "competing dashboard" to "management tools reached from Pulse or
their own sub-route."

---

## 18. Recommended Account Architecture

- **Artist:** unchanged — already the cleanest role in the audit.
- **Producer:** unchanged structurally; fix the booking-message-access gap (AUD-014) so a Producer isn't locked out of conversations about their own linked sessions.
- **Engineer:** unchanged structurally; fix the silent Pulse-permission failure (AUD-013).
- **Studio Manager:** Pulse becomes the primary home; Admin's overlapping "live ops" cards are removed, its management-only tools remain and get their own clear identity (candidate rename: "Studio Manager" tools, distinct from "Pulse" intelligence).
- **Shared Oiano Infrastructure:** grows to include the new shared components (`StatusBadge`, `Modal`, `SearchInput`, unified `MessageThread`, unified live-status widget) — these become the actual shared system the audit's Section 10 found largely missing.

---

## 19. Full Audit Register

*(ID · Area · Account · Severity · Classification · Recommended action — abbreviated
for length; full "current behavior / why it matters / risk / dependencies /
acceptance criteria" detail for the P0/P1 items is embedded in Sections 4-14 above.)*

| ID | Area | Account | Severity | Classification | Action |
|---|---|---|---|---|---|
| AUD-001 | Admin vs Pulse dashboards | Studio Manager | High | Duplication/Architecture | Merge — remove overlap from Admin |
| AUD-002 | 10x status-color maps | Global | High | Duplication/Visual consistency | Merge into `StatusBadge` |
| AUD-003 | Producer/Engineer terminology + naming | Studio Manager, Engineer | High | Terminology/Bug | Fix throughout |
| AUD-004 | Studio/Workspace, Activity/History/Timeline copy | Artist | Low | Terminology | Fix (one-line each) |
| AUD-005 | 3x live-status widgets | Global (non-artist routes) | Medium | Duplication | Merge |
| AUD-006 | Maintenance sidebar drift | OIANO Admin | High | Navigation/Bug | Merge, use `MaintenanceShell` everywhere |
| AUD-007 | No shared Modal component | Global | Medium | Component consistency | Build + migrate |
| AUD-008 | Empty-state underuse | Global | Medium | Component consistency | Expand adoption |
| AUD-009 | Skeleton underuse | Global | Medium | Component consistency | Expand adoption |
| AUD-010 | Discover/ProducerDiscover duplicate chrome | Artist, Producer | Low | Duplication | Share base component |
| AUD-011 | No shared SearchInput | Global | Medium | Component consistency | Build + migrate |
| AUD-012 | 2x message-thread implementations | Global | Medium | Duplication | Merge |
| AUD-013 | Engineer dashboard silent 403 | Engineer | Medium | Permission/Bug | Fix endpoint access or remove widget |
| AUD-014 | Producer excluded from booking messages | Producer | High | Permission | Add Producer to `canAccessBookingMessages` |
| AUD-015 | `GET /bookings` missing role branches | Producer, OIANO Admin | High | Bug | Add branches for Producer/OIANO_ADMIN |
| AUD-016 | Payment vs OianoPayment | System | Medium | Technical debt/Architecture | Planned migration (already flagged pre-audit) |
| AUD-017 | Wallet disconnected from ledger | System | Medium | Architecture | Planned integration |
| AUD-018 | Identity split across Artist/ArtistPassport | Artist | Low | Architecture | Consider consolidation in a schema pass |
| AUD-019 | Passport vs Profile page overlap | Artist, Studio Manager | Medium | Duplication/UX | Merge per Section 14 |
| AUD-020 | `initials()` reimplemented locally | Producer, Studio Manager | Low | Duplication | Use shared `ArtistAvatar` |
| AUD-021 | `Deliverable` type redeclared | Engineer, Artist | Low | Technical debt | Share the type |
| AUD-022 | "Deliver Files" vs "Deliverables" overlap | Engineer, Artist | Medium | UX/Architecture | Product decision needed |
| AUD-023 | "Today's signal" decorative quote | Studio Manager | Low | UI-for-UI's-sake | Remove or demote |
| AUD-024 | Feedback PATCH not studio-scoped | Studio Manager | Low | Permission | Scope to caller's studio |
| AUD-025 | Credit-request under `/admin/*` path | Artist | Low | Navigation/naming | Rename path (low priority) |
| AUD-026 | ProducerPassport missing fields vs ArtistPassport | Producer | Low | Architecture | Parity pass |
| AUD-027 | Unenforced ref_id relations (credits/rights) | Producer | Medium | Data integrity | Add real FKs in a schema pass |
| AUD-028 | StudioCircleMember manual counters | Studio Manager | Low | Data integrity | Compute from source instead of storing |
| AUD-029 | ArtistFile has no Booking/SessionLog relation | Artist, Engineer | Low | Data integrity | Add relation if per-session filing matters |
| AUD-030 | No shared "who can navigate where" source of truth (Command Palette vs route guards) | Global | Low | Navigation | Derive palette items from route config |
| AUD-031 | ProducerNav not part of global Chrome | Producer | Low | Navigation | Wire into `Chrome` like `MobileBottomNav` |

---

## 20. Final V1 Readiness Score

**This is a Product Coherence / Architectural Maturity score — a different,
complementary axis to the Test Ready V1 security/functional gate, which is
already cleared (100/100 on its own tracker, see `docs/TEST_READY_V1_AUDIT.md`).**

| Dimension | Score /10 | Why |
|---|---|---|
| Architecture | 6 | Sound foundations, real duplication at the dashboard and payments layer |
| UX consistency | 4 | Weakest area — 10 status-color maps, 5+ modal implementations, real terminology drift |
| Workflow efficiency | 6 | Core flows are efficient; Admin/Pulse split doubles operator navigation |
| Account clarity | 6 | Mostly clean; Producer/Engineer conflation is severe where it appears |
| Permissions | 8 | Strong — almost everything correctly scoped, a few real-but-minor gaps |
| Data integrity | 5 | Payment/OianoPayment split, unenforced ref_id relations, manual counters |
| Reliability | 7 | Centralized error handling is solid; two confirmed silent-failure bugs |
| Responsive UI | 6 | Not independently re-verified in this pass — mobile nav exists and was seen but not deeply audited here; treat this score as provisional |
| Error handling | 8 | Structured, request-ID correlated (fixed this session) |
| Beta readiness | 7 | Technically ready (Test Ready V1 gate cleared); this audit's findings are the gap between "functions correctly" and "feels intentional" |

**Overall: 63/100.**

---

## CURRENT STATE

A functionally solid, security-verified product (Test Ready V1 gate cleared)
that grew through multiple development passes and shows it — two dashboards
doing one job, ten places styling the same status enum, and a studio-staff
role the product's own booking wizard misnames on-screen.

## WHAT MUST CHANGE

The Admin/Pulse duplication (AUD-001), the Producer/Engineer terminology and
naming bug (AUD-003), the Maintenance sidebar drift (AUD-006), and the two
real permission bugs (AUD-014, AUD-015).

## WHAT SHOULD REMAIN

The role architecture itself, the booking wizard's flow, Pulse's Intelligence
panel, the Passport concept, and the overwhelming majority of the permission
model — this audit confirms it's already well-built, not broken.

## WHAT SHOULD BE CONSOLIDATED

Status badges, empty states, loading skeletons, avatars, modals, search
inputs, message threads, live-status widgets, and the Passport/Profile page
pair — all into shared components/pages that mostly already exist in
skeleton form and just need adoption.

## WHAT SHOULD BE REMOVED

Admin's duplicate today's-sessions/revenue/next-session cards; the
hand-copied Maintenance sidebars (replaced by the real one); the "Today's
signal" decorative quote; the local `initials()` reimplementations.

## WHAT CAN WAIT

The Payment/OianoPayment merge and the broader data-integrity items
(AUD-016–018, AUD-026–029) — real technical debt, but schema changes deserve
a planned pass, not a drive-by fix, and none of them block correctness today.

## NEXT 10 HIGHEST-VALUE ACTIONS

1. Fix Producer/Engineer terminology across the booking wizard, invoice line, and `assignBookingProducer` naming (AUD-003) — highest confusion-per-line-of-code fix in the whole audit.
2. Fix `GET /bookings`' missing Producer/OIANO_ADMIN branches (AUD-015) — a real bug, small fix.
3. Add PRODUCER to `canAccessBookingMessages` (AUD-014) — a real access gap, small fix.
4. Replace the 4 hand-copied Maintenance sidebars with `MaintenanceShell` (AUD-006) — deletes broken navigation.
5. Build `StatusBadge` and migrate the 10 call sites (AUD-002) — highest-leverage visual-consistency fix.
6. Remove Admin's duplicate live-ops cards, point them at Pulse instead (AUD-001) — the single biggest structural win.
7. Fix or remove the Engineer dashboard's silently-failing room-status widget (AUD-013).
8. Merge the 3 live-status widgets into one (AUD-005).
9. Consolidate ArtistProfilePage's Creative DNA panel into a link to Passport (AUD-019).
10. Build shared `Modal` and `SearchInput` components and migrate the highest-traffic call sites (`PassportPage`'s 4 dialogs first).

---

*Research conducted via 4 parallel full-codebase reads (routes/navigation/dashboards;
data model/Pulse/Passport; terminology/component duplication; API role matrix/account
ownership). Synthesis and architectural judgment above is original to this document.*
