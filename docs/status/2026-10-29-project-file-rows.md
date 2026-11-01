**Artist project file rows now use the shared experience tokens and retain private, ticket-gated file access.**

## What was wrong

The project files section still used compact, low-contrast rows with truncated names and an ambiguous `OPEN` label. Long filenames were difficult to distinguish, and the file action lacked a descriptive accessible name.

## What changed

- Restyled project file rows with token-based surfaces, borders, spacing, hover state and a clear `Open file` action.
- Allowed long filenames to wrap instead of truncating; kept the row responsive and keyboard reachable.
- Added a descriptive accessible name and marked the decorative action icon hidden from assistive technology.
- Preserved the existing short-lived, file-scoped access-ticket flow and empty state behavior.

## Evidence

| Check | Result |
|---|---|
| `npm test --workspace=apps/web` | Passed: 26 files, 223 tests |
| `npm run typecheck --workspace=apps/web` | Passed |
| `npm run build --workspace=apps/web` | Passed |
| `git diff --check` | Passed |

Regression coverage verifies a long filename remains present in the accessible file button and the existing file-open test still requires an access ticket before opening content.

## Not exercised

No browser visual comparison, API/database integration, production deployment, or file-storage service was exercised. The work changes presentation and accessibility text only; it does not change file visibility, permissions, ticket issuance or content routes.
