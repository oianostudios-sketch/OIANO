import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';

test('session evidence survives concurrency and upload metadata is parsed at the boundary', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);
  const originalCwd = process.cwd();
  const uploadDirectory = mkdtempSync(path.join(tmpdir(), 'oiano-audit-upload-test-'));
  process.chdir(uploadDirectory);
  const [{ app }, { prisma }, { appendSessionLogNote, upsertSessionLog }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../lib/sessionLog'),
  ]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
    process.chdir(originalCwd);
    // Only the unique directory created by this test contains these uploads.
    assert.equal(path.dirname(uploadDirectory), path.resolve(tmpdir()));
    rmSync(uploadDirectory, { recursive: true, force: true });
  });
  const runId = randomUUID();
  const user = await prisma.user.create({
    data: { email: `audit-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: 'Audit Artist' } } },
    include: { artist: true },
  });
  const studio = await prisma.studio.create({ data: { slug: `audit-${runId}`, name: 'Audit Studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Audit Room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Audit Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const booking = await prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: user.artist!.id, room_id: room.id, service_id: service.id,
    starts_at: new Date('2026-09-06T10:00:00Z'), ends_at: new Date('2026-09-06T11:00:00Z'), total_usd: 50,
  } });

  await t.test('parallel first appends create one log and preserve every line', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => `DAW save ${i}: 'quoted' \\ ${runId}`);
    await Promise.all(lines.map(line => appendSessionLogNote(booking, line)));
    const logs = await prisma.sessionLog.findMany({ where: { booking_id: booking.id } });
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0].notes!.split('\n').sort(), [...lines].sort());
    assert.equal(logs[0].artist_id, booking.artist_id);
    assert.equal(logs[0].started_at!.toISOString(), booking.starts_at.toISOString());
  });
  await t.test('parallel appends preserve existing notes, ratings, and track titles', async () => {
    await upsertSessionLog(booking, { notes: 'Engineer notes', quality_rating: 5, tracks_worked: ['Track A'] });
    const lines = Array.from({ length: 12 }, (_, i) => `New save ${i}`);
    await Promise.all(lines.map(line => appendSessionLogNote(booking, line)));
    const log = await prisma.sessionLog.findUniqueOrThrow({ where: { booking_id: booking.id } });
    assert.deepEqual(log.notes!.split('\n').sort(), ['Engineer notes', ...lines].sort());
    assert.equal(log.quality_rating, 5);
    assert.deepEqual(log.tracks_worked, ['Track A']);
  });
  await t.test('null and empty notes do not gain a leading newline; caller rollback is respected', async () => {
    for (const notes of [null, '']) {
      await upsertSessionLog(booking, { notes });
      assert.equal((await appendSessionLogNote(booking, 'first')).notes, 'first');
    }
    await assert.rejects(prisma.$transaction(async tx => {
      await appendSessionLogNote(booking, 'must roll back', tx);
      throw new Error('deliberate rollback');
    }), /deliberate rollback/);
    assert.equal((await prisma.sessionLog.findUniqueOrThrow({ where: { booking_id: booking.id } })).notes, 'first');
  });

  const token = jwt.sign({ sub: user.id, role: 'ARTIST', ver: 0 }, process.env.JWT_SECRET!);
  const upload = async (fields: Array<[string, string]>) => {
    const form = new FormData();
    form.append('file', new Blob(['test audio'], { type: 'audio/wav' }), 'test.wav');
    for (const [key, value] of fields) form.append(key, value);
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/artists/${user.artist!.id}/files`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form,
    });
    return { status: response.status, body: await response.json() as any };
  };
  await t.test('malformed multipart metadata returns 400 without creating a record', async () => {
    for (const fields of [
      [['folder', 'one'], ['folder', 'two']],
      [['source', 'one'], ['source', 'two']],
      [['folder', 'x'.repeat(256)]],
      [['source', 'x'.repeat(256)]],
    ] as Array<Array<[string, string]>>) {
      const result = await upload(fields);
      assert.equal(result.status, 400);
      assert.equal(result.body.error, 'Validation error');
    }
    assert.equal(await prisma.artistFile.count({ where: { artist_id: user.artist!.id } }), 0);
  });
  await t.test('valid metadata keeps trimming and empty-to-null behavior', async () => {
    const result = await upload([['folder', '  Mixes  '], ['source', '  ']]);
    assert.equal(result.status, 201);
    assert.equal(result.body.folder, 'Mixes');
    assert.equal(result.body.source, null);
    assert.equal((await upload([])).status, 201);
  });
});
