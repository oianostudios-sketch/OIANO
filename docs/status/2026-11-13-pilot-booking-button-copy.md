**The frozen-wallet booking button no longer claims the artist will use studio credit.**

When wallet booking is disabled, the submit button now only requests the session. When
wallet booking is explicitly enabled, it retains the existing studio-credit amount and
repeat-session label.

## Evidence

| Check | Result |
|---|---|
| `npm run test --workspace=apps/web -- src/lib/bookingCopy.test.ts` | 3 passed |
| `npm run typecheck --workspace=apps/web` | Passed |
| `git diff --check` | Passed |

This changes presentation only; booking amounts and payment behavior are unchanged.
