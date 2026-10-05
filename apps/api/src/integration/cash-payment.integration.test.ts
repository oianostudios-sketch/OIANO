import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

// C26: a walk-in pays cash at the desk, and nothing could record it. PAID was
// written only by the wallet, the Stripe webhook and payouts, so the studio had no
// truthful way to say it had been paid and the ledger never saw the money.
// POST /api/admin/bookings/:id/cash-payment records it, through the ledger.

// Forces the interleaving a race needs instead of hoping for it (the same barrier
// as money-integrity.integration.test.ts). A SHARE lock on the table lets every
// party read but stops its first write there; it is released once every party
// still running is waiting on a lock of any kind.
async function throughBarrier<T>(db: PrismaClient, table: string, start: () => Array<Promise<T>>) {
  let lockTaken!: () => void;
  let release!: () => void;
  const taken = new Promise<void>((resolve) => { lockTaken = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  const holder = db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`LOCK TABLE "${table}" IN SHARE MODE`);
    lockTaken();
    await released;
  }, { maxWait: 10_000, timeout: 60_000 });
  await Promise.race([taken, holder]);

  let held = 0;
  let outcome: Promise<Array<PromiseSettledResult<T>>>;
  try {
    let finished = 0;
    const parties = start().map((party) => party.finally(() => { finished += 1; }));
    outcome = Promise.allSettled(parties);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<Array<{ waiting: number }>>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      held = row.waiting;
      if (held + finished >= parties.length) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    release();
    await holder;
  }
  return { results: await outcome, held };
}

test('a studio records a cash payment once, through the ledger', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ app }, { prisma }, payouts, { reconcileFinancialLedger }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../lib/studioPayout'), import('../lib/financialReconciliation'),
  ]);
  const barrierUrl = new URL(process.env.DATABASE_URL!);
  barrierUrl.searchParams.set('connection_limit', '3');
  const barrierDb = new PrismaClient({ datasources: { db: { url: barrierUrl.toString() } } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await Promise.all([prisma.$disconnect(), barrierDb.$disconnect()]);
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
  const HOUR = 3_600_000;
  let slot = 0;
  const nextSlot = () => {
    const date = new Date(Date.now() + (30 + (slot += 1)) * 86_400_000);
    date.setUTCHours(10, 0, 0, 0);
    return date;
  };

  // 10% so the studio's net and OIANO's fee are both visible in the ledger.
  const makeStudio = async (label: string, platformFeeBps = 1000) => {
    const studio = await prisma.studio.create({ data: { slug: unique(label), name: `Cash ${label}`, platform_fee_bps: platformFeeBps } });
    const room = await prisma.room.create({ data: { studio_id: studio.id, name: `${label} room` } });
    const service = await prisma.serviceOffering.create({ data: {
      studio_id: studio.id, category: 'RECORDING', name: `${label} session`, min_price_usd: 50, max_price_usd: 50, unit: 'hour',
    } });
    return { studio, room, service };
  };
  type TestStudio = Awaited<ReturnType<typeof makeStudio>>;

  const staffAt = async (studioId: string, capabilities: string[], membershipRole: 'STUDIO_ADMIN' | 'ENGINEER' = 'STUDIO_ADMIN') => {
    const user = await prisma.user.create({ data: { email: `${unique('staff')}@example.test`, role: 'STUDIO_ADMIN' } });
    await prisma.studioStaff.create({ data: { user_id: user.id, studio_id: studioId, role: membershipRole, capabilities } });
    return user;
  };

  // A walk-in made the way the desk makes one: a guest and a CONFIRMED booking with
  // an UNPAID cash payment (POST /api/admin/walkin).
  const walkIn = async (at: TestStudio, staff: { id: string; role: string }, hours = 1) => {
    const made = await request('/admin/walkin', staff, 'POST', {
      name: unique('walk-in guest'), room_id: at.room.id, starts_at: nextSlot().toISOString(), duration_minutes: hours * 60,
    });
    assert.equal(made.status, 201, `the walk-in is booked (${JSON.stringify(made.body)})`);
    assert.equal(made.body.payment.status, 'UNPAID');
    return made.body as { id: string; total_usd: string };
  };

  const plainBooking = async (at: TestStudio, status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW', hours = 1) => {
    const artist = await prisma.artist.create({ data: { name: unique('artist'), user: { create: { email: `${unique('artist')}@example.test`, role: 'ARTIST' } } } });
    const startsAt = nextSlot();
    return prisma.booking.create({ data: {
      studio_id: at.studio.id, artist_id: artist.id, room_id: at.room.id, service_id: at.service.id,
      starts_at: startsAt, ends_at: new Date(startsAt.getTime() + hours * HOUR), total_usd: 50 * hours, status,
    } });
  };

  const recordCash = (bookingId: string, staff: { id: string; role: string }, body: unknown = {}) =>
    request(`/admin/bookings/${bookingId}/cash-payment`, staff, 'POST', body);

  // Everything the ledger and the audit log hold about one booking's payment.
  const moneyFor = async (bookingId: string) => {
    const payments = await prisma.payment.findMany({ where: { booking_id: bookingId } });
    const ids = payments.map((payment) => payment.id);
    const transactions = await prisma.financialTransaction.findMany({ where: { source_id: { in: ids } }, include: { entries: true } });
    const audits = (await prisma.adminAuditLog.findMany({ where: { action: 'booking.payment.cash_recorded' } }))
      .filter((entry) => (entry.metadata as any)?.booking_id === bookingId);
    return { payments, transactions, audits };
  };
  const nothingRecorded = async (bookingId: string, message: string) => {
    const { payments, transactions, audits } = await moneyFor(bookingId);
    assert.ok(payments.every((payment) => payment.status !== 'PAID'), `${message}: nothing is paid`);
    assert.equal(transactions.length, 0, `${message}: nothing reaches the ledger`);
    assert.equal(audits.length, 0, `${message}: nothing is audited`);
  };
  const sum = (entries: Array<{ account_code: string; direction: string; amount_usd: unknown }>, account: string, direction: string) =>
    Math.round(entries.filter((e) => e.account_code === account && e.direction === direction).reduce((s, e) => s + Number(e.amount_usd), 0) * 100) / 100;

  await t.test('a walk-in paid in cash is recorded as paid, and the ledger balances with the studio holding the cash', async () => {
    const at = await makeStudio('walk-in-paid');
    const owner = await staffAt(at.studio.id, []); // a legacy owner: STUDIO_ADMIN with no capabilities
    const booking = await walkIn(at, owner, 2);
    assert.equal(Number(booking.total_usd), 100);

    const recorded = await recordCash(booking.id, owner);
    assert.equal(recorded.status, 201, JSON.stringify(recorded.body));
    assert.equal(recorded.body.booking_status, 'CONFIRMED', 'a walk-in was already confirmed, and stays so');

    const { payments, transactions, audits } = await moneyFor(booking.id);
    assert.equal(payments.length, 1, 'the walk-in keeps its one payment row');
    const [payment] = payments;
    assert.equal(payment.status, 'PAID');
    assert.equal(payment.provider, 'cash');
    assert.equal(Number(payment.amount_usd), 100, 'for the booking\'s own total');
    assert.ok(payment.paid_at, 'with the time it was paid');

    const posted = transactions.find((tx) => tx.source_type === 'BOOKING_PAYMENT');
    assert.ok(posted, 'the payment posts as every booking payment does');
    assert.equal(sum(posted!.entries, 'CASH_CLEARING', 'DEBIT'), 100);
    assert.equal(sum(posted!.entries, 'STUDIO_PAYABLE', 'CREDIT'), 90, 'the studio is credited its net');
    assert.equal(sum(posted!.entries, 'PLATFORM_REVENUE', 'CREDIT'), 10, 'and OIANO its fee');
    assert.ok(posted!.entries.filter((e) => e.account_code === 'STUDIO_PAYABLE').every((e) => e.owner_id === at.studio.id));

    const kept = transactions.find((tx) => tx.source_type === 'STUDIO_COLLECTED_CASH');
    assert.ok(kept, 'the cash the studio kept is set against what it is owed');
    assert.equal(sum(kept!.entries, 'STUDIO_PAYABLE', 'DEBIT'), 100);
    assert.equal(sum(kept!.entries, 'CASH_CLEARING', 'CREDIT'), 100);

    for (const tx of transactions) {
      const debit = tx.entries.filter((e) => e.direction === 'DEBIT').reduce((s, e) => s + Number(e.amount_usd), 0);
      const credit = tx.entries.filter((e) => e.direction === 'CREDIT').reduce((s, e) => s + Number(e.amount_usd), 0);
      assert.equal(Math.round(debit * 100), Math.round(credit * 100), `${tx.source_type} balances`);
    }
    const reconciliation = await reconcileFinancialLedger();
    assert.ok(!reconciliation.missing_payment_entries.includes(payment.id), 'reconciliation finds the payment on the ledger');
    assert.ok(!reconciliation.unbalanced_transactions.some((tx) => transactions.some((own) => own.id === tx.id)), 'and finds nothing unbalanced in it');

    assert.equal((await payouts.studioPayable(at.studio.id)).amountUsd, -10, 'the studio holds the cash and owes OIANO its fee');
    await assert.rejects(payouts.reserveStudioPayout({ studioId: at.studio.id, requestedBy: 'integration' }), /Nothing is currently payable/,
      'so a payout never pays the studio the cash it already has');

    assert.equal(audits.length, 1, 'the recording is audited');
    assert.equal(audits[0].actor_id, owner.id);
    assert.equal((audits[0].metadata as any).payment_id, payment.id);
  });

  await t.test('a pending booking paid in cash is confirmed by it', async () => {
    const at = await makeStudio('pending-paid');
    const staff = await staffAt(at.studio.id, ['MANAGE_BOOKINGS']);
    const booking = await plainBooking(at, 'PENDING');
    const recorded = await recordCash(booking.id, staff);
    assert.equal(recorded.status, 201, JSON.stringify(recorded.body));
    assert.equal(recorded.body.booking_status, 'CONFIRMED');
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, 'CONFIRMED');
    const { payments, transactions } = await moneyFor(booking.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].provider, 'cash');
    assert.equal(transactions.filter((tx) => tx.source_type === 'BOOKING_PAYMENT').length, 1);
  });

  await t.test('a second recording is refused and changes nothing', async () => {
    const at = await makeStudio('twice');
    const staff = await staffAt(at.studio.id, ['MANAGE_BOOKINGS']);
    const booking = await walkIn(at, staff);
    assert.equal((await recordCash(booking.id, staff)).status, 201);
    const before = await moneyFor(booking.id);

    const again = await recordCash(booking.id, staff);
    assert.equal(again.status, 409, JSON.stringify(again.body));
    const after = await moneyFor(booking.id);
    assert.equal(after.payments.length, 1);
    assert.equal(after.payments[0].paid_at?.getTime(), before.payments[0].paid_at?.getTime(), 'the payment is untouched');
    assert.equal(after.transactions.length, before.transactions.length, 'nothing new reaches the ledger');
    assert.equal(after.audits.length, 1, 'and nothing new is audited');
  });

  for (const kind of ['walk-in', 'booking with no payment row'] as const) {
    await t.test(`two recordings at the same moment pay a ${kind} once`, async () => {
      const at = await makeStudio(`race-${kind.replace(/\W+/g, '-')}`);
      const staff = await staffAt(at.studio.id, ['MANAGE_BOOKINGS']);
      const second = await staffAt(at.studio.id, []);
      const bookingId = kind === 'walk-in' ? (await walkIn(at, staff)).id : (await plainBooking(at, 'CONFIRMED')).id;

      const { results, held } = await throughBarrier(barrierDb, 'payments', () => [staff, second].map((who) => recordCash(bookingId, who)));
      assert.equal(held, 2, 'both recordings were under way before either wrote');
      const statuses = results.map((result) => (result.status === 'fulfilled' ? String(result.value.status) : 'threw')).sort();
      assert.deepEqual(statuses, ['201', '409']);

      const { payments, transactions, audits } = await moneyFor(bookingId);
      assert.equal(payments.length, 1, 'one payment');
      assert.equal(payments[0].status, 'PAID');
      assert.equal(transactions.filter((tx) => tx.source_type === 'BOOKING_PAYMENT').length, 1, 'one ledger posting of the payment');
      assert.equal(transactions.filter((tx) => tx.source_type === 'STUDIO_COLLECTED_CASH').length, 1, 'and one of the cash kept');
      assert.equal(audits.length, 1, 'one audit entry');
      assert.equal((await payouts.studioPayable(at.studio.id)).amountUsd, -5, 'the payable moved once');
    });
  }

  await t.test('a cancelled or no-show booking is refused', async () => {
    const at = await makeStudio('closed');
    const staff = await staffAt(at.studio.id, ['MANAGE_BOOKINGS']);
    for (const status of ['CANCELLED', 'NO_SHOW'] as const) {
      const booking = await plainBooking(at, status);
      const refused = await recordCash(booking.id, staff);
      assert.equal(refused.status, 409, `${status}: ${JSON.stringify(refused.body)}`);
      await nothingRecorded(booking.id, status);
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, status, 'and the booking stays closed');
    }
    const walkInBooking = await walkIn(at, staff);
    assert.equal((await request(`/bookings/${walkInBooking.id}/status`, staff, 'PATCH', { status: 'CANCELLED' })).status, 200);
    assert.equal((await recordCash(walkInBooking.id, staff)).status, 409, 'a cancelled walk-in too');
    await nothingRecorded(walkInBooking.id, 'cancelled walk-in');
  });

  await t.test('another studio\'s booking is not found', async () => {
    const mine = await makeStudio('mine');
    const theirs = await makeStudio('theirs');
    const theirStaff = await staffAt(theirs.studio.id, ['MANAGE_BOOKINGS']);
    const myStaff = await staffAt(mine.studio.id, []);
    const booking = await walkIn(mine, myStaff);

    const refused = await recordCash(booking.id, theirStaff);
    assert.equal(refused.status, 404, JSON.stringify(refused.body));
    await nothingRecorded(booking.id, 'another studio');
    assert.equal((await payouts.studioPayable(theirs.studio.id)).amountUsd, 0);
  });

  await t.test('staff without booking management cannot record a payment', async () => {
    const at = await makeStudio('unpermitted');
    const owner = await staffAt(at.studio.id, []);
    const booking = await walkIn(at, owner);
    const viewer = await staffAt(at.studio.id, ['VIEW_FINANCE', 'MANAGE_CALENDAR']);
    const engineer = await staffAt(at.studio.id, [], 'ENGINEER');
    for (const [who, label] of [[viewer, 'finance viewer'], [engineer, 'engineer membership with no capabilities']] as const) {
      const refused = await recordCash(booking.id, who);
      assert.equal(refused.status, 403, `${label}: ${JSON.stringify(refused.body)}`);
    }
    await nothingRecorded(booking.id, 'no permission');
  });

  await t.test('the amount is never the caller\'s', async () => {
    const at = await makeStudio('amount');
    const staff = await staffAt(at.studio.id, ['MANAGE_BOOKINGS']);
    const booking = await walkIn(at, staff);
    for (const body of [{ amount_usd: 1 }, { amount_usd: 1000, provider: 'stripe' }]) {
      const refused = await recordCash(booking.id, staff, body);
      assert.equal(refused.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(refused.body)}`);
    }
    await nothingRecorded(booking.id, 'amount supplied');

    assert.equal((await recordCash(booking.id, staff)).status, 201);
    const { payments, transactions } = await moneyFor(booking.id);
    assert.equal(Number(payments[0].amount_usd), 50, 'the booking total is what is paid');
    assert.equal(sum(transactions.find((tx) => tx.source_type === 'BOOKING_PAYMENT')!.entries, 'CASH_CLEARING', 'DEBIT'), 50);
  });

  await t.test('a booking with a card checkout under way is not recorded as cash', async () => {
    const at = await makeStudio('checkout');
    const staff = await staffAt(at.studio.id, ['MANAGE_BOOKINGS']);
    const booking = await plainBooking(at, 'PENDING');
    await prisma.payment.create({ data: { booking_id: booking.id, provider: 'stripe', provider_ref: unique('cs_test'), amount_usd: 50, status: 'PROCESSING' } });
    const refused = await recordCash(booking.id, staff);
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    await nothingRecorded(booking.id, 'checkout under way');
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { booking_id: booking.id } })).status, 'PROCESSING');
  });
});
