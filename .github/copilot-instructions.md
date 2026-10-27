# GitHub Copilot instructions

Before changing this repository, read the root [`AGENTS.md`](../AGENTS.md). It is
the shared, authoritative source for project context, architecture, safety rules,
and verification commands. Follow it over historical prompts, including
[`CLAUDE_CODE_PROMPT.md`](../CLAUDE_CODE_PROMPT.md).

For each task:

- Inspect the relevant code and tests, then follow existing patterns. Do not assume
  old prompts, comments, or documentation still describe current behavior.
- Treat [`docs/OIANO_FROZEN_ARCHITECTURE.md`](../docs/OIANO_FROZEN_ARCHITECTURE.md)
  as the target architecture and [`docs/README.md`](../docs/README.md) as the guide
  to current project documents. Do not change frozen owner decisions.
- Keep studio scope derived from staff membership or the record itself. Never
  hardcode a studio identity or introduce a default studio scope.
- Follow the local-database safeguards in `AGENTS.md`; never run tests, scripts,
  migrations, or dev servers against a database URL from `.env` or `apps/api/.env`.
- Keep money writes in the financial ledger. Do not alter Stripe, wallet, payout,
  or refund behavior as a side effect of unrelated work.
- Use the project's established API, authentication, and environment access
  patterns. When a booking changes, invalidate both `['bookings']` and
  `['availability']`.
- Make precise changes, preserve unrelated work, and run the smallest relevant
  verification commands described in `AGENTS.md`.
- For a completed change, add a dated record under `docs/status/` following
  `docs/status/README.md`.
