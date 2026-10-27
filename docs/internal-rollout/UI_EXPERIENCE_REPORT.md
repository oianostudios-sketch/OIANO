# Creative identity and current-work journey

- Date: 2026-10-27
- Branch: `chore/reviewed-local-checkpoint`
- Scope: frontend source and local evidence, not a deployment.

## Intended experience

A person recognizes their chosen name and their own description on Home, finds
current work, opens the exact project, understands its people and decisions, and
can return to their Passport to describe themselves. Their account access is
available as secondary context, not presented as the whole of their identity.

The representative path is **Artist Home -> selected project workspace ->
private Passport -> existing profile editor / return to projects**. This extends
the [earlier workspace upgrade](../status/2026-10-27-project-workspace-ui-upgrade.md),
not every account type or every screen.

## What changed

| Screen / shared component | Change and reason |
|---|---|
| [DashboardPage](../../apps/web/src/pages/DashboardPage.tsx), `/dashboard` for Artist accounts | Shared person-first heading, actual Artist bio rather than the old Passport bio lookup, existing collaboration interests, direct Passport/editor actions, and a real current-project list below the existing pending-decision panel. |
| [CurrentWork](../../apps/web/src/components/CurrentWork.tsx) | Reuses the existing `/artist-projects` API and query key. Up to four active, non-delivered projects link to their exact query-selected workspace, with their actual lead and phase. All projects remain reachable. Loading, failed read/retry, stale cached data and confirmed empty states are distinct. |
| [PassportPage](../../apps/web/src/pages/PassportPage.tsx), `/artist/passport` | Name, description and interests precede the legacy card and statistics at desktop and mobile widths. The existing profile editor is now reachable here. Existing public-work rows link to their workspace; the empty copy explains visibility rather than implying private work is missing. Existing visibility, sharing, release and consent mechanisms remain intact. |
| [CreativeIdentity](../../apps/web/src/components/CreativeIdentity.tsx) and [CreativeJourney.css](../../apps/web/src/components/CreativeJourney.css) | Typed shared identity presentation, original dark/gold tokens, editorial display hierarchy, readable description, wrapping interest labels, native links/buttons, visible focus and secondary account-access disclosure. Missing descriptions use an invitation to describe oneself, not a generated biography. |
| [ProfileEditDrawer](../../apps/web/src/components/ProfileEditDrawer.tsx) | Reused without changing its API or save semantics. Associated the existing alias/bio labels with their controls. |
| Passport toolbar | Removed its negative-margin/sticky overlap with the global navigation; enlarged toolbar and mobile overflow controls to at least 44px and provided visible keyboard focus. |
| [ArtistProjectsPage.css](../../apps/web/src/pages/ArtistProjectsPage.css) | One sizing rule lets project-picker buttons shrink inside narrow grid tracks. Stress testing isolated an unbroken long title as the overflow source; collaborator content was not the cause. |

No sample names, balances, badges or project data were copied into product code.
The screenshots' DIYAA / GTGHV3 labels are explicitly synthetic local review
records, not participant identities.

## Before and after

All images use synthetic checkout-local data. Desktop is 1440 x 1000 CSS pixels;
mobile-width is 390 x 1000. These are viewport screenshots, not physical-phone
evidence. The eight image files are included alongside this report.

| Screen | Before | After |
|---|---|---|
| Home, desktop | [Before](ui-experience/2026-10-27/home-before-desktop.png) | [After](ui-experience/2026-10-27/home-after-desktop.png) |
| Home, mobile-width | [Before](ui-experience/2026-10-27/home-before-mobile.png) | [After](ui-experience/2026-10-27/home-after-mobile.png) |
| Passport, desktop | [Before](ui-experience/2026-10-27/passport-before-desktop.png) | [After](ui-experience/2026-10-27/passport-after-desktop.png) |
| Passport, mobile-width | [Before](ui-experience/2026-10-27/passport-before-mobile.png) | [After](ui-experience/2026-10-27/passport-after-mobile.png) |

The baseline preview loaded the two original page modules from `b7cb8d0`
read-only, against the same synthetic API records. A session-only local proxy
used the already approved local frontend origin; no API CORS policy or
authorization code changed. Integrated screenshot resizing proved unreliable
(tiled/inconsistent captures), so those attempts were overwritten with verified
system-Chrome headless/CDP captures at measured CSS dimensions.

## Interactions and checks actually completed

| Evidence | Result |
|---|---|
| Real sign-in through the existing entry form | Synthetic Artist reached Home; no auth-flow changes. |
| Desktop journey | Home's current-work link retained the exact project id, opened the real workspace, then reached Passport, opened/closed the existing editor and returned to projects. |
| Mobile-width profile editing, 390px | Injected PATCH 503 displayed the explicit error and retained the bio draft. Retry used the real API; reload preserved the change. The original synthetic bio was then restored through the same editor. |
| Mobile-width current-work failure/retry | Injected GET 503 was not shown as empty. Retry restored the real project list. A separately mocked empty response offered the existing contribution route. |
| Keyboard / focus | Tab/Shift+Tab produced a visible solid outline on the project link; Enter opened its selected workspace. The measured link target exceeded 44px. Alias and bio were addressable by their labels. |
| Normal-content responsive matrix | Home, Passport and workspace at 320, 390, 768, 1024 and 1440px: 15/15 combinations without document horizontal overflow. |
| Content-heavy responsive matrix | Same 15 combinations passed with response-only fixtures: long unbroken names/title, long bio, missing portrait, 12 collaboration interests, 20 contextual collaborators and a long conversation message. Contributor count and message presence were asserted, not just page width. |
| Unauthenticated access | Actual project API request without a bearer token returned 401 after removing the empty-response mock. |
| Cleanup | Project archived; both synthetic account hashes randomized and auth versions incremented; transient credential manifest removed. The old Artist token returned 401; browser auth cleared. Task-owned API, web, baseline preview and headless browser stopped; their ports no longer listened. Temporary Chrome profile removed. Checkout PostgreSQL retained. |

These are actual local browser checks, not a newly installed or claimed CLI
Playwright suite. Empty/failure/stress responses were mocked only where stated;
sign-in, the selected-project journey, profile persistence and access refusal
used the real local API/database.

### Tests, build and mutation evidence

- [CreativeJourney.test.ts](../../apps/web/src/components/CreativeJourney.test.ts):
  **11 tests passed** in the final targeted rerun.
- Existing header, Artist project and message-thread regressions: **16 tests
  passed**. Across the four files the verified total is **27**.
- The final combined attempt had a worker-startup timeout for the new journey
  file, while the other three files passed. The affected file was rerun on its
  own after preview cleanup and passed; this was not treated as a green combined
  run.
- Mutation: replacing the selected-project destination with `/projects` made
  the exact-destination regression fail. Restoring it returned the suite to
  green.
- Browser CSS mutation: correct narrow layout measured `390 / 380`
  (viewport/document width). Restoring the defective picker `min-width: auto`
  measured `390 / 957`; restoring the fix returned `390 / 380`.
- `npm run build --workspace=apps/web`: **passed**, including `tsc` then Vite.
  Build followed the targeted test, not a concurrent shared-output check.
- Editor diagnostics: no errors in the changed TypeScript/TSX files.
- `git diff --check` and `npm run security:secrets`: passed before commit.

No dependency installation, backend changes, migrations or seeding were required.
The normal local launcher runs migrations, so review used a session-only guarded
launcher with its established isolated settings instead: explicit checkout-owned
database identity check, `NODE_ENV=test`, and external integrations disabled.
Neither shared `.env` database was read or used.

## Deliberately unchanged and not verified here

- No full repository test/build run, fresh-database integration suite or
  production-parity validation in this frontend batch.
- No physical phone, Safari, Firefox, assistive-technology certification or
  complete WCAG audit. Long-content fixtures exercise layout, not canonical
  multi-discipline persistence.
- Profile visibility toggles, public-link sharing, EPK printing, artwork uploads,
  release mutations and consent actions were not browser-rehearsed in this
  batch. Their existing handlers and access policies were preserved.
- Workspace messaging, delivery/rights/consent decisions, booking invalidation,
  private file tickets, ledger and payment behavior were not redesigned.
  Message-thread regressions passed; prior live-recipient/reconnect evidence
  remains bounded by its original report.
- Legacy dashboard sections, music-specific profile editors/card labels,
  profile-strength scoring and the public Passport presentation remain. This is
  a coherent first slice, not completion of the network-wide identity migration.
- Operator inventory, isolated pilot readiness, participant acceptance and the
  deferred phone rehearsal remain open. No participants were contacted.

## Backend-dependent gaps

The Artist profile has a bio and collaboration interests, not the canonical
multi-discipline CreativeProfile. Interests are labelled as interests; no
discipline objects or permissions were invented. Contextual collaborator roles
remain project data. Canonical identity/contribution/discipline work must follow
the frozen migration order and stabilization gate.

Existing phases are statuses, not measured completion; credits remain distinct
from ownership. No new evidence, verification, capability or rights claims were
introduced. The existing context service can offer a generic first-step prompt
even when the independent project list contains work; its prioritization was
not changed in this frontend-only batch.

## Next bounded UI batch

Apply the same hierarchy to **Contributions list -> accepted contribution
workspace**: make the person's contextual responsibility, actual invitation
state, team, conversation and next permitted action clear. Reuse existing
contracts and identity fields. Keep Producer/Artist permissions explicit, test
empty/error and refused access, and obtain physical-phone evidence when the
owner authorizes it. Do not start the canonical migration or deploy this UI as
a side effect.
