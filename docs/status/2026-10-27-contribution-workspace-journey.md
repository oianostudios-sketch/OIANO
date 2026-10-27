**Accepted contributors can return from the contribution inbox to a project workspace, with separate credit and rights decisions.**

The inbox now distinguishes invitations awaiting a response from accepted
contributions and prior decisions. Only accepted contributions link to a
workspace, using the exact participant id; archived project context remains
visible. Loading, request failure, retry and an actually empty inbox are distinct
states.

The workspace presents the contributor's project role and brief, team, linked
sessions and deliverables, scoped project conversation, proposed credits and
rights agreements. Credit confirmation and rights approval remain separate
actions against the existing API contracts. The existing API continues to
enforce that a workspace belongs to the authenticated accepted contributor.
Responsive spacing, text contrast, touch targets, focus indicators and section
anchors are styled for this journey. No endpoint, schema, migration, studio
scope or financial behavior changed.

**Evidence**

- `npm test --workspace=apps/web -- --run src/pages/ContributionJourney.test.ts`: 14/14 passed.
- `npm test --workspace=apps/web`: 212/212 passed across 26 files.
- `npm run typecheck --workspace=apps/web`: passed.
- `npm run build --workspace=apps/web`: passed.
- `npm run security:secrets`: passed across 590 tracked files.
- `git diff --check`: passed.
- Defect-first check: temporarily treating non-invited records as accepted made
  the accepted-only workspace-link test fail (3 links instead of 1); restoring
  the `ACTIVE` filter returned the focused suite to 14/14 passing.

**Not exercised:** a browser/device rehearsal of this contribution journey,
physical touch input, the full repository suite, and fresh-database integration
tests. Browser screenshots present in the worktree were not re-captured or
independently validated during this continuation.
