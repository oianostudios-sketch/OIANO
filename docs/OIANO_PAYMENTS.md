# Oiano Payments

Oiano owns the canonical payment, ledger and economic-activity records. Gateways are adapters and their identifiers never become Oiano primary identifiers.

```text
Customer -> Oiano Checkout -> Payment Router -> Gateway Adapter
                                      |
Verified webhook -> state machine -> allocations + immutable double-entry ledger
                                      |
                         studio / creator / platform accounts
```

## Local sandbox

Set `PAYMENTS_PROVIDER=mock`, provide `PAYMENTS_WEBHOOK_SECRET`, migrate with `npx prisma migrate deploy`, then run the API. Checkout is `POST /api/payments/checkout` with authentication and an `Idempotency-Key` header. A mock callback is `POST /api/payments/webhooks/mock`; sign the exact JSON body with HMAC-SHA256 and send the hex digest as `x-oiano-mock-signature`.

## API

- `POST /api/payments/checkout` — server-priced booking checkout
- `GET /api/payments` — role-scoped activity
- `GET /api/payments/:id` — payment, allocations, refunds, ledger and gateway events
- `POST /api/payments/:id/refund` — authorized partial/full refund
- `POST /api/payments/webhooks/:provider` — signed provider callbacks

## Adding a provider

Implement `PaymentGateway` without leaking provider response types, register it in `gateways/router.ts`, map its verified events to canonical states, and keep secrets server-side. Hosted/tokenized collection is required; Oiano stores no card number or CVV.

## Production gates

The mock adapter is intentionally not real money. Production requires a licensed provider adapter, raw-body signature handling where required by that provider, KYC/KYB workflows, payout approval controls, secret management, PCI review, settlement reconciliation, monitoring/alerts, tax/legal review for each market, and a migration plan from the legacy Stripe/wallet records.
