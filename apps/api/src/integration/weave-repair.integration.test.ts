import assert from 'node:assert/strict';
import test from 'node:test';

// Booking completion only logs a Weave sync that fails, so a booking whose sync failed
// stayed out of its artist and studio's connection until a later booking between them
// re-synced it. Here completion runs for real while the database rejects these bookings'
// evidence, then the repair has to put every one of them back, exactly, and only once —
// without reaching back past its window, and without one failing booking blocking the rest.
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

  // The database refuses evidence for these bookings, so their syncs throw.
  const failEvidenceFor = (ids: string[]) => prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.booking_id = ANY (ARRAY[${ids.map((id) => `'${id}'`).join(', ')}]::text[]) THEN
        RAISE EXCEPTION 'weave sync forced to fail';
      END IF;
      RETURN NEW;
    END $fn$`);

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

  // Sessions dated 1971 so they come before anything other suites leave unsynced in the
  // repair's oldest-first order. They complete now, which puts them inside its window.
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

  const stuck = await booking(artistA, 0);
  const earlier = await booking(artistA, 1);
  const pending = await booking(artistA, 2);
  const synced = await booking(artistA, 3);
  const otherPair = await booking(artistB, 4);
  const later = await booking(artistA, 5);
  const missed = [earlier, later, otherPair];

  // Completed thirty days ago with no evidence, as a booking from before the Weave is.
  // Only a deliberate backfill may sync it.
  const old = await booking(artistB, 6, 'COMPLETED');
  await prisma.$executeRaw`UPDATE bookings SET updated_at = now() - interval '30 days' WHERE id = ${old.id}`;

  await failEvidenceFor([]);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON weave_connection_evidence FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
  );
  await complete(synced);
  await failEvidenceFor([stuck.id, ...missed.map((b) => b.id)]);
  for (const b of [stuck, ...missed]) await complete(b);

  const connectionOf = (artistId: string) => prisma.weaveConnection.findFirst({
    where: { source_node_id: artistId, target_node_id: studio.id, type: 'RECORDED_AT' },
    include: { evidence: { select: { booking_id: true }, orderBy: { booking_id: 'asc' } } },
  });
  const evidenceOf = (id: string) => prisma.weaveEvidence.count({ where: { booking_id: id } });
  const before = await connectionOf(artistA);
  assert.ok(before);
  assert.deepEqual(before.evidence.map((e) => e.booking_id), [synced.id], 'the failed syncs recorded nothing');
  assert.equal(before.activity_count, 1);
  assert.equal(await connectionOf(artistB), null, 'the other pair has no connection yet');

  // From here only `stuck` keeps failing, as a booking whose sync fails every time.
  await failEvidenceFor([stuck.id]);

  // While another run holds the lock, a run does nothing.
  const blocked = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('oiano:weave-repair'))`;
    return repairMissedWeaveSyncs({ limit: 100 });
  }, { timeout: 30_000 });
  assert.deepEqual(blocked, { ran: false, found: 0, repaired: 0, failed: 0 });
  assert.equal((await connectionOf(artistA))!.activity_count, 1);

  // Bounded and oldest first: a run of one tries the oldest, which fails.
  assert.deepEqual(await repairMissedWeaveSyncs({ limit: 1 }), { ran: true, found: 1, repaired: 0, failed: 1 });
  assert.equal(await evidenceOf(stuck.id), 0);

  // The next run of one skips the booking that just failed and reaches the next.
  assert.deepEqual(await repairMissedWeaveSyncs({ limit: 1 }), { ran: true, found: 1, repaired: 1, failed: 0 });
  const afterSecond = await connectionOf(artistA);
  assert.deepEqual(afterSecond!.evidence.map((e) => e.booking_id), [synced.id, earlier.id].sort());
  assert.equal(afterSecond!.activity_count, 2);
  assert.equal(afterSecond!.first_activity_at.toISOString(), earlier.starts_at.toISOString());
  assert.equal(afterSecond!.last_activity_at.toISOString(), synced.starts_at.toISOString());

  // A run with the scheduled defaults repairs the rest, and leaves the old booking alone.
  const rest = await repairMissedWeaveSyncs();
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
  assert.equal(await evidenceOf(old.id), 0, 'a booking completed before the window is not touched');
  assert.equal(await evidenceOf(pending.id), 0, 'a booking not completed is not evidence');
  assert.equal(await evidenceOf(stuck.id), 0);

  // A second run finds none of these and changes nothing.
  await repairMissedWeaveSyncs();
  assert.deepEqual(await connectionOf(artistA), a);
  assert.deepEqual(await connectionOf(artistB), b);
  assert.equal(await evidenceOf(old.id), 0);

  // A deliberate run without the window reaches the old booking.
  await failEvidenceFor([]);
  const unbounded = await repairMissedWeaveSyncs({ limit: 100, since: null });
  assert.equal(unbounded.failed, 0);
  const bAll = await connectionOf(artistB);
  assert.deepEqual(bAll!.evidence.map((e) => e.booking_id), [otherPair.id, old.id].sort());
  assert.equal(bAll!.activity_count, 2);
  assert.equal(bAll!.last_activity_at.toISOString(), old.starts_at.toISOString());
  // `stuck` failed under an hour ago, so it is still skipped.
  assert.equal(await evidenceOf(stuck.id), 0);
});
