import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const secret = 'integration-refund-webhook-secret';
process.env.STRIPE_WEBHOOK_SECRET = secret;
process.env.STRIPE_SECRET_KEY = 'integration-stripe-key';

test('concurrent cumulative refunds keep payment and ledger in step', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(process.env.NODE_ENV, 'test');
  assert.match(database.pathname, /(^|[/_-])test([/_-]|$)/i);
  const [{ app }, { prisma }, { recordBookingPayment }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../lib/financialLedger'),
  ]);
  const barrierDb = new PrismaClient({ datasources: { db: { url: database.toString() } } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await Promise.all([prisma.$disconnect(), barrierDb.$disconnect()]);
  });
  const stripe = new Stripe('integration-stripe-key');
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const studio = await prisma.studio.create({ data: { name: 'Refund concurrency', slug: `refund-${runId}`, platform_fee_bps: 1000 } });
  const artist = await prisma.artist.create({ data: { name: 'Refund artist', user: { create: { email: 'refund-' + runId + '@example.test', role: 'ARTIST' } } } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Refund room' } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: studio.id, category: 'RECORDING', name: 'Refund session', min_price_usd: 50, max_price_usd: 50, unit: 'hour' } });

  let slot = 0;
  for (const amounts of [[2000, 5000], [5000, 2000], [2000, 2000]]) {
    await t.test(`concurrent ${amounts.join(' then ')} cents, replay and stale delivery`, async () => {
      const label = `${runId}-${amounts.join('-')}`;
      const intent = `intent-${label}`;
      const charge = `charge-${label}`;
      slot += 1;
      const booking = await prisma.booking.create({ data: {
        studio_id: studio.id, artist_id: artist.id, room_id: room.id, service_id: service.id,
        starts_at: new Date(Date.UTC(2035, 0, slot, 10)), ends_at: new Date(Date.UTC(2035, 0, slot, 11)), total_usd: 50, status: 'CONFIRMED',
      } });
      const payment = await prisma.$transaction(async tx => {
        const payment = await tx.payment.create({ data: { booking_id: booking.id, provider: 'stripe', payment_intent_id: intent, amount_usd: 50, status: 'PAID' } });
        await recordBookingPayment(tx, { paymentId: payment.id, provider: 'stripe', amountUsd: 50, platformFeeBps: 1000, artistId: artist.id, studioId: studio.id, bookingId: booking.id });
        return payment;
      });
      const send = async (amount: number, suffix: string) => {
        const payload = JSON.stringify({ id: `event-${label}-${suffix}`, type: 'charge.refunded', data: { object: { id: charge, payment_intent: intent, amount_refunded: amount } } });
        const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks/stripe`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret }) }, body: payload,
        });
        return { status: response.status, body: await response.json() as { duplicate?: boolean } };
      };
      // SHARE permits reads but blocks updates. Start the first event and
      // observe it waiting before starting the next; neither can commit early.
      // A row-locking fix may instead queue the second request on the first row lock.
      let taken!: () => void;
      let release!: () => void;
      const ready = new Promise<void>(resolve => { taken = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      const holder = barrierDb.$transaction(async tx => {
        await tx.$executeRaw`LOCK TABLE payments IN SHARE MODE`;
        taken();
        await released;
      }, { timeout: 30_000 });
      const requests: Array<ReturnType<typeof send>> = [];
      let results: Awaited<ReturnType<typeof send>>[] = [];
      try {
        await Promise.race([ready, holder]);
        for (const [index, amount] of amounts.entries()) {
          requests.push(send(amount, String(index)));
          const deadline = Date.now() + 3000;
          let waiting = 0;
          do {
            const [row] = await barrierDb.$queryRaw<Array<{ waiting: number }>>`
              SELECT count(*)::int AS waiting FROM pg_stat_activity
              WHERE datname = current_database() AND wait_event_type = 'Lock'`;
            waiting = row.waiting;
            if (waiting >= index + 1) break;
            await new Promise(resolve => setTimeout(resolve, 10));
          } while (Date.now() < deadline);
          assert.equal(waiting, index + 1, 'each request reaches the database barrier');
        }
      } finally {
        release();
        await holder;
        results = await Promise.all(requests);
      }
      assert.deepEqual(results.map(result => result.status), [200, 200]);
      const expected = Math.max(...amounts) / 100;
      const check = async () => {
        const current = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
        assert.equal(Number(current.refunded_usd), expected, 'largest acknowledged cumulative refund is recorded');
        assert.equal(current.status, expected === 50 ? 'REFUNDED' : 'PARTIALLY_REFUNDED');
        const postings = await prisma.financialTransaction.findMany({ where: { source_type: 'BOOKING_REFUND', source_id: { startsWith: `${payment.id}:` } }, include: { entries: true } });
        const totals = new Map<string, number>();
        for (const posting of postings) {
          let balance = 0;
          for (const line of posting.entries) {
            const cents = Math.round(Number(line.amount_usd) * 100);
            balance += line.direction === 'DEBIT' ? cents : -cents;
            totals.set(line.account_code, (totals.get(line.account_code) ?? 0) + cents);
            assert.equal(line.direction, line.account_code === 'CASH_CLEARING' ? 'CREDIT' : 'DEBIT');
          }
          assert.equal(balance, 0, 'each posting balances');
        }
        assert.equal(totals.get('CASH_CLEARING'), expected * 100);
        assert.equal(totals.get('STUDIO_PAYABLE'), expected * 90);
        assert.equal(totals.get('PLATFORM_REVENUE'), expected * 10);
        return postings.length;
      };
      const count = await check();
      assert.equal(await prisma.stripeWebhookEvent.count({ where: { id: { in: [0, 1].map(i => `event-${label}-${i}`) }, status: 'COMPLETED' } }), 2);
      assert.equal((await send(amounts[1], '1')).body.duplicate, true);
      assert.equal((await send(Math.max(...amounts), 'new-equal')).status, 200);
      assert.equal((await send(1000, 'stale')).status, 200);
      assert.equal(await check(), count, 'replay, equal and stale events add no postings');
    });
  }
});
