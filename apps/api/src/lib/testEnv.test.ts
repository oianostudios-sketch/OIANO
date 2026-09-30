import assert from 'node:assert/strict';
import test from 'node:test';

// AGENTS.md rule 1: the database named in .env is shared, and nothing in these
// suites may be pointed at it.
//
// The defect this guards is silent, which is why it needs a test rather than a
// convention. lib/prisma.ts builds a PrismaClient at import time, and the
// generated Prisma client loads the .env beside the schema path baked into it
// at generate time. A worktree with no node_modules of its own therefore
// resolves up to a checkout that has one and inherits that checkout's shared
// datasource without reporting anything: the suite stays green while every
// module in it holds a live production-adjacent URL, one query away from using
// it. scripts/test-env.js pins a loopback placeholder before any of that loads.
//
// Loopback is the assertion because it is what separates the two cases by
// construction: the shared database is remote, while CI's placeholder and the
// local cluster on port 55432 are both on 127.0.0.1.

test('the unit suites are never pointed at a remote database', () => {
  const url = process.env.DATABASE_URL;
  assert.ok(url, 'DATABASE_URL should be pinned by apps/api/scripts/test-env.js');

  const { hostname } = new URL(url);
  const loopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  assert.ok(loopback, `expected a loopback datasource, got host "${hostname}"`);
});
