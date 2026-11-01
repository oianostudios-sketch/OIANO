**The entry page now welcomes creative people, studios and creative services, and accepted artist contributions now appear on Home with direct workspace links.**

## What was wrong

The [synthetic collaboration rehearsal](./2026-10-29-contribution-collaboration-journey.md) proved that a songwriter could join a project and exchange messages. Returning Home still showed an empty current-work card because it read only artist-linked projects, not accepted participation. The entry experience also described account tooling more clearly than the creative network it serves.

## What changed

- Entry copy connects people, places and services through projects, collaboration and confirmed credits. The introduction appears on mobile as well as desktop.
- Signup retains the existing Artist and Creative Professional choices. Studios and creative organizations are acknowledged without inventing public organization signup; studio operator onboarding remains managed.
- Home reuses the contribution inbox read and cache key. Active contributions on ongoing, unarchived projects appear first, with the supplied project title, contextual role, lead, phase and encoded workspace link.
- Duplicate projects are shown once. The combined preview remains capped at four, with links to both complete project and contribution lists.
- Each read retains its own loading, retry and stale-data behavior. An unavailable contribution read cannot silently become an empty account or hide successfully loaded projects.
- The quiet next-step prompt no longer implies that a returning contributor has never started work. Decision-specific links and urgent prompts remain unchanged.

## Evidence

| Check | Result |
|---|---|
| Regression proof before implementation | New tests failed against the previous missing-contribution, premature-empty, partial-read-error and entry-copy behavior. A separate test failed against the previous first-work prompt before that copy was changed. |
| `npm test --workspace=apps/web` | Exit 0: 26 files, 232 tests passed. |
| `npm run typecheck --workspace=apps/web` | Exit 0. Final production build also includes TypeScript compilation. |
| `npm run build --workspace=apps/web` | Exit 0. |
| `npm run security:secrets` | Exit 0: 594 tracked files checked. |
| `git diff --check` | Passed; existing unrelated line-ending notices remain. |
| Local startup | API health HTTP 200, database connected; web HTTP 200. Used only the checkout-local synthetic-journey database, `NODE_ENV=test`, with external integrations disabled. |
| Browser return to work | Signed in as the rehearsal's synthetic artist. Home showed the accepted songwriter contribution; its link opened the correct accepted workspace, and the previous two-sided conversation remained visible after reload. |
| Responsive checks | Sign-in, Artist signup and loaded Home checked at 320, 390 and 1440 CSS px: no document horizontal overflow. The current-work card remained inside the viewport. |
| Keyboard | Tabbing to the accepted-work link produced a visible solid focus outline. |

Nine regression tests were added. Coverage includes accepted-only filtering, archive/delivery exclusion, deduplication, encoded links, the combined preview limit, pending reads, partial failures, retries and stale accepted work. No new dependency, API endpoint, database schema or financial behavior was introduced.

## Not exercised

- A new invitation acceptance or message write in this increment; existing synthetic participation and conversation were read back.
- Production deployment, public organization registration, organization membership migration or service transactions.
- Full API/integration suites, physical devices, or a CLI browser test suite.

## Observed, not changed

Home's existing aggregate metrics and the server's context classification retain their current definitions. This change makes accepted participation visible in current work; it does not redefine those counts or claim canonical Work migration is complete. Pre-existing unrelated worktree changes were preserved.

The synthetic account was signed out and the task-owned API and web processes were stopped; subsequent HTTP probes confirmed that both were unresponsive. The checkout-local database was left intact.
