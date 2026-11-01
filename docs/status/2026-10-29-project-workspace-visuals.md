**The artist project workspace header and production path now use shared experience tokens without changing project or phase semantics.**

## What was wrong

The project workspace retained a separate set of hardcoded colors, surfaces, borders and spacing after the shared experience tokens were introduced. This made the project header and production path visually inconsistent with the migrated creator surfaces.

## What changed

- Applied the shared canvas, surface, border, text, gold, radius, spacing and elevation tokens to the project header, picker selection, section links and production path.
- Preserved actual API-backed project names, producer names, counts, the six existing production phases, and the explicit distinction between phase and completion score.
- Updated the UI transition guide to distinguish completed visual migrations from file-row and Passport work that remains.

## Evidence

| Check | Result |
|---|---|
| `npm run test --workspace=apps/web -- src/components/ProjectWorkspaceHeader.test.ts src/pages/ArtistProjectsPage.test.ts` | Passed: 2 files, 10 tests |
| `npm test --workspace=apps/web` | Passed: 26 files, 222 tests |
| `npm run typecheck --workspace=apps/web` | Passed before the CSS-only change |
| `npm run build --workspace=apps/web` | Passed after the change |
| `git diff --check` | Passed |

## Not exercised

No browser visual comparison, API/database integration, production deployment, or canonical domain migration was performed. The change is limited to CSS and does not alter project reads, writes, navigation destinations or financial behavior.

## Observed, not changed

Project file-row styling and Passport presentation remain future UI increments. The production phase labels and progression remain tied to current project state; no completion percentage or verification status was introduced.
