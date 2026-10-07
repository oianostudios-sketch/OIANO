import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A public name is what the person typed. When they typed none, account creation used to
// publish the part of their email address before the @ as their name, on the artist
// profile, in discovery and on the public passport. A new account without a name now
// carries a neutral placeholder that contains nothing from the email.
test('signup never turns an email address into a public name', async (t) => {
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

  const runId = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const genre = `Signup name ${runId}`;
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const bearer = (user: { id: string; role: string }) =>
    ({ authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}` });

  // A second artist who shares a genre with the new ones, so discovery lists them.
  const viewer = await prisma.user.create({
    data: { email: `signup-viewer-${runId}@example.test`, role: 'ARTIST', artist: { create: {
      name: `Viewer ${runId}`,
      passport: { create: { passport_code: `SGV-${runId}`.toUpperCase(), creative_dna: { genres: [genre] } } },
    } } },
  });

  // Everything anyone else can read about an artist: profile, discovery, public passport.
  const publicArtistViews = async (artistId: string) => {
    const passport = await prisma.artistPassport.update({
      where: { artist_id: artistId }, data: { creative_dna: { genres: [genre] } },
    });
    const profile = await fetch(`${baseUrl}/artists/${artistId}`, { headers: bearer(viewer) });
    assert.equal(profile.status, 200);
    const discover = await fetch(`${baseUrl}/artists/discover`, { headers: bearer(viewer) });
    assert.equal(discover.status, 200);
    const discovered = (await discover.json()) as any[];
    const listed = discovered.find((entry) => entry.id === artistId);
    assert.ok(listed, 'the new artist appears in discovery');
    const card = await fetch(`${baseUrl}/passport/public/${passport.passport_code}`);
    assert.equal(card.status, 200);
    return { profile: await profile.text(), discover: JSON.stringify(listed), passport: await card.text() };
  };

  await t.test('an artist who typed a name is published under it', async () => {
    const name = `Ada Okafor ${runId}`;
    const created = await post('/auth/signup', { email: `ada.okafor.${runId}@example.test`, password: 'password-123', name, role: 'ARTIST' });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.artist.name, name);
    const views = await publicArtistViews(created.body.user.artist.id);
    for (const view of Object.values(views)) assert.ok(view.includes(name));
  });

  await t.test('a creative professional who typed a name keeps it', async () => {
    const name = `Kofi Mensah ${runId}`;
    const created = await post('/auth/signup', {
      email: `kofi.mensah.${runId}@example.test`, password: 'password-123', name, role: 'PRODUCER', disciplines: ['MIX_ENGINEER'],
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.producer.name, name);
  });

  const nameless: Array<[string, string, Record<string, unknown>]> = [
    ['signup without a name', '/auth/signup', { role: 'ARTIST' }],
    ['signup with a blank name', '/auth/signup', { role: 'ARTIST', name: '   ' }],
    ['the unified entry', '/auth/enter', {}],
  ];
  for (const [label, path, extra] of nameless) {
    await t.test(`${label} publishes no part of the email`, async () => {
      const localPart = `privatemailbox${label.length}x${runId}`;
      const created = await post(path, { email: `${localPart}@example.test`, password: 'password-123', ...extra });
      assert.equal(created.status, 201);
      assert.equal(created.body.user.artist.name, 'New artist');
      const views = await publicArtistViews(created.body.user.artist.id);
      for (const [where, view] of Object.entries(views)) {
        assert.ok(!view.toLowerCase().includes(localPart.toLowerCase()), `${where} exposes the email local part`);
        assert.ok(view.includes('New artist'), `${where} shows the placeholder`);
      }
    });
  }

  await t.test('a creative professional without a name is not listed under their email', async () => {
    const localPart = `privateproducer${runId}`;
    const created = await post('/auth/signup', {
      email: `${localPart}@example.test`, password: 'password-123', role: 'PRODUCER', disciplines: ['PRODUCER'],
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.producer.name, 'New creative professional');
    await prisma.producer.update({ where: { id: created.body.user.producer.id }, data: { open_to_collabs: true } });
    const discover = await fetch(`${baseUrl}/producer/discover`, { headers: bearer(viewer) });
    assert.equal(discover.status, 200);
    const listed = ((await discover.json()) as any[]).find((entry) => entry.id === created.body.user.producer.id);
    assert.ok(listed, 'the new professional appears in discovery');
    assert.ok(!JSON.stringify(listed).toLowerCase().includes(localPart.toLowerCase()));
  });
});
