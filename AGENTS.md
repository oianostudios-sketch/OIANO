# OIANO — guide for agents and engineers

Read this before changing anything. It replaces an earlier brief that described a
single-studio booking tool. Facts below were verified against the tree on 2026-09-13;
check the code before relying on any of them.

## What OIANO is

OIANO is a Creative Work Network. People start creative work, find the people and
places it needs, agree terms, do the work, settle what is owed, and build a
professional record from evidence. The target system is
[`docs/OIANO_FROZEN_ARCHITECTURE.md`](docs/OIANO_FROZEN_ARCHITECTURE.md); changing it is
an owner decision, not an edit.

**Identity is issued by OIANO, never by a studio.** Studios are organizations on the
network. Do not hardcode any studio's slug, id or name in product code, and do not
scope data to a default studio. A studio scope comes from a staff membership
(`resolveStaffStudio`) or from the record itself, such as a booking's own studio.

## Where things stand

| Question | Read |
|---|---|
| What the system must become | `docs/OIANO_FROZEN_ARCHITECTURE.md` |
| What is done, with evidence, and what is open | `docs/OIANO_IMPLEMENTATION_STATUS.md` |
| Whether the canonical migration may start | `docs/OIANO_STABILIZATION_GATE.md` |
| The designed canonical schema | `docs/OIANO_SCHEMA_REDESIGN.md` |
| How today's models map to the target | `docs/OIANO_ARCHITECTURE_DELTA.md` |
| Who owns which truth; how work is verified | `docs/OIANO_DIRECTION.md` §2–7 (its §1 and §8 are history) |
| Which of the other documents are current | [`docs/README.md`](docs/README.md) |

The canonical migration follows the frozen order and starts only after the
stabilization gate passes. NOW, MAKE, SKY and ME are experience surfaces that arrive
with their migration steps; do not put those names on today's screens.

## Rules that are not negotiable

1. **Never point tests, scripts or dev servers at the database in `.env` or
   `apps/api/.env`.** It is shared. `apps/api/src/app.ts` and `lib/prisma.ts` load
   `.env` with override unless `NODE_ENV=test`, which silently replaces an exported
   `DATABASE_URL`. Use the local database commands below.
2. **Production data changes only through a deliberate, verified migration.** `main`
   deploys automatically and migrations are applied by hand (`render.yaml`), so a
   schema change goes on a branch and merges only after its migration is applied
   where it will run.
3. **The ledger is the only writer of money** (`apps/api/src/lib/financialLedger.ts`).
   Do not change Stripe, wallet, payout or refund behaviour as a side effect of other
   work.
4. **The working tree is shared with other agents.** Stage explicit paths, never
   `git add .`; read `git diff --cached` before committing; leave other people's
   uncommitted work alone unless asked; commit forward only.
5. **No credentials in the repository.** `npm run security:secrets` must pass. It
   rejects credential-shaped values, including Postgres URLs that carry a password.

## Verify before you commit

| Check | Command |
|---|---|
| Typecheck | `npm run typecheck --workspace=apps/api` and `npm run typecheck --workspace=apps/web` |
| API unit and web suites | `npm test` |
| Integration suite on a fresh database | `npm run test:integration:local` |
| Build | `npm run build` |
| Secrets | `npm run security:secrets` |

A green run is not proof a test works. For any load-bearing assertion, put the defect
back, watch the test fail, then restore the file. CI (GitHub Actions) runs on pushes to
`main` and on pull requests; its failures are re-emitted as annotations, which the
public GitHub API can read.

## Local database and dev server

PostgreSQL 14+ command-line tools are required: set `PG_BIN`, put `pg_ctl` on `PATH`,
or use the default install location. Data lives in `.oiano/` and never leaves the
machine.

Each checkout and worktree runs its own cluster. The commands use a running server only
when it reports this checkout's `.oiano/postgres` as its data directory, so none of them
creates, migrates or drops databases on another checkout's cluster, or stops it. The
cluster listens on 55432, or on another free port when a different server holds the one
it wants. `.oiano/port` keeps the port it last started on, and `db:local:status` prints
it. `OIANO_LOCAL_PG_PORT` chooses the port explicitly, and a command stops rather than
use it while another server holds it.

| Command | What it does |
|---|---|
| `npm run db:local:start`, `db:local:stop`, `db:local:status` | Run this checkout's cluster, creating it on first start |
| `npm run db:local:fresh` | Create an empty database, record its name in `.oiano/`, and print its URL |
| `npm run test:integration:local` | Run the integration suite on a fresh database |
| `npm run dev:local` | Migrate and seed `oiano_dev_test`, then run the API and web app on it |
| `npm run db:local:prune` | Drop the databases this checkout's `fresh` recorded; others are listed and left |

`dev:local` uses ports 4000 and 5173 when they are free and otherwise the next free
ones, and always points the web app at its own API; `OIANO_LOCAL_API_PORT` and
`OIANO_LOCAL_WEB_PORT` choose them explicitly. It runs with `NODE_ENV=test` and blanks
Stripe, SendGrid, Anthropic, R2 and Sentry, so a local session cannot charge, email,
upload or report for real. Demo
accounts come from `prisma/seed.ts`; the seeded studios are demo organizations, not
the platform. For a browser preview, start `oiano-local` from `.claude/launch.json`.

## The system today

- Monorepo: `apps/api` (Express, Prisma 5.22, PostgreSQL, Zod), `apps/web` (React 18,
  Vite, Tailwind, React Query, Zustand) and `packages/shared`.
- 58 Prisma models and 20 tracked migrations; 36 API route modules; 50 web pages.
- Roles: `ARTIST`, `PRODUCER`, `STUDIO_ADMIN`, `ENGINEER`, `OIANO_ADMIN`.
- Multi-studio: `StudioStaff` holds one row per user and studio, and
  `User.active_studio_id` selects the studio a staff request is scoped to.
- API on port 4000, web on 5173 (proxying `/api`). Node 24; `engines` allows 22+.
- Money is USD in `Decimal` today. Under the owner's decisions it becomes integer minor
  units with an ISO 4217 currency during the migration.

## Conventions that hold

- Zod parses every request body; nothing reads raw `req.body`.
- Domain failures throw `AppError(message, status)`; `error.middleware.ts` handles
  `AppError` and `ZodError`.
- The Stripe webhook route is mounted before `express.json()`, because it needs the raw
  body.
- Web code calls the API only through `apps/web/src/lib/api.ts`, reads auth only through
  `useAuthStore()`, and reads environment only as `import.meta.env.VITE_*`.
- After a booking changes, invalidate both `['bookings']` and `['availability']`.
- Design tokens: gold `#C9A84C`, gold light `#E2C97E`, background `#0a0a0a`, surface
  `#141414`, border `#1e1e1e`, muted `#2a2a2a`. Type: Playfair Display for display,
  DM Sans for body, JetBrains Mono for data.

## Recording work

Record what landed, with its evidence, in `docs/OIANO_IMPLEMENTATION_STATUS.md`. Add
entries; do not delete earlier ones, mark them.
