# OIANO — event readiness

What it takes to run the full project live at an event: real people, real sessions, for
the length of the event, with staff able to recover from anything the system does.

Written 2026-09-24 against `682d052` plus the money guards on
`claude/elegant-cohen-2698f0`. Every fact below was checked in the tree on that date;
check the code before relying on any of them. Two owner decisions (money and scale) set
how much of this applies — they are at the end.

## Where it stands today

| Question | Today |
|---|---|
| What is deployed | `NODE_ENV=staging` on Render's **free** plan: spins down after 15 minutes idle, ~512MB (`render.yaml`) |
| Does money move | No. `STRIPE_ENABLED=false`; no Stripe call in the money path has ever run |
| How many API instances | One, and only one is safe: the SSE registry and the rate limiter are in process |
| Who the rate limiter counts | An IP address (`apps/api/src/middleware/rateLimit.middleware.ts`) |
| Migrations | Applied by hand before a deploy (`render.yaml`) |
| Stabilization gate | Seven of eight; gate 2 is fixed on `claude/gate-2-schema-declarations`, unmerged |
| Files | Uploads buffer in the Node process; the R2 path has never been exercised live |

## Blockers

Ordered by how certainly they break an event, not by effort.

1. **The venue is one caller.** The limiter keys on IP, so everyone on the venue network
   shares one budget: 300 requests a minute for the whole room, 20 booking attempts, 10
   sign-ins. Key it on the authenticated user, with the IP as the fallback only for
   anonymous routes.
2. **One instance, no redundancy and no zero-downtime deploy.** A second instance would
   silently stop delivering live updates to anyone whose stream landed elsewhere, and
   rate limits would stop being enforced across instances. Either size one instance for
   the peak and accept the restart gap, or put Redis behind both (roadmap 1.2).
3. **The deployment is not production.** `NODE_ENV=production` will not boot until
   `apps/api/src/lib/env.ts` is satisfied: HTTPS frontend, `sslmode=require`, 32-character
   secrets, and seventeen operational values including `BACKUP_RESTORE_TESTED_AT` inside
   35 days — which means a restore actually performed, not a backup taken.
4. **The free plan cold-starts.** An event has a hard start time; a spun-down instance
   does not. `plan: standard`, and re-add the staging service the load test needs.
5. **Files.** A real multi-megabyte upload buffers in process memory, and no upload has
   ever reached R2 with real credentials (roadmap 0.3, not started).
6. **The money rails have never run** (only if money moves — see decisions). Checkout,
   the wallet top-up webhook, refunds and payouts are proven against test doubles alone.
7. **Unbacked wallet credit** (only if money moves). Studio-issued credit was removed on
   2026-09-21, but what was already issued is still spendable and no reconciliation check
   sees it. The query that finds it is in implementation status.
8. **Demo accounts.** `prisma/seed.ts` creates `demo@artist.com`,
   `admin@dreamzmusiclab.com`, an engineer and a producer. Whether they exist on the
   production database has not been checked from here; they must not exist during an
   event.

## Sequence

| Phase | Work | Done when |
|---|---|---|
| 0. Land | Merge gate 2 after its read-only production diff; re-run the gate; merge the money guards; resume the roster disclosure fix | Eight of eight gates pass and nothing load-bearing is unmerged |
| 1. Production | Satisfy `env.ts`; standard plan; real Sentry, SendGrid and R2 credentials; a performed restore; a written deploy-and-migrate runbook | The API boots with `NODE_ENV=production` and an error reaches Sentry |
| 2. Money | Stripe test mode end to end — checkout, top-up webhook, refund, payout to a Connect account — then live keys, then reconcile unbacked credit | A test payout reaches a Connect account and the ledger balances |
| 3. Capacity | Fix limiter keying; decide one instance or Redis; run `npm run load-test` at the real concurrency against standard-tier staging; frontend request timeout and pagination | The load test holds the target with SSE connections open |
| 4. Operations | Real studio, rooms, services and staff; demo accounts gone; runsheet and walk-in rehearsed; on-call named; rollback written; offline fallback agreed; dress rehearsal; freeze | A dress rehearsal runs the Golden Journey on real phones |

## Event-day operations

- **Named on-call** for Sentry and for applying a migration, reachable during the event.
- **Rollback**: `main` deploys automatically, so a bad deploy is reverted by a forward
  commit, not by a rollback button. Know this before the day.
- **Offline fallback**: what the desk does if the API is unreachable. The printable
  runsheet (`GET /api/admin/runsheet`) is the paper version; print it before doors.
- **Freeze**: no merges to `main` from the dress rehearsal until the event ends.

## Decisions the owner holds

| Decision | Sets |
|---|---|
| Does money move at the event, or is it a showcase with payments off? | Whether phase 2 exists at all |
| Expected people at once, and the date | Hosting tier, and what the load test must prove |
| One instance sized for peak, or Redis behind SSE and the limiter? | Whether the event can survive a restart |
| Do demo accounts exist on production, and who removes them? | A privacy and credibility risk during the event |

## Not verified from here

Nothing in this document was run against production. The production database was never
read: whether it carries demo accounts, unbacked wallet credit, or a schema matching the
tracked migrations are all open questions that need a read-only check by the owner.
