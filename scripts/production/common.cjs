'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

function requireValue(env, name) {
  if (!env[name]?.trim()) throw new Error(`Configure ${name} before running this workflow.`);
  return env[name].trim();
}

function databaseUrl(value, expectedHost) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid database URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error('Invalid database URL.');
  }
  if (expectedHost && (url.hostname !== expectedHost || url.hostname.includes('-pooler.'))) {
    throw new Error('Database host must be the configured direct production endpoint.');
  }
  if (expectedHost && url.searchParams.get('sslmode') !== 'require') {
    throw new Error('The production connection must use sslmode=require.');
  }
  return url;
}

function childEnv(database) {
  // No GitHub token, Neon API key, service credentials or dotenv override reaches a child.
  const env = { NODE_ENV: 'test', DATABASE_URL: database, STRIPE_ENABLED: 'false', OIANO_AI_ENABLED: 'false', CI: 'true' };
  for (const key of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function quietRun(label, args, { cwd, database, timeout = 600000 } = {}) {
  // Backfill errors can contain real names/IDs. Never publish raw child output or
  // upload it as an artifact in this public repository, even when a command fails.
  console.log(`${label}: starting.`);
  const result = spawnSync(process.execPath, args, {
    cwd, env: childEnv(database), encoding: 'utf8', timeout,
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed${result.status === 2 ? ' (schema differs)' : ''}; inspect privately before retrying.`);
  }
  console.log(`${label}: passed.`);
}

function schemaParity(controlRoot, schemaFile, database) {
  quietRun('Schema parity', [path.join(controlRoot, 'node_modules/prisma/build/index.js'),
    'migrate', 'diff', '--from-url', database, '--to-schema-datamodel', schemaFile, '--exit-code'],
  { cwd: controlRoot, database });
}

function migrations(root) {
  const folder = path.join(root, 'prisma/migrations');
  return fs.readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
    const sql = fs.readFileSync(path.join(folder, entry.name, 'migration.sql'), 'utf8');
    const lf = sql.replace(/\r\n/g, '\n');
    const hash = value => createHash('sha256').update(value).digest('hex');
    // Prisma accepts CRLF/LF equivalents; hand-run Windows deployments and
    // Linux CI must agree without accepting any changed SQL.
    return { name: entry.name, checksum: hash(lf), checksums: [...new Set([hash(sql), hash(lf), hash(lf.replace(/\n/g, '\r\n'))])] };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function assertHistory(rows, expected) {
  const active = rows.filter(row => !row.rolled_back_at);
  if (active.some(row => !row.finished_at) || active.length !== expected.length) {
    throw new Error('Production migration history is incomplete or differs from the approved baseline.');
  }
  const completed = new Map(active.map(row => [row.migration_name, row.checksum]));
  if (completed.size !== expected.length || expected.some(item => !(item.checksums || [item.checksum]).includes(completed.get(item.name)))) {
    throw new Error('Production migration checksums differ from the approved baseline.');
  }
}

function assertRecipe(base, candidate, recipe) {
  const byName = new Map(candidate.map(item => [item.name, item.checksum]));
  if (base.some(item => byName.get(item.name) !== item.checksum)) {
    throw new Error('The candidate changes or removes an existing migration; rebase and reconcile first.');
  }
  const baseline = new Set(base.map(item => item.name));
  const pending = candidate.filter(item => !baseline.has(item.name)).map(item => item.name);
  if (JSON.stringify(pending) !== JSON.stringify(recipe.migrations)) {
    throw new Error('Candidate migrations do not match this stage. Merge the preceding stage first.');
  }
}

function assertApprovalEnvironment(environment) {
  if (!environment.protection_rules?.some(rule => rule.type === 'required_reviewers' && rule.reviewers?.length)) {
    throw new Error('Production must have at least one required reviewer before this workflow can run.');
  }
}

async function github(route, { method = 'GET', body, token = process.env.GH_TOKEN } = {}) {
  if (!token) throw new Error('GitHub token is missing.');
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${route}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`);
  return response.json();
}

function output(name, value) {
  if (!/^[a-z_]+$/.test(name) || /[\r\n]/.test(String(value))) throw new Error('Invalid workflow output.');
  fs.appendFileSync(requireValue(process.env, 'GITHUB_OUTPUT'), `${name}=${value}\n`);
}

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

module.exports = { requireValue, databaseUrl, childEnv, quietRun, schemaParity, migrations,
  assertHistory, assertRecipe, assertApprovalEnvironment, github, output, summary };
