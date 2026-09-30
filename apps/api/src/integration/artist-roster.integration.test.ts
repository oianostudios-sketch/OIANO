import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// What a studio's roster, GET /api/artists, discloses about each artist, against a real
// database. Every admin at every studio an artist has booked reads that artist's row, so
// the artist's privacy choices must hold there as they do on the profile, and the row
// carries no wallet: it holds the artist's money from every studio they work with.

const PRIVATE_LOCATION = 'Quiet Street, Kumasi';
const HIDDEN_BRIEF = 'A brief this artist keeps to themselves';

test("a studio admin's roster carries only what the roster shows", async (t) => {
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
  const read = async (path: string, viewer: { id: string; role: string }) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${jwt.sign({ sub: viewer.id, role: viewer.role, ver: 0 }, process.env.JWT_SECRET!)}` },
    });
    return { status: response.status, body: (await response.json()) as any };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  const email = (label: string) => `${unique(label)}@example.test`;

  const studio = await prisma.studio.create({ data: { slug: unique('roster'), name: 'Roster studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Roster room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Roster session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const admin = await prisma.user.create({ data: { email: email('roster-admin'), role: 'STUDIO_ADMIN' } });
  await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });

  const passportCode = unique('OIA').toUpperCase();
  const subject = await prisma.user.create({
    data: {
      email: email('roster-artist'), role: 'ARTIST',
      artist: { create: {
        name: 'Roster Artist', alias: 'Roster Alias',
        wallet: { create: { balance_usd: 250 } },
        passport: { create: {
          passport_code: passportCode, profile_strength: 60,
          location: PRIVATE_LOCATION, location_public: false, ai_summary: HIDDEN_BRIEF, ai_summary_public: false,
        } },
      } },
    },
    include: { artist: true },
  });
  const starts_at = new Date(Date.now() - 7 * 86_400_000);
  await prisma.booking.create({ data: {
    studio_id: studio.id, artist_id: subject.artist!.id, room_id: room.id, service_id: service.id,
    starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50, status: 'COMPLETED',
  } });

  const roster = async () => {
    const { status, body } = await read('/artists', admin);
    assert.equal(status, 200);
    const row = body.data.find((item: any) => item.id === subject.artist!.id);
    assert.ok(row, 'the artist booked this studio, so is on its roster');
    return { body, row };
  };

  await t.test("the artist's privacy choices hold on the roster", async () => {
    const text = JSON.stringify((await roster()).body);
    const carried = [PRIVATE_LOCATION, HIDDEN_BRIEF].filter((fragment) => text.includes(fragment));
    assert.deepEqual(carried, [], 'a location the artist has not published and a brief they keep private stay private');
  });

  await t.test('the roster carries no wallet', async () => {
    const { row } = await roster();
    assert.equal(row.wallet, undefined, "an artist's balance is not a studio's to read");
  });

  await t.test('the roster keeps what the admin dashboard and command palette read', async () => {
    const { row } = await roster();
    assert.equal(row.name, 'Roster Artist');
    assert.equal(row.alias, 'Roster Alias');
    assert.equal(row.passport?.passport_code, passportCode);
    assert.equal(row.passport?.profile_strength, 60);
  });
});
