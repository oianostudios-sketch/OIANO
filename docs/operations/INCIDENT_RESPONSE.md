# OIANO Incident Response Plan

## Severity

- SEV-1: account takeover, rights/financial corruption, broad data disclosure, production unavailable.
- SEV-2: major role workflow unavailable, payment/webhook degradation, material reconciliation exception.
- SEV-3: isolated user failure or non-critical degradation with a workaround.

## Response

1. Acknowledge: SEV-1 within 15 minutes, SEV-2 within one hour, SEV-3 within one business day.
2. Assign incident commander, technical lead and communications owner.
3. Contain: revoke credentials, disable affected capability, pause webhooks/payouts or freeze writes as appropriate.
4. Preserve evidence: request IDs, audit logs, webhook IDs, deployment version and reconciliation reports. Do not copy secrets into the incident record.
5. Recover from a verified state and validate every affected role.
6. Notify affected users and authorities when applicable law or contracts require it.
7. Complete a blameless review within five business days for SEV-1/2, with owners and deadlines.

## Mandatory alerts

- API health or database connectivity failure.
- Stripe webhook failures or processing backlog.
- Any unbalanced financial transaction, missing settled-payment entry or wallet drift.
- Repeated authentication failures, privileged MFA failure or unexpected administrator creation.
- Backup failure or missed restore test.

Production alert destinations and on-call contacts must be configured outside source control before launch.
