import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// The first pilot moves no money through OIANO and the wallet is frozen (owner
// decisions, 2026-11-01). A booking takes nothing and is settled at the studio, so an
// artist with an empty wallet can book, and the ledger hears only about cash a studio
// says it took. A Stripe key alone must not switch any payment route on.
test('with the wallet frozen, a booking is settled at the studio', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const saved = { wallet: process.env.WALLET_ENABLED, stripe: process.env.STRIPE_ENABLED, key: process.env.STRIPE_SECRET_KEY };
  // Set, not deleted: app.ts loads apps/api/.env, which fills in anything unset.
  process.env.WALLET_ENABLED = 'false';
  process.env.STRIPE_ENABLED = 'false';
  process.env.STRIPE_SECRET_KEY = 'integration-stripe-key';

  const [{ app }, { prisma }, { studioPayable }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../lib/studioPayout'),
  ]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    process.env.WALLET_ENABLED = saved.wallet;
    process.env.STRIPE_ENABLED = saved.stripe;
    if (saved.key === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = saved.key;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async (path: string, user: { id: string; role: string }, method: string, body?: unknown) => {
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
    try { parsed = JSON.parse(text); } catch { /* a route that does not exist answers in HTML */ }
    return { status: response.status, body: parsed };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  let slot = 0;
  const nextSlot = () => {
    const starts = new Date(Date.now() + (30 + (slot += 1)) * 86_400_000);
    starts.setUTCHours(10, 0, 0, 0);
    return { starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3_600_000).toISOString() };
  };

  const studio = await prisma.studio.create({ data: { slug: unique('pilot'), name: 'Pilot studio', platform_fee_bps: 1000, stripe_account_id: unique('acct') } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const staffUser = await prisma.user.create({ data: { email: `${unique('staff')}@example.test`, role: 'STUDIO_ADMIN', active_studio_id: studio.id } });
  await prisma.studioStaff.create({ data: { user_id: staffUser.id, studio_id: studio.id, role: 'STUDIO_ADMIN', capabilities: ['MANAGE_BOOKINGS', 'VIEW_FINANCE'] } });
  const staff = { id: staffUser.id, role: 'STUDIO_ADMIN' };

  const makeArtist = async (balance: number) => {
    const artist = await prisma.artist.create({
      data: {
        name: unique('artist'),
        wallet: { create: { balance_usd: balance } },
        user: { create: { email: `${unique('artist')}@example.test`, role: 'ARTIST' } },
      },
      include: { wallet: true },
    });
    return { artist, user: { id: artist.user_id!, role: 'ARTIST' } };
  };
  const book = (user: { id: string; role: string }, extra: Record<string, unknown> = {}) => request('/bookings', user, 'POST', {
    studio_id: studio.id, room_id: room.id, service_id: service.id, ...nextSlot(), ...extra,
  });
  const ledgerRows = (bookingId: string) => prisma.financialTransaction.count({ where: { metadata: { path: ['booking_id'], equals: bookingId } } });

  await t.test('an artist with an empty wallet books, and owes the studio', async () => {
    const { user } = await makeArtist(0);
    const booked = await book(user);
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    assert.equal(booked.body.status, 'PENDING');
    assert.equal(booked.body.payment.status, 'UNPAID');
    assert.equal(booked.body.payment.provider, 'cash');
    assert.equal(Number(booked.body.payment.amount_usd), 50);
    assert.equal(await ledgerRows(booked.body.id), 0, 'nothing is posted until money moves');
    assert.equal((await studioPayable(studio.id)).amountUsd, 0, 'an unheld session credits the studio nothing');
  });

  await t.test('a wallet with a balance is left alone', async () => {
    const { artist, user } = await makeArtist(100);
    const booked = await book(user, { repeat_weeks: 2 });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    assert.equal(booked.body.total_created, 2);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: artist.wallet!.id } });
    assert.equal(Number(wallet.balance_usd), 100);
    assert.equal(await prisma.walletTransaction.count({ where: { wallet_id: wallet.id } }), 0);
  });

  await t.test('staff record the cash once, and the ledger hears about it then', async () => {
    const { user } = await makeArtist(0);
    const booked = await book(user);
    const recorded = await request(`/admin/bookings/${booked.body.id}/cash-payment`, staff, 'POST', {});
    assert.equal(recorded.status, 201, JSON.stringify(recorded.body));
    assert.equal(recorded.body.payment.status, 'PAID');
    assert.equal(recorded.body.booking_status, 'CONFIRMED');
    assert.equal(await ledgerRows(booked.body.id), 2, 'the payment and the cash the studio kept');
    assert.equal((await studioPayable(studio.id)).amountUsd, 0, 'the studio already holds the cash');
    assert.equal((await request(`/admin/bookings/${booked.body.id}/cash-payment`, staff, 'POST', {})).status, 409);
  });

  await t.test('a cancelled session leaves nothing owed', async () => {
    const { user } = await makeArtist(0);
    const booked = await book(user);
    const owing = await request('/context', user, 'GET');
    assert.equal(owing.body.money.outstanding_usd, 50, JSON.stringify(owing.body.money));
    const cancelled = await request(`/bookings/${booked.body.id}/status`, staff, 'PATCH', { status: 'CANCELLED' });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    const after = await request('/context', user, 'GET');
    assert.equal(after.body.money.outstanding_usd, 0);
  });

  await t.test('no payment route opens on a Stripe key alone', async () => {
    const { user } = await makeArtist(0);
    const booked = await book(user);
    const topUp = await request('/payments/wallet/top-up', user, 'POST', { amount_usd: 50 });
    assert.equal(topUp.status, 409);
    const checkout = await request('/payments/stripe/checkout-session', user, 'POST', { booking_id: booked.body.id });
    assert.equal(checkout.status, 503);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { booking_id: booked.body.id } })).status, 'UNPAID');

    const payout = await request('/payouts', staff, 'POST', {});
    assert.equal(payout.status, 503);
    assert.equal(await prisma.studioPayout.count({ where: { studio_id: studio.id } }), 0, 'nothing is reserved for a rail that is off');
  });
});
