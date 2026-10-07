import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

// Every interactive transaction waits for a connection longer than Prisma's 2s default. Weave
// syncs failed with P2028, "Unable to start a transaction in the given time", when opening a
// connection was slow (2026-10-07), and 24 other transactions, bookings and payments among
// them, used the same default. Here every new database connection is held back for three
// seconds, and transactions that set no options of their own must still run.
test('a transaction with no options of its own waits for a slow connection', async (t) => {
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

  const { prisma } = await import('../lib/prisma');
  t.after(async () => {
    await prisma.$disconnect();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  });
  await prisma.$queryRaw`SELECT 1`;

  // The first query ran on one connection, so the transactions below need new ones.
  connectDelayMs = 3_000;
  const results = await Promise.allSettled(Array.from({ length: 4 }, (_, i) =>
    prisma.$transaction(async (tx) => (await tx.$queryRaw<Array<{ n: number }>>`SELECT ${i}::int AS n`)[0].n)));
  connectDelayMs = 0;
  assert.deepEqual(
    results.map((result) => (result.status === 'fulfilled' ? result.value : `${(result.reason as any)?.code}: ${(result.reason as Error)?.message}`)),
    [0, 1, 2, 3],
    'every transaction waits for its connection rather than giving up',
  );
});
