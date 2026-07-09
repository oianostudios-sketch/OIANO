/**
 * Run from repo root:  node prisma/run-migration.js
 * Adds folder + source columns to artist_files table.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE artist_files ADD COLUMN IF NOT EXISTS folder TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE artist_files ADD COLUMN IF NOT EXISTS source TEXT`);
  console.log('✓ Migration applied: folder + source columns added to artist_files');
}

main().catch(console.error).finally(() => prisma.$disconnect());
