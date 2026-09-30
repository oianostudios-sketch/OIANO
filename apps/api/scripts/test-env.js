// apps/api/scripts/test-env.js
//
// Pins the environment for the API's unit suites (test:security and
// test:intelligence) before anything else loads.
//
// Those suites assert over pure functions and never query a database, but two
// of their modules reach lib/prisma.ts, which constructs a PrismaClient at
// import time. That left the documented pre-commit command at the mercy of
// whichever .env the process happened to find, in one of two ways:
//
//   - A worktree with no .env leaves DATABASE_URL undefined, so the constructor
//     throws PrismaClientConstructorValidationError and the whole test file
//     fails to load before a single assertion runs.
//   - A worktree with no node_modules of its own resolves up to a checkout that
//     has one, and the generated client loads the .env beside its own baked-in
//     schema path. The suite then passes while silently holding the SHARED
//     database URL, which is what AGENTS.md rule 1 exists to prevent.
//
// Pinning the same deliberately unreachable, credential-free URL that CI sets
// at the job level (.github/workflows/ci.yml, `verify`) removes both and keeps
// a local run and a CI run configured identically. NODE_ENV=test is what stops
// lib/prisma.ts's dotenv.config({ override: NODE_ENV !== 'test' }) from
// replacing it again with apps/api/.env's value; neither Prisma's own loader
// nor dotenv without `override` displaces a variable that is already set.
//
// node -r loads this, and the test runner propagates -r to the child process it
// spawns per test file.

process.env.NODE_ENV = 'test';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/validate_only';
}
