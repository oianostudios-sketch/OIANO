**Creator Home and discovery now surface server-backed work and decisions in responsive, accessible layouts.**

## What was wrong

Home repeated a dashboard-style briefing and reduced upcoming sessions to a narrow context projection. Discovery did not distinguish an unavailable roster from a confirmed empty result, and its filter controls did not expose selection state to assistive technology. The compact Home identity also needed to avoid Passport-only collaboration and account-access detail.

## What changed

- Replaced the duplicate Home briefing with the existing server-ranked next action, current projects, and actual upcoming bookings. Session rows use the booking endpoint's studio timezone and real booking destinations; pending, confirmed, and still-running sessions are eligible.
- Kept profile, wallet, and creator-navigation actions reachable, and made the compact Home identity omit Passport-only detail.
- Displayed actual project participants when supplied, without fabricating project artwork.
- Added explicit roster retry and stale-data feedback, accessible genre/energy pressed states, responsive token-based discovery styles, and a concise mobile navigation row.
- Removed a stale import of a nonexistent `DashboardPage.css`; the page's existing scoped styles remain in place.
- Preserved existing project, Passport, role-gating, and booking behavior.

## Evidence

| Check | Result |
|---|---|
| `npm test --workspace=apps/web` | Passed: 26 files, 222 tests |
| `npm run typecheck --workspace=apps/web` | Passed |
| `npm run build --workspace=apps/web` | Passed |
| `npm run security:secrets` | Passed: 594 tracked files |
| `git diff --check` | Passed |
| Integrated browser, 1440px Home and 390px Home/discovery/Projects/Passport | Inspected; at 390px the document had no horizontal overflow |

Load-bearing tests were checked defect-first, then the code was restored: including cancelled bookings as upcoming failed the session test; forcing a discovery filter's `aria-pressed` to remain false failed the filter test; replacing the server-provided action destination failed the action-link test; and rendering account-access detail in compact identity mode failed the identity test. The complete web suite passed after restoring the intended behavior.

## Not exercised

API and database integration suites were not run because this increment changes only web presentation and tests. The browser check used the checkout-local `oiano_dev_test` database; no shared or production database was used. The supplied attachment was text rather than a reference image, so the visual review could not compare against the original image.

## Observed, not changed

The existing project workspace and Passport remained usable at the mobile viewport, so their domain and privacy behavior was left unchanged. Project artwork is not available in the project response and was not invented.
