import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Two holes a studio account could reach past its own studio through.
// Feedback is product feedback to OIANO, sent from the widget on every page by any
// account; reading it or changing its status was open to any STUDIO_ADMIN, which
// handed one studio every other user's reports and email. It belongs to platform
// operators (OIANO_ADMIN) only. And the facilities writes trusted the ids they were
// given: a studio could attach its equipment to another studio's room, file issues
// against another studio's rooms, equipment and bookings, and assign its issues to
// anyone. Each now has to name something in the caller's own studio.

test('feedback stays with OIANO and facilities writes stay in the caller\'s studio', async (t) => {
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
  const request = async (method: string, path: string, user: { id: string; role: string }, body?: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, body: parsed };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  const email = (label: string) => `${unique(label)}@example.test`;

  const studioA = await prisma.studio.create({ data: { slug: unique('scope-a'), name: 'Scope A' } });
  const studioB = await prisma.studio.create({ data: { slug: unique('scope-b'), name: 'Scope B' } });
  const roomA = await prisma.room.create({ data: { studio_id: studioA.id, name: 'A room' } });
  const roomB = await prisma.room.create({ data: { studio_id: studioB.id, name: 'B room' } });
  const equipmentB = await prisma.equipment.create({ data: { studio_id: studioB.id, room_id: roomB.id, name: 'B desk', type: 'Console' } });
  const serviceB = await prisma.serviceOffering.create({ data: {
    studio_id: studioB.id, category: 'RECORDING', name: 'B session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });

  // The owner of studio A: a STUDIO_ADMIN with a legacy-owner membership, which holds
  // every capability, so only the studio boundary can refuse it.
  const ownerA = await prisma.user.create({ data: { email: email('owner-a'), role: 'STUDIO_ADMIN', active_studio_id: studioA.id } });
  await prisma.studioStaff.create({ data: { user_id: ownerA.id, studio_id: studioA.id, role: 'STUDIO_ADMIN', capabilities: [] } });
  const ownerB = await prisma.user.create({ data: { email: email('owner-b'), role: 'STUDIO_ADMIN', active_studio_id: studioB.id } });
  await prisma.studioStaff.create({ data: { user_id: ownerB.id, studio_id: studioB.id, role: 'STUDIO_ADMIN', capabilities: [] } });
  const artistUser = await prisma.user.create({ data: { email: email('artist'), role: 'ARTIST' } });
  const artist = await prisma.artist.create({ data: { user_id: artistUser.id, name: 'Scope Artist' } });
  const operator = await prisma.user.create({ data: { email: email('operator'), role: 'OIANO_ADMIN' } });

  await t.test('a studio account cannot read or change anyone\'s feedback', async () => {
    const posted = await request('POST', '/feedback', artistUser, { category: 'BUG', page: '/projects', description: 'The upload spinner never stops' });
    assert.equal(posted.status, 201, JSON.stringify(posted.body));
    const fromStudioB = await request('POST', '/feedback', ownerB, { category: 'CONFUSING', page: '/studio', description: 'Where is the calendar' });
    assert.equal(fromStudioB.status, 201);

    for (const caller of [ownerA, artistUser]) {
      const listed = await request('GET', '/feedback', caller);
      assert.equal(listed.status, 403, `${caller.role} listed feedback: ${JSON.stringify(listed.body).slice(0, 200)}`);
      assert.ok(!JSON.stringify(listed.body).includes(artistUser.email), 'no reporter email leaves');
      for (const id of [posted.body.id, fromStudioB.body.id]) {
        const changed = await request('PATCH', `/feedback/${id}`, caller, { status: 'RESOLVED' });
        assert.equal(changed.status, 403, `${caller.role} changed feedback status`);
      }
    }
    const stored = await prisma.feedback.findMany({ where: { id: { in: [posted.body.id, fromStudioB.body.id] } } });
    assert.deepEqual(stored.map((row) => row.status), ['OPEN', 'OPEN']);

    // Platform operators still triage it.
    const listed = await request('GET', '/feedback?limit=100', operator);
    assert.equal(listed.status, 200);
    const mine = listed.body.find((row: any) => row.id === posted.body.id);
    assert.equal(mine?.user?.email, artistUser.email);
    const resolved = await request('PATCH', `/feedback/${posted.body.id}`, operator, { status: 'RESOLVED' });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.status, 'RESOLVED');
  });

  await t.test('studio A cannot attach equipment to studio B\'s room', async () => {
    const before = await prisma.equipment.count({ where: { room_id: roomB.id } });
    const attached = await request('POST', '/facilities/equipment', ownerA, { name: unique('mic'), type: 'Microphone', room_id: roomB.id });
    assert.equal(attached.status, 404, JSON.stringify(attached.body));
    assert.equal(await prisma.equipment.count({ where: { room_id: roomB.id } }), before, 'nothing attached');

    const own = await request('POST', '/facilities/equipment', ownerA, { name: unique('mic'), type: 'Microphone', room_id: roomA.id });
    assert.equal(own.status, 201, JSON.stringify(own.body));
    assert.equal(own.body.studio_id, studioA.id);
    const loose = await request('POST', '/facilities/equipment', ownerA, { name: unique('cable'), type: 'Cable' });
    assert.equal(loose.status, 201, 'equipment without a room is still allowed');
  });

  await t.test('studio A cannot file issues against studio B\'s rooms, equipment or bookings', async () => {
    const starts_at = new Date(Date.now() + 90 * 86_400_000);
    const bookingB = await prisma.booking.create({ data: {
      studio_id: studioB.id, artist_id: artist.id, room_id: roomB.id, service_id: serviceB.id,
      starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50,
    } });
    const issuesInB = () => prisma.maintenanceIssue.count({ where: { studio_id: studioB.id } });
    const issuesNamingB = () => prisma.maintenanceIssue.count({ where: { OR: [{ room_id: roomB.id }, { equipment_id: equipmentB.id }] } });
    const before = [await issuesInB(), await issuesNamingB()];

    const attempts: Array<[string, Record<string, unknown>, number]> = [
      ['B room', { room_id: roomB.id }, 404],
      ['B equipment', { equipment_id: equipmentB.id }, 404],
      ['B booking', { booking_id: bookingB.id }, 403],
      ['A room with B equipment', { room_id: roomA.id, equipment_id: equipmentB.id }, 404],
    ];
    for (const [label, target, expected] of attempts) {
      const filed = await request('POST', '/facilities/issues', ownerA, { ...target, symptom: 'Hum', severity: 'CRITICAL' });
      assert.equal(filed.status, expected, `${label}: ${JSON.stringify(filed.body)}`);
    }
    assert.deepEqual([await issuesInB(), await issuesNamingB()], before, 'no issue reached studio B');
    assert.equal(await prisma.notification.count({ where: { user_id: ownerB.id, type: 'FACILITY_ISSUE_REPORTED' } }), 0, 'studio B was not paged');

    // The artist on studio B's booking cannot point it at studio A's room either.
    const crossed = await request('POST', '/facilities/issues', artistUser, { booking_id: bookingB.id, room_id: roomA.id, symptom: 'Hum', severity: 'MINOR' });
    assert.equal(crossed.status, 404, JSON.stringify(crossed.body));

    // Each studio still reports its own.
    const own = await request('POST', '/facilities/issues', ownerA, { room_id: roomA.id, symptom: 'Hum', severity: 'MINOR' });
    assert.equal(own.status, 201, JSON.stringify(own.body));
    assert.equal(own.body.studio_id, studioA.id);
    const staffOnBooking = await request('POST', '/facilities/issues', ownerB, { booking_id: bookingB.id, symptom: 'Hum', severity: 'MINOR' });
    assert.equal(staffOnBooking.status, 201, JSON.stringify(staffOnBooking.body));
    const artistOnBooking = await request('POST', '/facilities/issues', artistUser, { booking_id: bookingB.id, symptom: 'Buzz', severity: 'MINOR' });
    assert.equal(artistOnBooking.status, 201, JSON.stringify(artistOnBooking.body));
    assert.equal(artistOnBooking.body.room_id, roomB.id);
  });

  await t.test('studio A cannot assign its issue to someone outside its staff', async () => {
    const issue = await prisma.maintenanceIssue.create({
      data: { studio_id: studioA.id, room_id: roomA.id, reported_by: ownerA.id, symptom: 'Dead channel', severity: 'MINOR' },
    });
    const outsider = await request('PATCH', `/facilities/issues/${issue.id}`, ownerA, { status: 'ASSIGNED', assigned_to: ownerB.id });
    assert.equal(outsider.status, 400, JSON.stringify(outsider.body));
    const stored = await prisma.maintenanceIssue.findUniqueOrThrow({ where: { id: issue.id } });
    assert.equal(stored.status, 'REPORTED');
    assert.equal(stored.assigned_to, null);

    const self = await request('PATCH', `/facilities/issues/${issue.id}`, ownerA, { status: 'ASSIGNED' });
    assert.equal(self.status, 200, JSON.stringify(self.body));
    assert.equal(self.body.assigned_to, ownerA.id);
  });
});
