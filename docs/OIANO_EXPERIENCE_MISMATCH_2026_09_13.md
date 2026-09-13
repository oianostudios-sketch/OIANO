# Experience mechanism review — 13 September 2026

Baseline: `5961372`, clean working tree, after Claude's stabilization sessions.
Authority: `OIANO_FROZEN_ARCHITECTURE.md`, including the owner's September 12 decisions.

## What the current experience teaches

OIANO still introduces a studio-oriented, role-separated product. The discrepancy is structural, not confined to marketing. The entry screen says “Africa's new way to do music”; ordinary artist sign-in goes to a calendar. Artist mobile navigation emphasizes booking and omits projects. Producer navigation introduces a separate “Producer Portal”. Artist projects cannot be started by their artist: the empty state waits for a producer. The dashboard offers a second client-selected “next move” above the server's actual pending decisions, and prominently presents a Passport percentage as strength.

The first browser inspection confirmed the entry screen. The initial demo sign-in failed while the local development services were stopped. Signed-in observations below are source findings until separately verified in the running browser.

## Prioritized mismatch map

| Priority | Surface / mechanism | Current behavior and evidence | Required direction | Correction boundary |
|---|---|---|---|---|
| P1 | Entry (`EnterPage`) | Artist default is calendar; separate account types; claims one identity and growing roles | Introduce Creative Work Network and return to work; accurately explain current access | Presentation + default destination now. Persistent identity later |
| P1 | Navigation (`App`, `MobileBottomNav`, `ProducerNav`) | Different role-specific maps; projects absent from artist bottom navigation | Consistent access to projects, contributions, people and professional record | Shared creator navigation now; retain operational permissions |
| P1 | Artist home (`DashboardPage`, `NextAction`) | Client session/project CTA competes with server decisions; no-work and all-clear both push booking | Important domain state takes precedence; booking is a supporting action | Move server decisions first; neutral empty-state choices, no invented work |
| P1 | Formation (`ArtistProjectsPage`, producer project creation) | Producer creates Project; artist waits for producer; production phase sequence assumes music | Any person can start Work; add requirements and contributions | Canonical Work migration required. Do not hide this by renaming Project |
| P1 | Discovery (`DiscoverPage`) | Name/genre filters and creative-DNA overlap, profile-strength bars | SKY matches real requirements and evidence | Keep called discovery; Requirement and evidence projection needed before SKY |
| P1 | Identity (`accountArchitecture`, role-gated routes) | Artist/Producer/Engineer still determine access and separate records | Persistent person with contextual contribution roles | Identity migration required; navigation alone does not implement it |
| P2 | Project context (`ArtistProjectsPage`) | Sessions, collaborators, rights and credits exist; files matched by folder name | Work owns context, explicit links to events/deliverables/versions | Show current relationships honestly; explicit file context needs migration |
| P2 | Delivery and attribution | Delivered phase is shown beside a studio trust badge; draft and confirmed credits differ | Delivery, accepted credit and provenance are separate facts | Do not imply delivery verifies all obligations or attribution |
| P2 | Record on home | Passport percentage presented as strength; mixes filled profile and activity | Inspectable record with sources; no synthetic trust score | Remove strength percentage from home prominence; deeper Passport review pending |
| P2 | Agreement and money | Rights proposals, consent, wallet and booking payments exist separately | Agreement creates explicit obligations, amount + currency + settlement medium | Preserve tested financial behavior; canonical migration required |
| P2 | Communications | Existing inbox aggregates notification/message sources | NOW projects domain state; messages support work context | Keep inbox distinct; do not relabel it NOW |
| P2 | Network | Weave currently derives artist–studio connections from completed bookings | Meaningful relationships across contributions and evidence | Preserve stabilized projection; Weave v2 follows canonical evidence |

## First implementation boundary

Improve the existing journey: sign in → see actual pending decisions → open projects or contribution invitations → use their existing workspace → inspect the record. Shared creator navigation makes these mechanisms reachable on desktop and mobile. Correct entry copy and visible Passport/delivery claims.

This is not MAKE, SKY, ME or NOW v1. Do not introduce those labels over legacy mechanisms, add canonical domain tables, simulate requirements, or imply artists can create projects today. The frozen migration order still applies. Studio and platform operational navigation remains scoped to their existing responsibilities.

## Remaining gate

Claude's `OIANO_STABILIZATION_GATE.md` reports tracked migrations apply, but schema drift remains in nine tables. This pass does not reopen financial behavior or resolve that gate. Canonical migration must not begin based on experience changes.

## Verification and results

### Changes made

- Entry and browser metadata introduce Creative Work Network. Ordinary artist sign-in returns to the dashboard; explicit artist return destinations and onboarding are preserved. Discipline selection describes practice, not a contribution already made.
- One responsive creator navigation replaces the creator ecosystem strip, role-specific bottom tabs and producer-only navigation links. Projects, Contributions, People and Passport share a consistent map; Messages and Account remain available. Studio administrator and engineer operational navigation is preserved.
- Artist home renders the server's next-decision panel before general context cards. Loading, failure and empty attention remain distinct. Empty attention offers projects, invitations and people. Actual pending payment, rights and delivery links retain their server-selected destinations.
- Projects and contributions replace booking and calendar as the leading artist shortcuts. Sessions remain reachable through the existing context cards and project links.
- The home Passport tile presents a record, without a strength percentage. Artist project copy no longer promises artist project creation. A delivered project no longer receives a generic studio-verification badge implying its other decisions are settled.
- No canonical surface or domain was implemented. No API, schema, dependency, authentication permission or financial behavior changed.

### Checks

| Check | Result |
|---|---|
| `npm test` | Passed: 80 API/security, 31 intelligence, 70 web tests at that point |
| Final `npm run test --workspace=apps/web` | Passed: 75 tests across 9 files, including 15 new component tests |
| `npm run typecheck --workspace=apps/api` | Passed |
| Web TypeScript | Passed standalone and in the final web build |
| `npm run build --workspace=apps/web` | Default output cleanup blocked by EPERM on existing `apps/web/dist/assets` |
| `npm run build --workspace=apps/web -- --outDir C:/Users/oiano/AppData/Local/Temp/oiano-experience-build-verified-20260913` | Passed, 2,028 modules transformed; fresh output does not modify the old build folder |
| `npm run security:secrets` | Passed across 407 tracked files; new files separately reviewed |
| `git diff --check` | Passed |
| Live browser | Entry title, sign-in and signup presentation verified at localhost:5173 |
| Isolated component browser preview | Actual shared navigation and pending-decision component rendered with labeled sample data; inspected at desktop and 390px mobile widths. Temporary preview files removed and viewport reset |
| Authenticated browser journey | Blocked: configured database unavailable; API `/health` returns 503. No claim of end-to-end signed-in verification |
| Database integration / migration replay | Not rerun in this experience-only pass; Claude's recorded schema-drift gate remains open |

The component suite verifies artist/producer destinations, actual navigation to Contributions, nested-route active state, no duplicate creator bottom navigation, preserved studio/engineer tabs, empty-state choices, retained settlement source links, loading and failure behavior.

### Files changed

- `apps/web/index.html`
- `apps/web/src/App.tsx`
- `apps/web/src/components/CreatorNavigation.tsx` (new)
- `apps/web/src/components/MobileBottomNav.tsx`
- `apps/web/src/components/NextAction.tsx`
- `apps/web/src/components/ProducerNav.tsx`
- `apps/web/src/components/creatorExperience.test.ts` (new)
- `apps/web/src/lib/accountArchitecture.ts`
- `apps/web/src/lib/creatorNavigation.ts` (new)
- `apps/web/src/pages/ArtistProjectsPage.tsx`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/pages/EnterPage.tsx`
- This report (new)

Branch creation (`git switch -c codex/experience-mechanism-pass`) was blocked because `.git` is read-only in this workspace's permission profile. All changes are uncommitted on the existing checkout; nothing was pushed or deployed. Claude's commits are unchanged.

### Next steps

1. Restore the configured development database connection, then verify the real signed-in artist and producer journey, including pending invitations, populated projects, delivery and record screens.
2. Resolve the recorded schema/migration drift and rerun the stabilization gate before canonical migration.
3. Follow the frozen migration order. Independent work creation, contextual contributions, requirements and agreements are the substantive mechanism changes needed for the Golden Journey. Do not call profile browsing SKY or the existing projects page MAKE v1.
