import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

// Money that moved without the ledger agreeing, found by the architecture audit of
// 682d052 and held here against a real database: a studio putting money in an
// artist's wallet, a paid booking changing length without changing price, and two
// payouts reserving the same balance.

// Forces the interleaving a race needs instead of hoping for it. A SHARE lock on the
// table lets every party read but stops its first write there, so each has read
// before any has written. The lock is released once every party still running is
// waiting on a lock of any kind, because a fix may queue a party on a row instead.
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

test('wallet credit, reschedules and payouts keep money and the ledger in step', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ app }, { prisma }, payouts, { postFinancialTransaction, recordWalletTopUp }, { applyWalletDelta }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../lib/studioPayout'), import('../lib/financialLedger'),
    import('../lib/walletLedger'),
  ]);
  // The barrier holds its lock on a client of its own, so it never waits on the pool
  // the code under test is using.
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
  const money = (value: number) => Math.round(value * 100) / 100;
  const HOUR = 3_600_000;
  // Far enough ahead that no reschedule lands in the past, and on the hour, so lengths are exact.
  const slotStart = (daysAhead: number, hour: number, minute = 0) => {
    const date = new Date(Date.now() + daysAhead * 86_400_000);
    date.setUTCHours(hour, minute, 0, 0);
    return date;
  };

  const makeStudio = async (label: string, platformFeeBps = 0) => {
    const studio = await prisma.studio.create({ data: { slug: unique(label), name: `Money ${label}`, platform_fee_bps: platformFeeBps } });
    const room = await prisma.room.create({ data: { studio_id: studio.id, name: `${label} room` } });
    const service = await prisma.serviceOffering.create({ data: {
      studio_id: studio.id, category: 'RECORDING', name: `${label} session`, min_price_usd: 50, max_price_usd: 50, unit: 'hour',
    } });
    return { studio, room, service };
  };
  type TestStudio = Awaited<ReturnType<typeof makeStudio>>;

  const adminAt = async (studioId: string, capabilities: string[]) => {
    const user = await prisma.user.create({ data: { email: `${unique('admin')}@example.test`, role: 'STUDIO_ADMIN' } });
    await prisma.studioStaff.create({ data: { user_id: user.id, studio_id: studioId, role: 'STUDIO_ADMIN', capabilities } });
    return user;
  };

  // A wallet funded the way a paid Stripe top-up funds it: the same wallet movement and
  // the same ledger posting as the webhook (routes/webhooks.routes.ts).
  const artistWithWallet = async (label: string, topUpUsd = 0) => {
    const user = await prisma.user.create({
      data: { email: `${unique(label)}@example.test`, role: 'ARTIST', artist: { create: { name: label, wallet: { create: { balance_usd: 0 } } } } },
      include: { artist: { include: { wallet: true } } },
    });
    const wallet = user.artist!.wallet!;
    if (topUpUsd > 0) {
      await prisma.$transaction(async (tx) => {
        const topUp = await tx.walletTopUp.create({ data: { wallet_id: wallet.id, amount_usd: topUpUsd, status: 'PAID', provider_ref: unique('checkout') } });
        await applyWalletDelta(tx, wallet.id, topUpUsd, 'credit', 'Integration top-up');
        await recordWalletTopUp(tx, { topUpId: topUp.id, walletId: wallet.id, amountUsd: topUpUsd });
      });
    }
    return { user, artist: user.artist!, wallet };
  };

  const bookingFor = (artistId: string, at: TestStudio, startsAt: Date, hours = 1) => prisma.booking.create({ data: {
    studio_id: at.studio.id, artist_id: artistId, room_id: at.room.id, service_id: at.service.id,
    starts_at: startsAt, ends_at: new Date(startsAt.getTime() + hours * HOUR), total_usd: 50 * hours, status: 'CONFIRMED',
  } });

  const walletUsd = async (artistId: string) =>
    Number((await prisma.wallet.findUnique({ where: { artist_id: artistId } }))?.balance_usd ?? 0);
  // What the ledger says an artist's wallet holds. Top-ups credit WALLET_LIABILITY under
  // the wallet and wallet-paid bookings debit it under the artist (lib/financialLedger.ts),
  // so both owners are read.
  const ledgerWalletUsd = async (artistId: string) => {
    const wallet = await prisma.wallet.findUnique({ where: { artist_id: artistId } });
    const entries = await prisma.financialLedgerEntry.findMany({
      where: {
        account_code: 'WALLET_LIABILITY',
        OR: [{ owner_type: 'ARTIST', owner_id: artistId }, ...(wallet ? [{ owner_type: 'WALLET', owner_id: wallet.id }] : [])],
      },
    });
    return money(entries.reduce((sum, entry) => sum + (entry.direction === 'CREDIT' ? 1 : -1) * Number(entry.amount_usd), 0));
  };

  // ── Wallet credit ─────────────────────────────────────────────────────────
  // A wallet belongs to the artist and is spent at any studio, so money one studio
  // puts in it becomes what OIANO owes another. POST /api/admin/wallet/credit wrote
  // that money with no ledger posting, for any studio admin, and it is gone (owner
  // decision, 2026-09-15): only a paid top-up funds a wallet.
  const MANAGER = ['MANAGE_BOOKINGS', 'MANAGE_CALENDAR', 'MANAGE_STAFF', 'MANAGE_POLICIES', 'VIEW_FINANCE'];

  await t.test('no studio admin can put money in an artist\'s wallet', async () => {
    const issuing = await makeStudio('issuing-admin');
    const { artist } = await artistWithWallet('uncredited-artist');
    await bookingFor(artist.id, issuing, slotStart(40, 10));

    for (const capabilities of [['MANAGE_BOOKINGS', 'MANAGE_CALENDAR'], MANAGER]) {
      const admin = await adminAt(issuing.studio.id, capabilities);
      const credit = await request('/admin/wallet/credit', admin, 'POST', { artist_id: artist.id, amount_usd: 100 });
      assert.equal(credit.status, 404, `there is no studio credit to give, even with ${capabilities.join(', ')}`);
    }
    assert.equal(await walletUsd(artist.id), 0, 'the wallet is untouched');
    assert.equal(await prisma.walletTransaction.count({ where: { wallet: { artist_id: artist.id } } }), 0, 'and records no movement');
  });

  await t.test('credit one studio issues is never owed to another studio', async () => {
    const issuing = await makeStudio('issuing');
    const elsewhere = await makeStudio('elsewhere', 1000);
    const manager = await adminAt(issuing.studio.id, MANAGER);
    const { user, artist } = await artistWithWallet('credited-artist');
    await bookingFor(artist.id, issuing, slotStart(41, 10));

    const credit = await request('/admin/wallet/credit', manager, 'POST', { artist_id: artist.id, amount_usd: 100 });
    assert.equal(credit.status, 404, 'there is no studio credit to give');
    const startsAt = slotStart(42, 10);
    const booking = await request('/bookings', user, 'POST', {
      studio_id: elsewhere.studio.id, room_id: elsewhere.room.id, service_id: elsewhere.service.id,
      starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + HOUR).toISOString(),
    });

    assert.equal(booking.status, 402, 'the wallet holds nothing a studio put in it');
    const paidElsewhere = await prisma.payment.count({ where: { status: 'PAID', booking: { studio_id: elsewhere.studio.id } } });
    assert.equal(paidElsewhere, 0, `no session elsewhere is paid for with it (booking answered ${booking.status})`);
    assert.equal((await payouts.studioPayable(elsewhere.studio.id)).amountUsd, 0, 'so nothing is owed to a studio nobody paid');
  });

  await t.test('every dollar a wallet holds is on the ledger', async () => {
    const issuing = await makeStudio('ledgered');
    const manager = await adminAt(issuing.studio.id, MANAGER);
    const { artist } = await artistWithWallet('ledgered-artist', 30);
    await bookingFor(artist.id, issuing, slotStart(43, 10));
    assert.equal(await ledgerWalletUsd(artist.id), 30, 'a top-up is on the ledger before anything else happens');

    const credit = await request('/admin/wallet/credit', manager, 'POST', { artist_id: artist.id, amount_usd: 100 });
    assert.equal(await walletUsd(artist.id), await ledgerWalletUsd(artist.id), `after a credit answered ${credit.status}, the wallet and the ledger agree`);
  });

  // ── Reschedule ────────────────────────────────────────────────────────────
  await t.test('a reschedule moves a paid booking and keeps its length, so its price, payment and ledger still hold', async () => {
    const at = await makeStudio('reschedule-price');
    const { user, artist } = await artistWithWallet('rescheduling-artist', 400);
    const startsAt = slotStart(50, 10);
    const created = await request('/bookings', user, 'POST', {
      studio_id: at.studio.id, room_id: at.room.id, service_id: at.service.id,
      starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + HOUR).toISOString(),
    });
    assert.equal(created.status, 201);
    const reschedule = (from: Date, hours: number) => request(`/bookings/${created.body.id}/reschedule`, user, 'PATCH', {
      starts_at: from.toISOString(), ends_at: new Date(from.getTime() + hours * HOUR).toISOString(),
    });

    const movedTo = slotStart(51, 9);
    assert.equal((await reschedule(movedTo, 1)).status, 200, 'a move that keeps the length is made');
    for (const hours of [8, 0.5]) {
      assert.equal((await reschedule(slotStart(52, 9), hours)).status, 409, `a move to ${hours}h is refused`);
    }

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.body.id }, include: { payment: true } });
    assert.equal(booking.starts_at.getTime(), movedTo.getTime(), 'the booking is where the allowed move put it');
    const price = Number(booking.total_usd);
    assert.equal(price, ((booking.ends_at.getTime() - booking.starts_at.getTime()) / HOUR) * 50, 'the price follows the booked length');
    assert.equal(Number(booking.payment!.amount_usd), price, 'the payment is for that price');
    assert.equal(money(400 - await walletUsd(artist.id)), price, 'the wallet paid that price, once');
    assert.equal(await walletUsd(artist.id), await ledgerWalletUsd(artist.id), 'the ledger agrees with the wallet');
    assert.equal((await payouts.studioPayable(at.studio.id)).amountUsd, price, 'the studio is owed that price');
  });

  await t.test('a reschedule onto a booked room is refused, however the times overlap', async () => {
    const at = await makeStudio('reschedule-enclose');
    const mover = await artistWithWallet('mover');
    const holder = await artistWithWallet('holder');
    const moving = await bookingFor(mover.artist.id, at, slotStart(60, 10));
    await bookingFor(holder.artist.id, at, slotStart(60, 11, 15), 0.5);

    // 11:00–12:00 surrounds the 11:15–11:45 session, so neither of its edges falls
    // inside that session: the overlap the conflict check does not look for.
    const target = slotStart(60, 11);
    const moved = await request(`/bookings/${moving.id}/reschedule`, mover.user, 'PATCH', {
      starts_at: target.toISOString(), ends_at: new Date(target.getTime() + HOUR).toISOString(),
    });
    assert.equal(moved.status, 409, `a taken slot is refused as a conflict, not answered ${moved.status}`);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: moving.id } });
    assert.equal(after.starts_at.getTime(), moving.starts_at.getTime(), 'and the booking stays where it was');
  });

  await t.test('of two reschedules into one free slot, one moves and the other is told the slot is taken', async () => {
    const at = await makeStudio('reschedule-race');
    const first = await artistWithWallet('race-first');
    const second = await artistWithWallet('race-second');
    const moves = [
      { owner: first.user, booking: await bookingFor(first.artist.id, at, slotStart(70, 10)) },
      { owner: second.user, booking: await bookingFor(second.artist.id, at, slotStart(71, 10)) },
    ];
    const target = slotStart(72, 10);

    const { results, held } = await throughBarrier(barrierDb, 'bookings', () => moves.map(({ owner, booking }) =>
      request(`/bookings/${booking.id}/reschedule`, owner, 'PATCH', {
        starts_at: target.toISOString(), ends_at: new Date(target.getTime() + HOUR).toISOString(),
      })));
    assert.equal(held, 2, 'both reschedules had checked the slot before either moved');
    const statuses = results.map((result) => (result.status === 'fulfilled' ? String(result.value.status) : 'threw')).sort();
    assert.deepEqual(statuses, ['200', '409']);
    assert.equal(await prisma.booking.count({ where: { room_id: at.room.id, starts_at: target } }), 1, 'the slot holds one booking');
  });

  // ── Payouts ───────────────────────────────────────────────────────────────
  const studioOwed = async (label: string, amountUsd: number) => {
    const studio = await prisma.studio.create({ data: { slug: unique(label), name: `Payout ${label}` } });
    await postFinancialTransaction(prisma, {
      source_type: 'INTEGRATION_PAYABLE', source_id: unique(studio.id), description: 'Integration payable', lines: [
        { account_code: 'CASH_CLEARING', direction: 'DEBIT', amount_usd: amountUsd },
        { account_code: 'STUDIO_PAYABLE', direction: 'CREDIT', amount_usd: amountUsd, owner_type: 'STUDIO', owner_id: studio.id },
      ],
    });
    return studio;
  };

  await t.test('two payout requests at the same moment reserve the balance once', async () => {
    const studio = await studioOwed('payout-race', 100);

    const { results, held } = await throughBarrier(barrierDb, 'studio_payouts', () => [1, 2].map(() =>
      payouts.reserveStudioPayout({ studioId: studio.id, requestedBy: 'integration' })));
    assert.equal(held, 2, 'both requests were under way before either reserved anything');
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, 'one payout is reserved');
    const refusal = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.match(String(refusal?.reason?.message), /Nothing is currently payable/);
    assert.equal(await prisma.studioPayout.count({ where: { studio_id: studio.id } }), 1);
    assert.equal((await payouts.studioPayable(studio.id)).amountUsd, 0, 'what was owed is reserved once, not twice');
  });

  await t.test('a payout the rail refused cannot afterwards be marked paid', async () => {
    const studio = await studioOwed('payout-refused', 60);
    const { payout } = await payouts.reserveStudioPayout({ studioId: studio.id, requestedBy: 'integration' });
    await payouts.releaseFailedPayout(payout.id, 'Integration: the rail refused');

    await assert.rejects(payouts.markPayoutPaid(payout.id, 'integration-transfer-late'), (error: any) => error.statusCode === 409, 'a released payout is not paid');
    const after = await prisma.studioPayout.findUniqueOrThrow({ where: { id: payout.id } });
    assert.equal(after.status, 'FAILED');
    assert.equal(after.stripe_transfer_id, null);
    assert.equal((await payouts.studioPayable(studio.id)).amountUsd, 60, 'and the studio is still owed what it was');
  });

  await t.test('a paid payout keeps the transfer that paid it', async () => {
    const studio = await studioOwed('payout-paid', 75);
    const { payout } = await payouts.reserveStudioPayout({ studioId: studio.id, requestedBy: 'integration' });
    const paid = await payouts.transferReservedPayout(payout.id, async () => ({ id: 'integration-transfer-first' }));
    assert.equal(paid.status, 'PAID');

    const repeated = await payouts.markPayoutPaid(payout.id, 'integration-transfer-first');
    assert.equal(repeated.updated_at.getTime(), paid.updated_at.getTime(), 'the same transfer recorded again changes nothing');
    await assert.rejects(payouts.markPayoutPaid(payout.id, 'integration-transfer-second'), (error: any) => error.statusCode === 409);
    const after = await prisma.studioPayout.findUniqueOrThrow({ where: { id: payout.id } });
    assert.equal(after.status, 'PAID');
    assert.equal(after.stripe_transfer_id, 'integration-transfer-first', 'a second transfer does not replace the first');
  });

  await t.test('a transfer the rail refuses returns its balance to the payable', async () => {
    const studio = await studioOwed('payout-declined', 40);
    const { payout } = await payouts.reserveStudioPayout({ studioId: studio.id, requestedBy: 'integration' });

    await assert.rejects(
      payouts.transferReservedPayout(payout.id, async () => { throw new Error('Integration: card_declined'); }),
      /the balance remains payable/,
    );
    const after = await prisma.studioPayout.findUniqueOrThrow({ where: { id: payout.id } });
    assert.equal(after.status, 'FAILED');
    assert.equal((await payouts.studioPayable(studio.id)).amountUsd, 40, 'the money never left, so it is owed again');
  });

  await t.test('a transfer the rail accepted stays reserved when recording it fails', async () => {
    const studio = await studioOwed('payout-unrecorded', 90);
    const { payout } = await payouts.reserveStudioPayout({ studioId: studio.id, requestedBy: 'integration' });

    // Postgres text cannot hold a NUL, so this transfer id cannot be written: it
    // stands in for any failure to record a transfer the rail has already made.
    await assert.rejects(payouts.transferReservedPayout(payout.id, async () => ({ id: 'integration-transfer- ' })));
    const after = await prisma.studioPayout.findUniqueOrThrow({ where: { id: payout.id } });
    assert.equal(after.status, 'PENDING', 'the payout waits for someone to reconcile it');
    assert.equal((await payouts.studioPayable(studio.id)).amountUsd, 0, 'the money that left is not payable a second time');
    assert.equal(await prisma.financialTransaction.count({ where: { source_type: 'STUDIO_PAYOUT_REVERSAL', source_id: payout.id } }), 0);
  });
});
