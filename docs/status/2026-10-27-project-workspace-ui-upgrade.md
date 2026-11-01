**The Artist project workspace now uses the approved editorial dark/gold direction with live project data, while retaining its existing actions and access boundaries.**

The standalone design study was approved for implementation. This first product slice
updates [ArtistProjectsPage](../../apps/web/src/pages/ArtistProjectsPage.tsx), not the
entire application or its canonical architecture.

## What changed

- Added a typed [workspace header](../../apps/web/src/components/ProjectWorkspaceHeader.tsx):
  project title, producer, archive state, update label and actual session,
  collaborator and file counts. Decorative geometry does not imply participant media.
- Reused the phase labels between the picker and header. All six production stages
  remain readable on mobile, with the current phase exposed as `aria-current="step"`.
  Removed the picker meter that visually resembled a completion percentage.
- Added native section links for decisions, conversation, people/sessions and files.
  Existing project query selection remains intact.
- Added [page-scoped styling](../../apps/web/src/pages/ArtistProjectsPage.css) for
  hierarchy, readable secondary text, contextual cards, focus states and touch targets.
  Existing shared creator navigation remains unchanged.
- Kept existing project actions, messaging, private file-ticket access, session
  attach/detach confirmation and booking/availability invalidation. No API, schema,
  money writer or authorization changes.
- No prototype people, fictional pending decisions, simulated controls, new surface
  names, verification marks or future mechanisms were added to product code.

## Evidence

| Verification | Result |
|---|---|
| Shared package build | Passed, exit 0 |
| Focused workspace/header/message tests | 3 files, 16 tests passed, exit 0 |
| Final production web build (`tsc` and Vite) | Passed, exit 0 |
| Editor diagnostics for the five code/style/test files | No errors |
| Browser with the real local API | Synthetic Artist signed in and read its own project |
| Responsive browser layout | 1440, 1024, 768, 390 and 320 CSS px; no horizontal overflow |
| Desktop/mobile-width interaction | All four section links preserved project selection; POST 503 retained draft; retry saved one message, visible after reload |
| Session picker | Opened and closed against real available-sessions API |
| Anonymous project API read | 401 |
| Secrets / whitespace | Passed |

Focused command:

```text
npm run test --workspace=apps/web -- src/components/ProjectWorkspaceHeader.test.ts src/pages/ArtistProjectsPage.test.ts src/components/MessageThread.test.ts --pool=threads --maxWorkers=1
```

New assertions cover supplied identity/counts, absence of prototype fixtures, archived
and zero-count states, phase semantics, resolvable section links, private file-ticket
opening and project-load failure/retry. Existing attachment and message regressions
remain green.

**Defect put back:** temporarily marking every production phase current caused two
header assertions to fail (exit 1). Restored the correct marker and reran the final
16-test selection successfully.

The editor test adapter discovered no tests, so validation used the repository's
Vitest command. The first default fork-worker run timed out before executing tests;
the bounded single-thread-worker invocation passed. A test-fixture nullability error
was caught by the first build and corrected using the component's actual prop type.

Browser assertions ran inline through the integrated Playwright tools. An equivalent
session-only replay module was saved and syntax-checked, but was not executed as an
assembled CLI suite. An initial navigation attempt ran from the dashboard rather than
the project, and another used a host-unavailable `URL` constructor; the corrected
project-scoped browser checks passed. These were harness issues, not passing results.

## Local safeguards and cleanup

Used only `npm run dev:local`. API health reported a connected database and the web
returned HTTP 200. The fixture script additionally verified the database name and
this checkout's PostgreSQL data directory before creating two synthetic accounts and
one project. No existing demo credential was reset. No studio or money data was created.

After rehearsal, the synthetic project was archived, both accounts' password hashes
were randomized, auth versions incremented and the fixture manifest removed.
The old Artist token was checked for refusal, browser auth state cleared and the
task-owned development runner stopped. The pre-existing local PostgreSQL cluster
was left running.

## Not exercised

- Physical phone/touch, screen reader or comprehensive accessibility conformance.
- Live cloud/production, real participant media, pending rights/consent decisions,
  payment flows, or multi-recipient realtime delivery.
- Full API/integration suites; no backend behavior changed. Earlier integration
  evidence is not represented as a new run.
- Producer workspace redesign, the application-wide navigation redesign and
  canonical NOW/MAKE/SKY/ME surfaces are outside this first implementation slice.

## Observed, not changed

The existing local demo Artist password was refused; a fresh guarded synthetic fixture
was used instead. The unrelated documentation index modification, local VS Code
settings and unreviewed architecture proposal were left alone. No dependencies were
installed, infrastructure modified, branch pushed or deployment performed.
