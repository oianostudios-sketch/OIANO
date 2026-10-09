'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');
const { assertReadOnly } = require('./check-pr.cjs');
const { schemaParity } = require('./common.cjs');

test('real PostgreSQL enforces the dedicated reader and rejects privilege regressions', async () => {
  const url = new URL(process.env.INTEGRATION_DATABASE_URL || 'invalid:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only disposable local databases may be tested');
  assert.match(url.pathname, /(?:_|\/)test(?:_|$)/);
  const admin = new Client({ connectionString: url.href });
  const role = `oiano_ci_reader_${process.pid}`;
  const writer = `oiano_ci_writer_${process.pid}`;
  const schema = `oiano_ci_schema_${process.pid}`;
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'oiano-schema-test-'));
  const password = randomBytes(24).toString('hex');
  let roleCreated = false;
  let writerCreated = false;
  await admin.connect();
  try {
    await assert.rejects(() => assertReadOnly(admin), /dedicated read-only/);
    await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    roleCreated = true;
    await admin.query(`CREATE ROLE "${writer}" NOLOGIN`); writerCreated = true;
    await admin.query(`ALTER ROLE "${role}" SET default_transaction_read_only = on`);
    await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await admin.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await admin.query('CREATE TABLE public.oiano_readonly_probe (id integer)');
    await admin.query(`GRANT SELECT ON public.oiano_readonly_probe TO "${role}"`);
    const readerUrl = new URL(url.href); readerUrl.username = role; readerUrl.password = password;
    const reader = new Client({ connectionString: readerUrl.href });
    await reader.connect();
    try {
      await assert.doesNotReject(() => assertReadOnly(reader));
      await assert.rejects(() => reader.query('INSERT INTO public.oiano_readonly_probe VALUES (1)'), /read-only transaction/);
      await reader.query('SET default_transaction_read_only = off');
      await assert.rejects(() => reader.query('INSERT INTO public.oiano_readonly_probe VALUES (1)'), /permission denied/);
      await assert.rejects(() => assertReadOnly(reader), /dedicated read-only/);
      await reader.query('SET default_transaction_read_only = on');
      await admin.query(`GRANT UPDATE ON public.oiano_readonly_probe TO "${role}"`);
      await assert.rejects(() => assertReadOnly(reader), /dedicated read-only/);
      await admin.query(`REVOKE UPDATE ON public.oiano_readonly_probe FROM "${role}"`);
      await admin.query(`GRANT CREATE ON SCHEMA public TO "${role}"`);
      await assert.rejects(() => assertReadOnly(reader), /dedicated read-only/);
      await admin.query(`REVOKE CREATE ON SCHEMA public FROM "${role}"`);
      await admin.query(`GRANT UPDATE ON public.oiano_readonly_probe TO "${writer}"`);
      await admin.query(`GRANT "${writer}" TO "${role}"`);
      await assert.rejects(() => assertReadOnly(reader), /dedicated read-only/);
      await admin.query(`REVOKE "${writer}" FROM "${role}"`);
      await assert.doesNotReject(() => assertReadOnly(reader));

      // Exercise the actual Prisma comparison with the restricted role. A
      // generator named by PR data must not execute during migrate diff.
      await admin.query(`CREATE SCHEMA "${schema}"`);
      await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
      await admin.query(`CREATE TABLE "${schema}"."Probe" (id integer PRIMARY KEY)`);
      await admin.query(`GRANT SELECT ON "${schema}"."Probe" TO "${role}"`);
      const schemaFile = path.join(folder, 'schema.prisma');
      fs.writeFileSync(schemaFile, `generator trap {
  provider = "this-generator-must-never-be-executed"
}
datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
}
model Probe {
  id Int @id
}
`);
      readerUrl.searchParams.set('schema', schema);
      const root = path.resolve(__dirname, '../..');
      assert.doesNotThrow(() => schemaParity(root, schemaFile, readerUrl.href));
      await admin.query(`ALTER TABLE "${schema}"."Probe" ADD COLUMN unexpected text`);
      assert.throws(() => schemaParity(root, schemaFile, readerUrl.href), /schema differs/);
    } finally { await reader.end(); }
  } finally {
    await admin.query('DROP TABLE IF EXISTS public.oiano_readonly_probe');
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    for (const [name, created] of [[role, roleCreated], [writer, writerCreated]]) {
      if (created) { await admin.query(`DROP OWNED BY "${name}"`); await admin.query(`DROP ROLE "${name}"`); }
    }
    await admin.end();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
