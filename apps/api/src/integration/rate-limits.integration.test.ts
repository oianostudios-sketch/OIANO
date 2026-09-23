import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A studio, an office and an event venue each reach the API from one public
// address. Counted by address, the room shares one person's budget and locks
// itself out; these hold the limits to counting callers instead.
test('a rate limit counts a caller, not the building they are in', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ app }, { prisma }] = await Promise.all([import('../app'), import('../lib/prisma')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  // Every request in this file leaves from 127.0.0.1, which is exactly the point:
  // one address, several people.
  const post = async (path: string, body: unknown, user?: { id: string; role: string }) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(user ? { authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return response.status;
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const artist = async (label: string) => prisma.user.create({
    data: { email: `${label}-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: label } } },
  });

  await t.test('one artist using up their booking budget does not use up another\'s', async () => {
    const first = await artist('booking-budget-first');
    const second = await artist('booking-budget-second');

    // bookings.routes.ts allows 20 booking attempts a minute. An empty body is
    // refused by the schema, which is enough: the limiter runs before the handler.
    let refused = 0;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      if (await post('/bookings', {}, first) === 429) refused += 1;
    }
    assert.equal(refused, 1, 'the twenty-first attempt is the one refused');

    const other = await post('/bookings', {}, second);
    assert.notEqual(other, 429, 'the second artist has their own budget');
    assert.equal(other, 400, 'and reaches the same validation as anyone else');
  });

  await t.test('one account\'s sign-in attempts do not use up the whole address\'s', async () => {
    // auth.routes.ts allows 10 attempts a minute per account. Neither account
    // exists, so nothing here depends on a password.
    let refused = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      if (await post('/auth/login', { email: `venue-a-${runId}@example.test`, password: 'whatever-123' }) === 429) refused += 1;
    }
    assert.equal(refused, 1, 'the eleventh attempt on that account is refused');

    const neighbour = await post('/auth/login', { email: `venue-b-${runId}@example.test`, password: 'whatever-123' });
    assert.notEqual(neighbour, 429, 'the person next to them can still sign in');
    assert.equal(neighbour, 401, 'and is told their credentials are wrong, like anyone else');
  });
});
