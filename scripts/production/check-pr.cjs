'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');
const { requireValue, databaseUrl, github, schemaParity, summary } = require('./common.cjs');

async function assertReadOnly(client) {
  await client.query('BEGIN READ ONLY');
  try {
    // Default read-only is a guardrail, not an authorization boundary. Also reject
    // ownership, privileged memberships, table writes and schema/database CREATE.
    const { rows } = await client.query(`
      SELECT current_setting('default_transaction_read_only') = 'on' AS readonly,
        EXISTS (SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user, r.oid, 'MEMBER')
          AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls))
        OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          AND (pg_has_role(current_user, c.relowner, 'MEMBER') OR
            CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(current_user, c.oid, 'UPDATE,USAGE')
            ELSE has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END))
        OR has_schema_privilege(current_user, 'public', 'CREATE')
        OR has_database_privilege(current_user, current_database(), 'CREATE')
        AS unsafe
    `);
    if (!rows[0]?.readonly || rows[0]?.unsafe) throw new Error('Configure a dedicated read-only role with no ownership, write grants or privileged memberships.');
  } finally { await client.query('ROLLBACK'); }
}

async function checkPr(env = process.env) {
  const number = requireValue(env, 'PR_NUMBER');
  if (!/^[1-9]\d*$/.test(number)) throw new Error('Invalid PR number.');
  const pr = await github(`pulls/${number}`);
  if (pr.state !== 'open' || pr.base.ref !== 'main') throw new Error('Use an open PR targeting main.');
  // Public repository: a fork's PR is never compared with production.
  if (pr.head.repo?.full_name !== env.GITHUB_REPOSITORY) throw new Error('Only same-repository PRs are compared with production.');
  const sha = pr.head.sha;
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid PR commit.');
  if (env.EXPECTED_SHA && sha !== env.EXPECTED_SHA) throw new Error('The PR changed after apply; recheck the new head separately.');
  const check = await github('check-runs', { method: 'POST', body: {
    name: 'Production schema parity', head_sha: sha, status: 'in_progress',
    details_url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
  } });
  let passed = false;
  let configurationFailure;
  let folder;
  try {
    // Publish only names from this fixed allowlist, never environment values or
    // raw errors. Collect every missing input before parsing a URL or connecting.
    const missing = ['PRODUCTION_READONLY_DATABASE_URL', 'NEON_PRODUCTION_HOST', 'NEON_DATABASE_NAME']
      .filter(name => !env[name]?.trim());
    if (missing.length) {
      configurationFailure = `Missing required configuration: ${missing.join(', ')}. Configure the Production read-only environment secret and repository Actions variables listed in docs/PRODUCTION_MIGRATION_WORKFLOW.md. No database connection was attempted.`;
      console.error(`::error::${configurationFailure}`);
      throw new Error(configurationFailure);
    }
    const database = requireValue(env, 'PRODUCTION_READONLY_DATABASE_URL');
    const parsed = databaseUrl(database, requireValue(env, 'NEON_PRODUCTION_HOST'));
    if (decodeURIComponent(parsed.pathname.slice(1)) !== requireValue(env, 'NEON_DATABASE_NAME')) throw new Error('Unexpected production database.');
    const client = new Client({ connectionString: database, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
    try { await client.connect(); await assertReadOnly(client); } finally { await client.end(); }

    // Only this DATA file is fetched from the immutable PR head. No PR checkout,
    // package manifest, dependency, npm hook, generator or application is executed.
    const file = await github(`contents/prisma/schema.prisma?ref=${sha}`);
    if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 1024 * 1024) throw new Error('Unexpected schema file.');
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'oiano-parity-'));
    const schema = path.join(folder, 'schema.prisma');
    fs.writeFileSync(schema, Buffer.from(file.content, 'base64'));
    schemaParity(path.resolve(__dirname, '../..'), schema, database);
    // Never mark a replacement head green based on an older schema.
    if ((await github(`pulls/${number}`)).head.sha !== sha) throw new Error('PR changed during the check; wait for the new run.');
    passed = true;
  } finally {
    if (folder) fs.rmSync(folder, { recursive: true, force: true });
    const message = passed ? 'Production matches this exact PR schema. This does not certify a data backfill; use the approved migration workflow for that.'
      : configurationFailure || 'Production comparison failed or is not configured. Check the read-only role, environment secrets, endpoint, and schema drift. No database rows or raw errors are published.';
    summary(`**Production schema parity: ${passed ? 'passed' : 'failed'}** for PR #${number}, commit \`${sha}\`.\n\n${message}`);
    await github(`check-runs/${check.id}`, { method: 'PATCH', body: {
      status: 'completed', conclusion: passed ? 'success' : 'failure',
      output: { title: passed ? 'Production schema matches' : 'Production schema not verified', summary: message },
    } });
  }
}

if (require.main === module) checkPr().catch(() => {
  console.error('Production schema check failed. See the check summary and production workflow runbook.');
  process.exitCode = 1;
});
module.exports = { assertReadOnly, checkPr };
