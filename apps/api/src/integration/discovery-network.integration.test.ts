import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Discovery ranks every artist on the network (C39). It used to score only the first 50
// rows the database returned, so once the network passed 50 artists the best match could
// simply never appear. Ties go to completed sessions, never to profile completeness (C18).
test('discovery finds the best match anywhere on the network', async (t) => {
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

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  // A genre nobody else in the database uses, so only this file's artists can share it.
  const genre = `Highlife ${runId}`;
  let n = 0;
  const artist = async (dna: Record<string, unknown>, profile_strength = 50) => {
    n += 1;
    const user = await prisma.user.create({
      data: { email: `discovery-${n}-${runId}@example.test`, role: 'ARTIST', artist: { create: {
        name: `Discovery ${n} ${runId}`,
        passport: { create: { passport_code: `DSC-${n}-${runId}`.toUpperCase(), creative_dna: dna as any, profile_strength } },
      } } },
      include: { artist: true },
    });
    return user;
  };

  const caller = await artist({ genres: [genre], key_themes: ['love'], vocal_type: 'tenor' });
  // Sixty artists who share nothing, created first, so a first-50 scan never reaches what follows.
  for (let i = 0; i < 60; i += 1) await artist({ genres: ['Unrelated'] });
  const polished = await artist({ genres: [genre] }, 100);
  const working = await artist({ genres: [genre] }, 10);
  const bestMatch = await artist({ genres: [genre], key_themes: ['love'], vocal_type: 'soprano' }, 5);
  const malformed = await artist({ genres: 'not a list', key_themes: 7 });

  const studio = await prisma.studio.create({ data: { slug: `discovery-${runId}`, name: 'Discovery Studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Room' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 10, max_price_usd: 10, unit: 'hour' } });
  for (let i = 0; i < 2; i += 1) {
    const starts = new Date(Date.UTC(2029, 3, 1 + i, 12));
    await prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: working.artist!.id, room_id: room.id, service_id: service.id,
      starts_at: starts, ends_at: new Date(starts.getTime() + 3_600_000), total_usd: 10, status: 'COMPLETED',
    } });
  }

  const response = await fetch(`${baseUrl}/artists/discover`, {
    headers: { authorization: `Bearer ${jwt.sign({ sub: caller.id, role: 'ARTIST', ver: 0 }, process.env.JWT_SECRET!)}` },
  });
  assert.equal(response.status, 200);
  const results = (await response.json()) as any[];
  const ids = results.map((r) => r.id);

  await t.test('the best match is found however late it joined', () => {
    assert.equal(ids[0], bestMatch.artist!.id, 'shared genre, shared theme and a complementary voice rank first');
    assert.equal(results[0].overlap_score, 6);
    assert.deepEqual(results[0].shared_themes, ['love']);
  });

  await t.test('a tie goes to completed sessions, not to a fuller profile', () => {
    assert.deepEqual(ids.slice(1, 3), [working.artist!.id, polished.artist!.id]);
  });

  await t.test('the caller is never shown to themselves, and odd profile data does not break the ranking', () => {
    assert.ok(!ids.includes(caller.artist!.id));
    assert.ok(results.length <= 20);
    assert.ok(!ids.slice(0, 3).includes(malformed.artist!.id));
  });
});
