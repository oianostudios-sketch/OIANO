'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { Client } = require('pg');
const { requireValue, databaseUrl, quietRun, schemaParity, migrations, assertHistory, assertRecipe, summary } = require('./common.cjs');
const stages = require('./stages.json');

async function runStage(env = process.env) {
  const mode = requireValue(env, 'MIGRATION_MODE');
  if (!['rehearsal', 'production'].includes(mode)) throw new Error('Unknown migration mode.');
  const stage = requireValue(env, 'MIGRATION_STAGE');
  if (!Object.hasOwn(stages, stage)) throw new Error('Unknown migration stage.');
  const recipe = stages[stage];
  const control = path.resolve(__dirname, '../..');
  const candidate = path.resolve(requireValue(env, 'CANDIDATE_ROOT'));
  const database = requireValue(env, mode === 'production' ? 'PRODUCTION_DATABASE_URL' : 'REHEARSAL_DATABASE_URL');
  const host = requireValue(env, 'NEON_PRODUCTION_HOST');
  const parsed = databaseUrl(database, mode === 'production' ? host : undefined);
  if (mode === 'rehearsal' && parsed.hostname === host) throw new Error('Rehearsal must never use production.');
  if (decodeURIComponent(parsed.pathname.slice(1)) !== requireValue(env, 'NEON_DATABASE_NAME')) throw new Error('Unexpected database name.');
  // Prisma's CLI loads dotenv even with NODE_ENV=test. CI checkouts must be clean.
  for (const root of [control, candidate]) {
    for (const file of ['.env', 'prisma/.env', 'apps/api/.env']) {
      if (fs.existsSync(path.join(root, file))) throw new Error('Refusing a checkout containing a dotenv file.');
    }
  }
  const base = migrations(control);
  const target = migrations(candidate);
  assertRecipe(base, target, recipe);
  const client = new Client({ connectionString: database, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  await client.connect();
  try {
    // Coordinates even with another client using this runner. Prisma also locks
    // its migrations; this session spans preflight, backfill and final parity.
    const lock = await client.query("SELECT pg_try_advisory_lock(1869180526, 1) AS acquired");
    if (!lock.rows[0].acquired) throw new Error('Another production migration is running.');
    await client.query('BEGIN READ ONLY');
    const history = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations');
    await client.query('ROLLBACK');
    assertHistory(history.rows, base);
    schemaParity(control, path.join(control, 'prisma/schema.prisma'), database);
    console.log('Baseline schema and migration checksums match.');

    if (recipe.migrations.length) {
      quietRun('Migration deploy', [path.join(control, 'node_modules/prisma/build/index.js'),
        'migrate', 'deploy', '--schema', path.join(candidate, 'prisma/schema.prisma')], { cwd: candidate, database });
    }
    if (recipe.identityBackfill) {
      const args = [path.join(candidate, 'node_modules/ts-node/dist/bin.js'), '-r',
        path.join(candidate, 'node_modules/tsconfig-paths/register.js'), path.join(candidate, 'prisma/backfill-identity.ts')];
      const options = { cwd: path.join(candidate, 'apps/api'), database };
      quietRun('Identity backfill and parity', args, options);
      if (mode === 'rehearsal') quietRun('Identity backfill repeat and parity', args, options);
      quietRun('Identity verification', [...args, '--verify'], options);
    }
    schemaParity(control, path.join(candidate, 'prisma/schema.prisma'), database);
    const finalHistory = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations');
    assertHistory(finalHistory.rows, target);
    summary(`**${mode === 'rehearsal' ? 'Rehearsal' : 'Production apply'} passed:** baseline, migration history, ` +
      `${recipe.migrations.length} migration(s), ${recipe.identityBackfill ? 'identity backfill and data parity, ' : ''}final schema parity.\n\n` +
      'Child command output is intentionally private; no rows, database dumps, or connection strings are published.');
  } finally {
    // Closing the session releases the advisory lock even after a failure.
    await client.end();
  }
}

if (require.main === module) runStage().catch(error => {
  // pg errors and child errors can contain credentials/rows. Only our fixed
  // validation messages are safe, so give a fixed failure message here as well.
  console.error('Migration stage failed; production may be partially migrated if apply began. Do not auto-retry or merge. Diagnose privately using the runbook.');
  process.exitCode = 1;
});
module.exports = { runStage };
