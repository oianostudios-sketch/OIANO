**Home now leads with next actions, current work and collaboration for both creator account types, without changing route addresses or permissions.**

The owner selected an incremental Home improvement rather than replacement
architecture or a new sign-in destination. This extends the
[entry/current-work improvement](2026-10-29-creative-network-entry-current-work.md).

## Audit and disposition

| Source | Finding | Outcome |
|---|---|---|
| [App.tsx:82](../../apps/web/src/App.tsx#L82) | Professional Home rendered the same project board as Projects. | Home uses an overview mode of the existing professional page; `/producer` retains the full project board. |
| [DashboardPage.tsx:437](../../apps/web/src/pages/DashboardPage.tsx#L437) | Network detail competed with active work on artist Home. | Optional, closed-by-default native disclosure. Existing activity/relationship reads remain intact. |
| [DashboardPage.tsx:534](../../apps/web/src/pages/DashboardPage.tsx#L534) | A second identity/DNA panel competed with the participant's authored identity. | Optional profile-detail disclosure and neutral empty-state copy; editing remains available. |
| [CurrentWork.tsx:40](../../apps/web/src/components/CurrentWork.tsx#L40) | Current work did not surface waiting invitations. | Explicit invitation count and review link; proposed participation is never rendered as accepted work. |
| [NextAction.tsx:58](../../apps/web/src/components/NextAction.tsx#L58) | Shared project shortcuts and legacy rights-attention links pointed professionals at artist-only routes. | Professional project shortcuts use `/producer`; legacy rights attention uses Contributions as a review entry point, including secondary/overflow rows. |
| [ProducerDashboardPage.tsx:531](../../apps/web/src/pages/ProducerDashboardPage.tsx#L531) | A failed profile read looked like a missing account. | Explicit retryable error. A real HTTP 404 retains account setup; incomplete onboarding retains its setup gate. Cached Home profile errors are disclosed. |
| [DashboardPage.tsx:390](../../apps/web/src/pages/DashboardPage.tsx#L390) | Announcement dismissal lacked an accessible name and adequate touch target. | Named button with a 44 px target and readable color. |

Professional current work reuses the full `['producer', 'me']` cache and existing
`/producer/me` response, not the artist-only project endpoint. Owned-project links
open their encoded professional editor URLs; accepted contributions retain
workspace URLs and contextual roles. The preview still deduplicates projects,
excludes archived/delivered work and caps the combined list at four.

The quiet attention heading now invites a next step rather than asserting that
nothing needs the participant. Invitation attention is independently read from
the existing contribution inbox. No professional ranking or evidence is invented.

## Evidence

- Demonstrated failing regressions before fixes for professional project reads,
  quiet-state navigation, distinct Home composition, retryable profile failures,
  invitation attention and legacy professional rights navigation.
- Temporarily removed the artist network disclosure and observed the Home
  regression fail; restored it before final verification.
- Tests preserve actual missing-profile and incomplete-onboarding gates and prove
  recovery after a failed profile read.
- Final web suite: **27 files, 247 tests passed**.
- Web typecheck and production web build passed.
- Repository secrets scan passed across 594 tracked files; whitespace check passed.
- Browser: artist and professional Home at **320, 390 and 1440 px**, no horizontal
  overflow. Checked encoded current-work links, role-correct destinations, active
  Home selection, professional Projects board and return to Home.
- Browser: network disclosure opened/closed with Enter; subsequent Tab focus had
  a visible solid outline. Profile details defaulted closed. Announcement dismissal
  removed the notice.

## Test isolation and cleanup

Browser checks used a frontend-only preview and an explicit synthetic fixture
server, not the API application, a database or production data. Browser request
interception did not complete reliably in this tool environment; the local fixture
server supplied the same explicit responses instead. Temporary JSX transform
errors during editing were corrected before final tests/build and browser checks.
The synthetic browser auth state was cleared, the page returned to entry, and
task-owned frontend/fixture processes were stopped.

## Not exercised

No live database-backed journey or production deployment was run for this change.
Invitation counting and the rights-navigation adaptation have automated coverage;
the browser fixture contained accepted work, not pending invitation/rights cases.
Studio/operator Home screens and financial flows were not changed.

## Observed, not changed

- [App.tsx:154](../../apps/web/src/App.tsx#L154) and
  [App.tsx:184](../../apps/web/src/App.tsx#L184): legacy `/passport` and `/profile`
  aliases still route to the artist Passport. Current Home links use role-correct
  destinations; changing legacy aliases is a separate navigation follow-up.
- Older studio ticker/profile-detail text still has low-contrast styling. This
  increment is not a claim of full application accessibility compliance.
- The legacy context service does not include contribution invitations in its
  attention ranking. Home presents inbox invitations independently, without
  changing server priority, agreements, ledger behavior or authorization.
- The professional rights shortcut is an inbox entry point, not a direct
  agreement deep link. Participants choose their accepted workspace to review
  its rights record; no new access is granted.
- Canonical migration remains subject to its existing stabilization gate.
