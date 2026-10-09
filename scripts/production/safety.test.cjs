'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertHistory, assertRecipe, assertApprovalEnvironment, databaseUrl, childEnv, quietRun } = require('./common.cjs');
const { guard } = require('./guard.cjs');
const { Neon } = require('./neon.cjs');

const base = [{ name: '001_base', checksum: 'abc' }];
const target = [...base, { name: '002_identity', checksum: 'def' }];
const recipe = { migrations: ['002_identity'] };
const completed = [{ migration_name: '001_base', checksum: 'abc', finished_at: 'now', rolled_back_at: null }];

test('stage accepts only the declared expansion with unchanged applied migrations', () => {
  assert.doesNotThrow(() => assertRecipe(base, target, recipe));
  for (const candidate of [target.slice(1), [{ ...base[0], checksum: 'changed' }, target[1]],
    [...target, { name: '003_unapproved', checksum: 'x' }], base]) {
    assert.throws(() => assertRecipe(base, candidate, recipe));
  }
});

test('history rejects incomplete, unknown, duplicate and edited applied migrations', () => {
  assert.doesNotThrow(() => assertHistory(completed, base));
  assert.doesNotThrow(() => assertHistory([...completed, { ...completed[0], finished_at: null, rolled_back_at: 'yesterday' }], base));
  for (const rows of [[], [{ ...completed[0], finished_at: null }], [{ ...completed[0], checksum: 'changed' }],
    [{ ...completed[0], migration_name: 'other' }], [...completed, completed[0]]]) {
    assert.throws(() => assertHistory(rows, base));
  }
});

test('an existing but unprotected environment cannot masquerade as approval', () => {
  for (const environment of [{}, { protection_rules: [] }, { protection_rules: [{ type: 'required_reviewers', reviewers: [] }] }]) {
    assert.throws(() => assertApprovalEnvironment(environment), /required reviewer/);
  }
  assert.doesNotThrow(() => assertApprovalEnvironment({ protection_rules: [{ type: 'required_reviewers', reviewers: [{ id: 1 }] }] }));
});

test('database target validation requires the configured direct TLS endpoint', () => {
  assert.doesNotThrow(() => databaseUrl('postgresql://prod.example/app?sslmode=require', 'prod.example'));
  for (const value of ['invalid', 'https://prod.example/app?sslmode=require', 'postgresql://other.example/app?sslmode=require',
    'postgresql://prod.example/app', 'postgresql://prod-pooler.example/app?sslmode=require']) {
    assert.throws(() => databaseUrl(value, 'prod.example'));
  }
});

test('child environments do not pass ambient service or GitHub credentials', () => {
  const old = process.env.GH_TOKEN;
  process.env.GH_TOKEN = 'sentinel-credential';
  try {
    const env = childEnv('postgresql://127.0.0.1/test');
    assert.equal(env.GH_TOKEN, undefined);
    assert.equal(env.NODE_ENV, 'test');
    assert.equal(env.DATABASE_URL, 'postgresql://127.0.0.1/test');
  } finally { if (old === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = old; }
});

test('failing subprocess output is never included in the public error', () => {
  assert.throws(() => quietRun('Parity', ['-e', 'console.error("private-person-and-secret");process.exit(1)']),
    error => !error.message.includes('private-person') && /Parity failed/.test(error.message));
});

function guardFixture() {
  const env = { PR_NUMBER: '16', MIGRATION_STAGE: 'identity-person-profile', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: 'a'.repeat(40), EXPECTED_SHA: 'b'.repeat(40) };
  const replies = {
    'pulls/16': { state: 'open', base: { ref: 'main' }, head: { sha: env.EXPECTED_SHA, repo: { full_name: env.GITHUB_REPOSITORY } } },
    'git/ref/heads/main': { object: { sha: env.GITHUB_SHA } },
    'environments/Production': { protection_rules: [{ type: 'required_reviewers', reviewers: [{ id: 1 }] }] },
    [`compare/${env.GITHUB_SHA}...${env.EXPECTED_SHA}`]: { status: 'ahead' },
    [`commits/${env.EXPECTED_SHA}/check-runs?filter=latest&per_page=100`]: { check_runs: ['verify', 'integration'].map(name => ({
      name, app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success',
    })) },
  };
  return { env, replies, request: async route => { assert.ok(replies[route], `unexpected request ${route}`); return replies[route]; } };
}

test('guard accepts the exact open same-repository PR with green CI and reviewer', async () => {
  const fixture = guardFixture();
  assert.equal((await guard(fixture.env, fixture.request)).sha, fixture.env.EXPECTED_SHA);
});

for (const [name, change] of [
  ['branch dispatch', f => { f.env.GITHUB_REF = 'refs/heads/untrusted'; }],
  ['changed PR', f => { f.replies['pulls/16'].head.sha = 'c'.repeat(40); }],
  ['changed main', f => { f.replies['git/ref/heads/main'].object.sha = 'c'.repeat(40); }],
  ['fork PR', f => { f.replies['pulls/16'].head.repo.full_name = 'fork/repo'; }],
  ['closed PR', f => { f.replies['pulls/16'].state = 'closed'; }],
  ['stacked PR before prerequisite merge', f => { f.replies['pulls/16'].base.ref = 'identity'; }],
  ['missing approval rule', f => { f.replies['environments/Production'].protection_rules = []; }],
  ['outdated branch', f => { f.replies[`compare/${f.env.GITHUB_SHA}...${f.env.EXPECTED_SHA}`].status = 'diverged'; }],
  ['failed CI', f => { f.replies[`commits/${f.env.EXPECTED_SHA}/check-runs?filter=latest&per_page=100`].check_runs[0].conclusion = 'failure'; }],
  ['missing CI', f => { f.replies[`commits/${f.env.EXPECTED_SHA}/check-runs?filter=latest&per_page=100`].check_runs.pop(); }],
]) {
  test(`guard refuses ${name}`, async () => {
    const fixture = guardFixture(); change(fixture);
    await assert.rejects(() => guard(fixture.env, fixture.request));
  });
}

function neonFixture() {
  const env = { NEON_API_KEY: 'test-only', NEON_PROJECT_ID: 'project', NEON_PRODUCTION_BRANCH_ID: 'br-production',
    NEON_PRODUCTION_HOST: 'production.example', NEON_DATABASE_ROLE: 'owner', NEON_DATABASE_NAME: 'app',
    GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '3' };
  const branch = { id: 'br-copy', parent_id: env.NEON_PRODUCTION_BRANCH_ID, name: 'oiano-rehearsal-12-3', protected: false };
  const uri = new URL('postgresql://copy.example/app?sslmode=require');
  uri.username = 'owner'; uri.password = 'copy-only';
  const replies = {
    'GET endpoints': { endpoints: [{ branch_id: env.NEON_PRODUCTION_BRANCH_ID, host: env.NEON_PRODUCTION_HOST, type: 'read_write' }] },
    'POST branches': { branch, endpoints: [{ branch_id: branch.id, host: 'copy.example', type: 'read_write' }], operations: [{ id: 'create', status: 'running' }] },
    'GET operations/create': { operation: { id: 'create', status: 'finished' } },
    'GET branches/br-copy/roles': { roles: [{ name: 'owner' }, { name: 'reader' }] },
    'POST branches/br-copy/roles/owner/reset_password': { operations: [{ id: 'reset', status: 'running' }] },
    'POST branches/br-copy/roles/reader/reset_password': { operations: [] },
    'GET operations/reset': { operation: { id: 'reset', status: 'finished' } },
    'GET connection_uri?branch_id=br-copy&database_name=app&role_name=owner&pooled=false': { uri: uri.href },
    'GET branches?limit=100': { branches: [branch] },
    'DELETE branches/br-copy': { operations: [] },
  };
  const calls = [];
  const fetcher = async (url, options) => {
    const route = url.split('/projects/project/')[1];
    const key = `${options.method} ${route}`;
    calls.push({ key, body: options.body && JSON.parse(options.body) });
    assert.ok(Object.hasOwn(replies, key), `unexpected Neon call ${key}`);
    return { ok: true, status: 200, json: async () => replies[key] };
  };
  return { env, branch, replies, calls, neon: new Neon(env, fetcher, async () => {}) };
}

test('clone is explicit, expires, waits for operations and rotates every inherited role before releasing its URL', async () => {
  const f = neonFixture();
  assert.equal(new URL(await f.neon.create()).hostname, 'copy.example');
  const create = f.calls.find(call => call.key === 'POST branches');
  assert.equal(create.body.branch.parent_id, 'br-production');
  assert.ok(Date.parse(create.body.branch.expires_at) > Date.now());
  assert.ok(Date.parse(create.body.branch.expires_at) <= Date.now() + 6 * 3600000);
  const uriIndex = f.calls.findIndex(call => call.key.startsWith('GET connection_uri'));
  for (const role of ['owner', 'reader']) {
    const resetIndex = f.calls.findIndex(call => call.key === `POST branches/br-copy/roles/${role}/reset_password`);
    assert.ok(resetIndex > 0 && resetIndex < uriIndex);
  }
  assert.ok(f.calls.some(call => call.key === 'GET operations/reset'));
});

test('production host must belong to the selected source branch before a clone is created', async () => {
  const f = neonFixture(); f.replies['GET endpoints'].endpoints[0].branch_id = 'other';
  await assert.rejects(() => f.neon.create());
  assert.equal(f.calls.some(call => call.key === 'POST branches'), false);
});

test('a production URI returned instead of a clone URI is refused', async () => {
  const f = neonFixture();
  f.replies['GET connection_uri?branch_id=br-copy&database_name=app&role_name=owner&pooled=false'].uri = 'postgresql://production.example/app?sslmode=require';
  await assert.rejects(() => f.neon.create(), /unexpected clone/);
});

test('cleanup deletes only this run and follows pagination', async () => {
  const f = neonFixture();
  f.replies['GET branches?limit=100'] = { branches: [{ ...f.branch, name: 'unrelated' }], pagination: { next: 'next' } };
  f.replies['GET branches?limit=100&cursor=next'] = { branches: [f.branch] };
  await f.neon.cleanup();
  assert.deepEqual(f.calls.filter(call => call.key.startsWith('DELETE')).map(call => call.key), ['DELETE branches/br-copy']);
});

for (const [name, change] of [
  ['production branch', f => { f.branch.id = 'br-production'; }],
  ['wrong parent', f => { f.branch.parent_id = 'other'; }],
  ['protected branch', f => { f.branch.protected = true; }],
]) test(`cleanup refuses a ${name} even with the matching run name`, async () => {
  const f = neonFixture(); change(f);
  await assert.rejects(() => f.neon.cleanup(), /Refusing/);
  assert.equal(f.calls.some(call => call.key.startsWith('DELETE')), false);
});

test('ambiguous creation failures are not retried', async () => {
  const f = neonFixture(); let count = 0;
  f.neon.fetcher = async () => { count++; throw new Error('network lost'); };
  await assert.rejects(() => f.neon.request('branches', 'POST', {}));
  assert.equal(count, 1);
});
