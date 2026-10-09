// prisma/readiness-report.ts
// Read-only counts the owner needs before the name repair, Weave backfill, identity
// migration (#16, #39) and untyped-reference (C13) decisions:
//   npm run db:readiness --workspace=apps/api
// with DATABASE_URL set in the environment. It never reads .env: the URL must be the
// one the owner exported, and the report says which host it is about to read.
//
// Every query runs in one READ ONLY transaction, so Postgres refuses any write. It
// prints counts, fixed labels and migration folder names only: no name, email or id.
// The logic lives in apps/api/src/lib/readinessReport.ts, where it is tested.
import fs from 'fs';
import path from 'path';

// Taken before anything is imported that could load a .env file.
const databaseUrl = process.env.DATABASE_URL?.trim();

function describeTarget(url: string) {
  const parsed = new URL(url);
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error('DATABASE_URL is not a postgresql:// URL.');
  // Host, port and database only: never the user or password.
  return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
}

async function main() {
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set, so nothing was run. Set it to the database to report on.');
    process.exitCode = 1;
    return;
  }
  let target: string;
  try {
    target = describeTarget(databaseUrl);
  } catch {
    console.error('DATABASE_URL is not a valid postgresql:// URL, so nothing was run.');
    process.exitCode = 1;
    return;
  }
  console.log(`OIANO readiness report (read-only) for ${target}`);
  console.log(`Run at ${new Date().toISOString()}`);
  console.log('');

  const migrationNames = fs.readdirSync(path.resolve(__dirname, 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const { PrismaClient } = await import('@prisma/client');
  const { collectReadinessReport, formatReadinessReport } = await import('../apps/api/src/lib/readinessReport');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: ['error'] });
  try {
    const report = await collectReadinessReport(prisma, migrationNames);
    console.log(formatReadinessReport(report));
    console.log('');
    console.log('End of report. It holds counts only and no connection details beyond the host above.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // The message only: a Prisma error can quote the connection string.
  let message = String(e?.message ?? e).split(databaseUrl ?? '\u0000').join('<DATABASE_URL>');
  try {
    const password = databaseUrl ? new URL(databaseUrl).password : '';
    if (password) message = message.split(password).join('<password>').split(decodeURIComponent(password)).join('<password>');
  } catch { /* an unparseable URL never connected */ }
  console.error('Readiness report failed:', message);
  process.exitCode = 1;
});
