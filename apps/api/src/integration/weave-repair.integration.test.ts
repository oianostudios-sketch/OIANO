import assert from 'node:assert/strict';
import test from 'node:test';

// Booking completion only logs a Weave sync that fails, so a booking whose sync failed
// stayed out of its artist and studio's connection until a later booking between them
// re-synced it. Here completion runs for real while the database rejects these bookings'
// evidence, then the repair has to put every one of them back, exactly, and only once.
test('completed bookings whose Weave sync failed are repaired, exactly and once', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ prisma }, { recordBookingCompleted }, { repairMissedWeaveSyncs }] = await Promise.all([
    import('../lib/prisma'), import('../lib/bookingCompletion'), import('../lib/weave/repair'),
  ]);

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tag = runId.replace(/[^a-z0-9]/gi, '_');
  const trigger = `weave_repair_fail_${tag}`;
  t.after(async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON weave_connection_evidence`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${trigger}()`);
    await prisma.$disconnect();
  });

  const studio = await prisma.studio.create({ data: { slug: `weave-repair-${runId}`, name: 'Weave Repair Studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Weave Repair Room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Weave Repair Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const artist = async (n: number) => (await prisma.user.create({
    data: { email: `weave-repair-${n}-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: `Weave Repair ${n}` } } },
    include: { artist: true },
  })).artist!.id;
  const [artistA, artistB] = [await artist(1), await artist(2)];

  // Dated 1971 so these are older than anything other suites leave unsynced, and so
  // come first in the repair's oldest-first order.
  const booking = (artist_id: string, month: number, status: 'PENDING' | 'COMPLETED' = 'PENDING') => {
    const starts_at = new Date(Date.UTC(1971, month, 1, 12));
    return prisma.booking.create({ data: {
      studio_id: studio.id, artist_id, room_id: room.id, service_id: service.id,
      starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50, status,
    } });
  };
  const complete = async (b: { id: string; artist_id: string; studio_id: string }) => {
    await prisma.booking.update({ where: { id: b.id }, data: { status: 'COMPLETED' } });
    await recordBookingCompleted(b);
  };

  const synced = await booking(artistA, 3);
  const earlier = await booking(artistA, 1);
  const later = await booking(artistA, 5);
  const otherPair = await booking(artistB, 4);
  const pending = await booking(artistA, 2);
  const missed = [earlier, later, otherPair];

  await complete(synced);

  // The database refuses evidence for the three, so their syncs throw inside completion.
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.booking_id IN (${missed.map((b) => `'${b.id}'`).join(', ')}) THEN
        RAISE EXCEPTION 'weave sync forced to fail';
      END IF;
      RETURN NEW;
    END $fn$`);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON weave_connection_evidence FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
  );
  for (const b of missed) await complete(b);

  const connectionOf = (artistId: string) => prisma.weaveConnection.findFirst({
    where: { source_node_id: artistId, target_node_id: studio.id, type: 'RECORDED_AT' },
    include: { evidence: { select: { booking_id: true }, orderBy: { booking_id: 'asc' } } },
  });
  const before = await connectionOf(artistA);
  assert.ok(before);
  assert.deepEqual(before.evidence.map((e) => e.booking_id), [synced.id], 'the failed syncs recorded nothing');
  assert.equal(before.activity_count, 1);
  assert.equal(await connectionOf(artistB), null, 'the other pair has no connection yet');

  await prisma.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON weave_connection_evidence`);

  // While another run holds the lock, a run does nothing.
  const blocked = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('oiano:weave-repair'))`;
    return repairMissedWeaveSyncs({ limit: 100 });
  }, { timeout: 30_000 });
  assert.deepEqual(blocked, { ran: false, found: 0, repaired: 0, failed: 0 });
  assert.equal((await connectionOf(artistA))!.activity_count, 1);

  // Bounded and oldest first: a run of one repairs the earliest missed booking only.
  const first = await repairMissedWeaveSyncs({ limit: 1 });
  assert.deepEqual(first, { ran: true, found: 1, repaired: 1, failed: 0 });
  const afterFirst = await connectionOf(artistA);
  assert.deepEqual(afterFirst!.evidence.map((e) => e.booking_id), [synced.id, earlier.id].sort());
  assert.equal(afterFirst!.activity_count, 2);
  assert.equal(afterFirst!.first_activity_at.toISOString(), earlier.starts_at.toISOString());
  assert.equal(afterFirst!.last_activity_at.toISOString(), synced.starts_at.toISOString());

  const rest = await repairMissedWeaveSyncs({ limit: 100 });
  assert.equal(rest.ran, true);
  assert.equal(rest.failed, 0);

  const a = await connectionOf(artistA);
  assert.deepEqual(a!.evidence.map((e) => e.booking_id), [synced.id, earlier.id, later.id].sort());
  assert.equal(a!.activity_count, 3);
  assert.equal(a!.first_activity_at.toISOString(), earlier.starts_at.toISOString());
  assert.equal(a!.last_activity_at.toISOString(), later.starts_at.toISOString());
  const b = await connectionOf(artistB);
  assert.deepEqual(b!.evidence.map((e) => e.booking_id), [otherPair.id]);
  assert.equal(b!.activity_count, 1);
  assert.equal(b!.first_activity_at.toISOString(), otherPair.starts_at.toISOString());
  assert.equal(b!.last_activity_at.toISOString(), otherPair.starts_at.toISOString());
  assert.equal(await prisma.weaveEvidence.count({ where: { booking_id: pending.id } }), 0, 'a booking not completed is not evidence');

  // A second run finds none of these and changes nothing.
  await repairMissedWeaveSyncs({ limit: 100 });
  assert.deepEqual(await connectionOf(artistA), a);
  assert.deepEqual(await connectionOf(artistB), b);
  assert.equal(await prisma.weaveEvidence.count({ where: { booking_id: { in: [...missed, synced].map((x) => x.id) } } }), 4);
});
