/**
 * Reconstructed placeholder — the original apps/api/migrate.js was accidentally
 * deleted (untracked, no git history) during this session. Its exact contents
 * are unknown; this mirrors the pattern of the sibling one-off scripts
 * (run-migration-pg.js, run-migration.bat) that apply manual SQL fixes to the
 * Neon dev DB when prisma migrate's history is out of sync. Uses @prisma/client
 * (already a dependency here) rather than `pg`, which isn't installed in this
 * workspace. Review before use.
 *
 * Run: node migrate.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Connected to Neon.');

  // Add any pending manual SQL here, e.g.:
  // await prisma.$executeRawUnsafe('ALTER TABLE artist_files ADD COLUMN IF NOT EXISTS folder TEXT');

  console.log('Migration complete.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
