const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const schema = `oiano_baseline_verify_${Date.now()}`;
const baseline = path.resolve(__dirname, '..', 'prisma', 'baseline', '20260814_current_schema.sql');
const requiredTables = [
  'users', 'artists', 'artist_files', 'producers', 'tracks', 'bookings',
  'oiano_payments', 'ledger_entries',
];

if (!/^oiano_baseline_verify_\d+$/.test(schema)) throw new Error('Unsafe verification schema');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  try {
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(fs.readFileSync(baseline, 'utf8'));

    const tables = await client.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
      [schema],
    );
    const tableNames = new Set(tables.rows.map(({ table_name }) => table_name));
    const missing = requiredTables.filter((table) => !tableNames.has(table));
    if (missing.length) throw new Error(`Baseline is missing tables: ${missing.join(', ')}`);

    const foreignKeys = await client.query(
      `SELECT count(*)::int AS count FROM information_schema.table_constraints
       WHERE constraint_schema = $1 AND constraint_type = 'FOREIGN KEY'`,
      [schema],
    );
    console.log(`Baseline verified: ${tableNames.size} tables, ${foreignKeys.rows[0].count} foreign keys.`);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
