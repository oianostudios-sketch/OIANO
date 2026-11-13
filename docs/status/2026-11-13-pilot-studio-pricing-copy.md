**Studio service setup now explains how pilot booking prices are collected.**

When wallet booking is frozen, the price guidance says artists pay the studio directly
and OIANO does not collect the payment. The service unit field is labelled "Price unit"
instead of implying the artist is charged through OIANO. With wallet booking explicitly
enabled, the guidance retains the credit-deduction explanation. Hourly and one-time
service pricing language is preserved.

## Evidence

| Check | Result |
|---|---|
| `npm run test --workspace=apps/web -- src/lib/studioServicePricingCopy.test.ts` | 3 passed |
| `npm run typecheck --workspace=apps/web` | Passed |
| `git diff --check` | Passed |

This changes presentation only; service prices and payment behavior are unchanged.
