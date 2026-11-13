**Pilot booking details no longer promise undecided cancellation fees or wallet refunds.**

When the wallet is frozen, booking details now say that cancellation terms are not
available in OIANO for pilot sessions and direct the artist to contact the studio.
The existing cancellation copy remains unchanged when wallet settlement is explicitly
enabled.

## Evidence

| Check | Result |
|---|---|
| `npm run test --workspace=apps/web -- src/components/CancellationPolicyDetails.test.ts` | 2 passed |
| `npm run typecheck --workspace=apps/web` | Passed |
| `git diff --check` | Passed |

This copy-only change does not define cancellation terms or change cancellation,
rescheduling, booking, or payment behavior.
