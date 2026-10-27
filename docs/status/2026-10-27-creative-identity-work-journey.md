**The Artist Home, selected project workspace and private Passport now form a verified, person-first frontend journey using existing data and actions.**

Home and Passport share the chosen-name/bio/collaboration-interest presentation,
with account access in secondary context rather than replacing creative
identity. Home lists real current projects with exact workspace links and
separate loading, error/retry, stale-cache and confirmed-empty states. Passport
puts the person's description before its legacy card and metrics, exposes the
existing profile editor, links public-work rows to their workspace and explains
visibility in its empty state. Toolbar overlap and alias/bio label associations
were corrected. An unbroken long project title revealed a narrow picker
min-content sizing defect, fixed with one scoped `min-width: 0`.

This extends the [workspace checkpoint](2026-10-27-project-workspace-ui-upgrade.md).
The [UI experience report](../internal-rollout/UI_EXPERIENCE_REPORT.md) records
the exact surfaces, eight synthetic before/after screenshots, limitations and
next batch. [HANDOFF](../internal-rollout/HANDOFF.md) is updated.

**Evidence:** 11 new journey tests passed in the final targeted rerun and 16
existing header/workspace/message regressions passed. The combined final
attempt's journey worker failed to start, not a passing four-file run; cleanup
and the affected-file rerun are explicit. Frontend `tsc`/Vite build, editor
diagnostics, diff whitespace and secrets checks passed. Removing the project id
from the destination failed its regression. Restoring the defective picker CSS
reproduced 957px document width at a 390px viewport; the fix restored 380px.

Real local sign-in and desktop Home -> selected project -> Passport/editor ->
projects passed. At 390px, failed profile save retained the draft, retry saved
through the API, reload preserved it and the original bio was restored.
Current-work read failure/retry, a separately mocked empty state, keyboard
focus/Enter and actual anonymous 401 were checked. Normal content and explicit
long-content fixtures each passed all 15 page/width combinations across
320/390/768/1024/1440px. The stress fixture included missing portraits, 12
interests, 20 collaborators and a long message.

No shared database, migration, seed, schema/backend/auth/access-policy,
financial/rights/consent, infrastructure, production, push or deployment action
occurred. Session-only launch code verified the checkout-owned database and
disabled external integrations. Synthetic project archived; two credentials
and auth versions invalidated; old Artist token refused; credential manifest
and browser auth/profile removed. Task-owned previews stopped; PostgreSQL kept.
Unrelated local settings, documentation changes and architecture proposal left
untouched.

**Not exercised:** full repository suites, fresh-database integration, physical
phone, other browser engines, full accessibility certification, public sharing/
printing/uploads/visibility mutations and participant acceptance.

**Observed, not changed:** Artist fields are not canonical multi-discipline
identity; collaboration interests are not advertised as disciplines. Legacy
music-specific surfaces and score semantics remain. The context service can
offer a generic first-step prompt despite existing projects. Canonical migration
and pilot gates remain open. Next UI slice: contribution list -> accepted
contribution workspace using current contracts, not invented capabilities.
