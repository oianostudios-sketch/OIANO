import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// C34: walk-ins and payouts asked only for the account role, so a receptionist whose
// membership grants MANAGE_BOOKINGS alone could request the studio's payout or start its
// payout onboarding, and a member with VIEW_FINANCE alone could book walk-ins. Each now
// asks the caller's membership of the studio for the capability that names it
// (lib/staffPermission.ts), with a STUDIO_ADMIN membership that has no capabilities at
// all (the legacy owner) still allowed everything.

test('sensitive operator actions need the membership capability, not only the role', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  // Payout onboarding reaches Stripe once it is past the gate. With no key it answers
  // 503, which is how a test tells "allowed" from "refused" without a network call.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = '';

  const [{ app }, { prisma }] = await Promise.all([import('../app'), import('../lib/prisma')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    if (stripeKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = stripeKey;
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
  let slot = 0;
  const nextSlot = () => {
    const date = new Date(Date.now() + (40 + (slot += 1)) * 86_400_000);
    date.setUTCHours(10, 0, 0, 0);
    return date;
  };

  const makeStudio = async (label: string) => {
    const studio = await prisma.studio.create({ data: { slug: unique(label), name: `Gates ${label}` } });
    const room = await prisma.room.create({ data: { studio_id: studio.id, name: `${label} room` } });
    await prisma.serviceOffering.create({ data: {
      studio_id: studio.id, category: 'RECORDING', name: `${label} session`, min_price_usd: 50, max_price_usd: 50, unit: 'hour',
    } });
    return { studio, room };
  };
  const at = await makeStudio('home');
  const elsewhere = await makeStudio('elsewhere');

  // Every caller holds the STUDIO_ADMIN account role, which is all the routes asked for.
  const staffAt = async (studioId: string, capabilities: string[], membershipRole: 'STUDIO_ADMIN' | 'ENGINEER' = 'STUDIO_ADMIN') => {
    const user = await prisma.user.create({ data: { email: `${unique('staff')}@example.test`, role: 'STUDIO_ADMIN', active_studio_id: studioId } });
    await prisma.studioStaff.create({ data: { user_id: user.id, studio_id: studioId, role: membershipRole, capabilities } });
    return user;
  };

  const legacyOwner = await staffAt(at.studio.id, []);
  const reception = await staffAt(at.studio.id, ['VIEW_CALENDAR', 'MANAGE_CALENDAR', 'MANAGE_BOOKINGS']);
  const finance = await staffAt(at.studio.id, ['VIEW_FINANCE']);
  const engineer = await staffAt(at.studio.id, [], 'ENGINEER');
  // VIEW_FINANCE at another studio does not carry over to the studio the request acts on.
  const financeElsewhere = await staffAt(at.studio.id, ['MANAGE_BOOKINGS']);
  await prisma.studioStaff.create({ data: { user_id: financeElsewhere.id, studio_id: elsewhere.studio.id, role: 'STUDIO_ADMIN', capabilities: ['VIEW_FINANCE'] } });

  const walkIn = (user: { id: string; role: string }) => request('POST', '/admin/walkin', user, {
    name: unique('guest'), room_id: at.room.id, starts_at: nextSlot().toISOString(), duration_minutes: 60,
  });
  const bookingCount = () => prisma.booking.count({ where: { studio_id: at.studio.id } });
  const payoutCount = () => prisma.studioPayout.count({ where: { studio_id: at.studio.id } });

  await t.test('a walk-in needs MANAGE_BOOKINGS', async () => {
    const withCapability = await walkIn(reception);
    assert.equal(withCapability.status, 201, JSON.stringify(withCapability.body));
    const byOwner = await walkIn(legacyOwner);
    assert.equal(byOwner.status, 201, JSON.stringify(byOwner.body));

    const before = await bookingCount();
    for (const [label, user] of [['VIEW_FINANCE only', finance], ['an ENGINEER membership', engineer]] as const) {
      const refused = await walkIn(user);
      assert.equal(refused.status, 403, `${label}: ${JSON.stringify(refused.body)}`);
      assert.equal(refused.body.error, 'Booking management permission required');
    }
    assert.equal(await bookingCount(), before, 'a refused walk-in books nothing');
  });

  await t.test('a payout request needs VIEW_FINANCE', async () => {
    // Past the gate the studio has no payout account, so an allowed caller gets 409.
    for (const [label, user] of [['VIEW_FINANCE', finance], ['the legacy owner', legacyOwner]] as const) {
      const allowed = await request('POST', '/payouts', user);
      assert.equal(allowed.status, 409, `${label}: ${JSON.stringify(allowed.body)}`);
      assert.match(allowed.body.error, /Connect a payout account/);
    }
    for (const [label, user] of [['MANAGE_BOOKINGS only', reception], ['an ENGINEER membership', engineer], ['VIEW_FINANCE at another studio', financeElsewhere]] as const) {
      const refused = await request('POST', '/payouts', user);
      assert.equal(refused.status, 403, `${label}: ${JSON.stringify(refused.body)}`);
      assert.equal(refused.body.error, 'Finance permission required');
    }
    assert.equal(await payoutCount(), 0);
  });

  await t.test('payout onboarding needs VIEW_FINANCE', async () => {
    for (const [label, user] of [['VIEW_FINANCE', finance], ['the legacy owner', legacyOwner]] as const) {
      const allowed = await request('POST', '/payouts/connect', user);
      assert.equal(allowed.status, 503, `${label} reaches Stripe: ${JSON.stringify(allowed.body)}`);
    }
    for (const [label, user] of [['MANAGE_BOOKINGS only', reception], ['an ENGINEER membership', engineer]] as const) {
      const refused = await request('POST', '/payouts/connect', user);
      assert.equal(refused.status, 403, `${label}: ${JSON.stringify(refused.body)}`);
    }
    const studio = await prisma.studio.findUniqueOrThrow({ where: { id: at.studio.id } });
    assert.equal(studio.stripe_account_id, null);
  });

  await t.test('the payout balance and history need VIEW_FINANCE', async () => {
    for (const path of ['/payouts/balance', '/payouts']) {
      for (const [label, user] of [['VIEW_FINANCE', finance], ['the legacy owner', legacyOwner]] as const) {
        const allowed = await request('GET', path, user);
        assert.equal(allowed.status, 200, `${path} ${label}: ${JSON.stringify(allowed.body)}`);
      }
      for (const [label, user] of [['MANAGE_BOOKINGS only', reception], ['an ENGINEER membership', engineer]] as const) {
        const refused = await request('GET', path, user);
        assert.equal(refused.status, 403, `${path} ${label}: ${JSON.stringify(refused.body)}`);
      }
    }
  });
});
