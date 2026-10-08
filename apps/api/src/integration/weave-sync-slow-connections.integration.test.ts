import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

// Weave's "bookings synced at the same moment are all counted" failed now and then on a
// busy machine with P2028, "Unable to start a transaction in the given time": each sync
// running at once needs its own pooled connection, opening one took longer than Prisma's
// default 2s to start a transaction, and the sync threw. Booking completion only logs a
// failed sync, so in use the booking would have gone uncounted. Here every new database
// connection is held back for three seconds, which makes that happen every time.
test('bookings synced at once are counted when opening a connection is slow', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  // A proxy in front of the database that can hold back each new connection. Prisma reads
  // DATABASE_URL when it is first imported, so the proxy is in place before that.
  let connectDelayMs = 0;
  const sockets = new Set<net.Socket>();
  const proxy = net.createServer((client) => {
    client.pause();
    sockets.add(client);
    setTimeout(() => {
      const upstream = net.connect(Number(database.port || 5432), database.hostname, () => {
        client.pipe(upstream);
        upstream.pipe(client);
        client.resume();
      });
      sockets.add(upstream);
      const close = () => { client.destroy(); upstream.destroy(); };
      for (const socket of [client, upstream]) {
        socket.on('error', close);
        socket.on('close', close);
      }
    }, connectDelayMs);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const throughProxy = new URL(database);
  throughProxy.port = String((proxy.address() as AddressInfo).port);
  process.env.DATABASE_URL = throughProxy.toString();

  const [{ prisma }, { syncConnectionFromBooking }] = await Promise.all([
    import('../lib/prisma'), import('../lib/weave/sync'),
  ]);
  t.after(async () => {
    await prisma.$disconnect();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  });

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const studio = await prisma.studio.create({ data: { slug: `weave-slow-${runId}`, name: 'Weave Slow Studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Weave Slow Room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Weave Slow Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const user = await prisma.user.create({
    data: { email: `weave-slow-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: 'Weave Slow' } } },
    include: { artist: true },
  });
  const artistId = user.artist!.id;
  const bookings = [];
  for (let i = 0; i < 6; i += 1) {
    const starts_at = new Date(Date.now() - (300 - i) * 86_400_000);
    bookings.push(await prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artistId, room_id: room.id, service_id: service.id,
      starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50, status: 'COMPLETED',
    } }));
  }

  // The fixtures ran one at a time on one connection, so the syncs below need new ones.
  connectDelayMs = 3_000;
  const results = await Promise.allSettled(bookings.map((booking) => syncConnectionFromBooking(booking.id)));
  connectDelayMs = 0;
  assert.deepEqual(
    results.map((result) => (result.status === 'fulfilled' ? 'synced' : `${(result.reason as any)?.code}: ${(result.reason as Error)?.message}`)),
    bookings.map(() => 'synced'),
    'every sync waits for its connection rather than giving up',
  );

  const connection = await prisma.weaveConnection.findFirstOrThrow({
    where: { source_node_id: artistId, target_node_id: studio.id },
    include: { evidence: true },
  });
  assert.equal(connection.evidence.length, bookings.length);
  assert.equal(connection.activity_count, bookings.length);
  assert.equal(connection.first_activity_at.toISOString(), bookings[0].starts_at.toISOString());
  assert.equal(connection.last_activity_at.toISOString(), bookings[bookings.length - 1].starts_at.toISOString());
});
