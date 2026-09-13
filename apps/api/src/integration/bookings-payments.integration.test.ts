import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';

// Stabilization Session 4: the booking lifecycle, who may read a booking, and
// Stripe webhook handling, against a real database. A02 and A03 from
// docs/ARCHITECTURE_AUDIT_2026_09_06.md began here as todo tests; both are fixed now,
// and these tests are what hold them fixed.
//
// Plain strings on purpose: the repository secret scanner rejects values shaped
// like real Stripe credentials, and signature verification accepts any secret.
const WEBHOOK_SECRET = 'integration-webhook-secret';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY = 'integration-stripe-key';

const SECRET_FIELDS = new Set(['password_hash', 'mfa_secret_encrypted']);
function secretFieldPaths(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => secretFieldPaths(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(SECRET_FIELDS.has(key) ? [`${path}.${key}`] : []),
      ...secretFieldPaths(child, `${path}.${key}`),
    ]);
  }
  return [];
}

test('bookings, access scope and Stripe webhooks hold their invariants', async (t) => {
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
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const auth = (user: { id: string; role: string }) => ({
    authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
  });

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = (label: string) => `${label}-${runId}@example.test`;

  // Two studios, so every scope check has somewhere to leak to.
  const makeStudio = async (label: string) => {
    const studio = await prisma.studio.create({ data: { slug: `${label}-${runId}`, name: `Scope ${label}` } });
    const room = await prisma.room.create({ data: { studio_id: studio.id, name: `${label} room` } });
    const service = await prisma.serviceOffering.create({ data: {
      studio_id: studio.id, category: 'RECORDING', name: `${label} session`, min_price_usd: 50, max_price_usd: 50, unit: 'hour',
    } });
    return { studio, room, service };
  };
  const alpha = await makeStudio('alpha');
  const beta = await makeStudio('beta');

  const staff = async (label: string, role: 'STUDIO_ADMIN' | 'ENGINEER', studioId: string) => {
    const user = await prisma.user.create({ data: { email: email(label), role } });
    await prisma.studioStaff.create({ data: { user_id: user.id, studio_id: studioId, role } });
    return user;
  };
  const adminAlpha = await staff('admin-alpha', 'STUDIO_ADMIN', alpha.studio.id);
  const engineerAlpha = await staff('engineer-alpha', 'ENGINEER', alpha.studio.id);
  const engineerBeta = await staff('engineer-beta', 'ENGINEER', beta.studio.id);

  // A real-looking hash, so a leak is unmistakable if it ever returns.
  const artistUser = await prisma.user.create({
    data: {
      email: email('artist'), role: 'ARTIST', password_hash: 'integration-placeholder-hash',
      artist: { create: { name: 'Scope Artist', wallet: { create: { balance_usd: 0 } } } },
    },
    include: { artist: true },
  });
  const producer = (label: string, name: string) => prisma.user.create({
    data: { email: email(label), role: 'PRODUCER', producer: { create: { name } } },
    include: { producer: true },
  });
  const owningProducer = await producer('producer-owner', 'Owning Producer');
  const unrelatedProducer = await producer('producer-stranger', 'Unrelated Producer');
  const project = await prisma.project.create({
    data: { producer_id: owningProducer.producer!.id, artist_id: artistUser.artist!.id, title: 'Scope Project' },
  });

  let slot = 0;
  type Status = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  const book = async (at: typeof alpha, status: Status, options: { artistId?: string; projectId?: string } = {}) => {
    slot += 1;
    const starts_at = new Date(Date.now() + (30 + slot) * 86_400_000);
    return prisma.booking.create({ data: {
      studio_id: at.studio.id, artist_id: options.artistId ?? artistUser.artist!.id, room_id: at.room.id,
      service_id: at.service.id, project_id: options.projectId, starts_at,
      ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50, status,
    } });
  };
  const setStatus = (bookingId: string, status: Status, user = adminAlpha) =>
    request(`/bookings/${bookingId}/status`, { method: 'PATCH', headers: auth(user), body: JSON.stringify({ status }) });

  await t.test('a booking the wallet cannot cover is refused and changes nothing', async () => {
    const bookingsBefore = await prisma.booking.count({ where: { artist_id: artistUser.artist!.id } });
    const startsAt = new Date(Date.now() + 120 * 86_400_000);
    startsAt.setUTCMinutes(0, 0, 0);
    const attempt = await request('/bookings', {
      method: 'POST', headers: auth(artistUser),
      body: JSON.stringify({
        studio_id: alpha.studio.id, room_id: alpha.room.id, service_id: alpha.service.id,
        starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + 3_600_000).toISOString(),
      }),
    });
    assert.equal(attempt.status, 402);
    assert.equal(await prisma.booking.count({ where: { artist_id: artistUser.artist!.id } }), bookingsBefore, 'no booking is created');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { artist_id: artistUser.artist!.id }, include: { transactions: true } });
    assert.equal(Number(wallet.balance_usd), 0);
    assert.equal(wallet.transactions.length, 0, 'no wallet movement is recorded');
  });

  await t.test('a booking is readable by its artist, its studio and its project\'s producer, and by nobody else', async () => {
    const booking = await book(alpha, 'CONFIRMED', { projectId: project.id });

    for (const outsider of [unrelatedProducer, engineerBeta]) {
      const read = await request(`/bookings/${booking.id}`, { headers: auth(outsider) });
      assert.equal(read.status, 404, `${outsider.email} must not read another party's booking`);
    }
    for (const path of ['next-action', 'session-summary']) {
      const denied = await request(`/bookings/${booking.id}/${path}`, { headers: auth(unrelatedProducer) });
      assert.equal(denied.status, 404, `an unrelated producer must not reach /${path}`);
      const allowed = await request(`/bookings/${booking.id}/${path}`, { headers: auth(owningProducer) });
      assert.equal(allowed.status, 200, `the owning producer can reach /${path}, so the route exists`);
    }

    for (const reader of [artistUser, adminAlpha, engineerAlpha, owningProducer]) {
      const read = await request(`/bookings/${booking.id}`, { headers: auth(reader) });
      assert.equal(read.status, 200, `${reader.email} may read this booking`);
      assert.deepEqual(secretFieldPaths(read.body), [], `${reader.email} must never receive password or MFA material`);
    }
  });

  await t.test('engineers see only their own studio', async () => {
    const alphaBooking = await book(alpha, 'PENDING');
    const betaBooking = await book(beta, 'PENDING');

    const betaList = await request('/bookings?limit=100', { headers: auth(engineerBeta) });
    assert.equal(betaList.status, 200);
    const betaIds = betaList.body.data.map((row: any) => row.id);
    assert.ok(betaIds.includes(betaBooking.id));
    assert.ok(!betaIds.includes(alphaBooking.id), 'no other studio\'s booking appears in the list');

    // Characterisation, not a verdict: an engineer sees every booking at their
    // own studio, including ones nobody has assigned them to. Recorded so that
    // narrowing it is a decision someone makes, not a behaviour that drifts.
    const alphaList = await request('/bookings?limit=100', { headers: auth(engineerAlpha) });
    assert.ok(alphaList.body.data.some((row: any) => row.id === alphaBooking.id && row.engineer_id === null));
  });

  await t.test('studio staff move a booking through its lifecycle, only within their own studio', async () => {
    const pending = await book(alpha, 'PENDING');
    assert.equal((await setStatus(pending.id, 'CANCELLED')).status, 200);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: pending.id } })).status, 'CANCELLED');

    const foreign = await book(beta, 'PENDING');
    assert.equal((await setStatus(foreign.id, 'CONFIRMED')).status, 404, 'an admin cannot move another studio\'s booking');
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: foreign.id } })).status, 'PENDING');

    const confirmed = await book(alpha, 'CONFIRMED');
    assert.equal((await setStatus(confirmed.id, 'COMPLETED')).status, 200);
    assert.equal(await prisma.weaveEvidence.count({ where: { booking_id: confirmed.id } }), 1, 'completion produces exactly one piece of evidence');
  });

  const loneArtist = await prisma.user.create({
    data: { email: email('a02'), role: 'ARTIST', artist: { create: { name: 'A02 Artist' } } },
    include: { artist: true },
  });

  // A02, fixed: lib/bookingTransitions.ts decides every booking status change.
  await t.test('completing a booking twice records the completion once', async () => {
    const booking = await book(alpha, 'CONFIRMED', { artistId: loneArtist.artist!.id });
    assert.equal((await setStatus(booking.id, 'COMPLETED')).status, 200);
    const repeat = await setStatus(booking.id, 'COMPLETED');
    assert.equal(repeat.status, 200, 'asking for the status a booking already has is not an error');
    assert.equal(repeat.body.status, 'COMPLETED');
    assert.equal(await prisma.activityEvent.count({ where: { type: 'session.completed', artist_id: loneArtist.artist!.id } }), 1);
  });

  await t.test('a closed booking cannot be reopened or revived', async () => {
    const attempts = [['COMPLETED', 'PENDING'], ['COMPLETED', 'CANCELLED'], ['CANCELLED', 'CONFIRMED']] as const;
    for (const [closed, attempted] of attempts) {
      const booking = await book(alpha, closed);
      assert.equal((await setStatus(booking.id, attempted)).status, 409, `${closed} must not become ${attempted}`);
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, closed);
    }
  });

  await t.test('files cannot be delivered for a cancelled booking', async () => {
    const booking = await book(alpha, 'CANCELLED');
    const attempt = await request(`/bookings/${booking.id}/deliver`, {
      method: 'POST', headers: auth(adminAlpha), body: JSON.stringify({ file_urls: ['https://files.example.test/mix.wav'] }),
    });
    assert.equal(attempt.status, 409);
    assert.equal(await prisma.deliverable.count({ where: { booking_id: booking.id } }), 0, 'no deliverable is created');
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, 'CANCELLED');
  });

  const stripe = new Stripe('integration-stripe-key');
  const deliver = async (event: object, options: { secret?: string; signed?: boolean } = {}) => {
    const payload = JSON.stringify(event);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.signed !== false) {
      headers['stripe-signature'] = stripe.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? WEBHOOK_SECRET });
    }
    const response = await fetch(`${baseUrl}/webhooks/stripe`, { method: 'POST', headers, body: payload });
    return { status: response.status, body: (await response.json()) as any };
  };
  const awaitingPayment = async (status: 'PENDING' | 'CANCELLED', label: string) => {
    const booking = await book(alpha, status);
    const payment = await prisma.payment.create({ data: {
      booking_id: booking.id, provider: 'stripe', provider_ref: `checkout-${label}-${runId}`, amount_usd: 50, status: 'PROCESSING',
    } });
    return { booking, payment };
  };
  const checkoutCompleted = (
    eventId: string,
    target: { booking: { id: string }; payment: { provider_ref: string | null } },
    amountTotal = 5000,
  ) => ({
    id: eventId, object: 'event', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
    data: { object: {
      id: target.payment.provider_ref, object: 'checkout.session', payment_status: 'paid', currency: 'usd',
      amount_total: amountTotal, payment_intent: `intent-${eventId}`,
      metadata: { type: 'booking_payment', booking_id: target.booking.id },
    } },
  });

  await t.test('a signed payment settles once, however many times Stripe delivers it', async () => {
    const target = await awaitingPayment('PENDING', 'settle');
    const event = checkoutCompleted(`evt-settle-${runId}`, target);
    const postings = () => prisma.financialTransaction.count({ where: { source_type: 'BOOKING_PAYMENT', source_id: target.payment.id } });

    const first = await deliver(event);
    assert.equal(first.status, 200);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: target.payment.id } })).status, 'PAID');
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: target.booking.id } })).status, 'CONFIRMED');
    assert.equal(await postings(), 1, 'the payment is posted to the ledger once');

    const replay = await deliver(event);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate, true, 'a redelivered event is recognised as already handled');
    assert.equal(await postings(), 1, 'a replay never posts money twice');
  });

  await t.test('an unsigned or wrongly signed event is rejected before anything is recorded', async () => {
    const target = await awaitingPayment('PENDING', 'forged');
    const eventId = `evt-forged-${runId}`;
    const wronglySigned = await deliver(checkoutCompleted(eventId, target), { secret: 'not-the-webhook-secret' });
    const unsigned = await deliver(checkoutCompleted(eventId, target), { signed: false });
    assert.equal(wronglySigned.status, 400);
    assert.equal(unsigned.status, 400);
    assert.equal(await prisma.stripeWebhookEvent.count({ where: { id: eventId } }), 0, 'a rejected event is never claimed');
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: target.payment.id } })).status, 'PROCESSING');
  });

  await t.test('a payment that does not match its booking is not settled and stays retryable', async () => {
    const target = await awaitingPayment('PENDING', 'mismatch');
    const eventId = `evt-mismatch-${runId}`;
    const attempt = await deliver(checkoutCompleted(eventId, target, 4000));
    assert.equal(attempt.status, 500);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: target.payment.id } })).status, 'PROCESSING');
    assert.equal(await prisma.financialTransaction.count({ where: { source_id: target.payment.id } }), 0, 'nothing is posted');
    assert.equal(await prisma.stripeWebhookEvent.count({ where: { id: eventId } }), 0, 'the claim is released so Stripe can retry');
  });

  // A03, fixed: a payment records money; it no longer decides a booking's status.
  const refundRequests = (bookingId: string) => prisma.notification.count({
    where: { user_id: adminAlpha.id, type: 'PAYMENT_NEEDS_REFUND', payload: { path: ['booking_id'], equals: bookingId } },
  });

  await t.test('payment for a cancelled booking is recorded, does not revive it, and asks for a refund', async () => {
    const target = await awaitingPayment('CANCELLED', 'cancelled');
    assert.equal((await deliver(checkoutCompleted(`evt-cancelled-${runId}`, target))).status, 200);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: target.booking.id } })).status, 'CANCELLED');
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: target.payment.id } })).status, 'PAID', 'the money arrived, so it is recorded');
    assert.equal(await refundRequests(target.booking.id), 1, 'studio staff are asked to refund it');
  });

  await t.test('a failed attempt delivered after the payment succeeded does not undo it', async () => {
    const target = await awaitingPayment('PENDING', 'late-failure');
    const eventId = `evt-late-failure-${runId}`;
    assert.equal((await deliver(checkoutCompleted(eventId, target))).status, 200);
    const failureNotices = () => prisma.notification.count({ where: { user_id: artistUser.id, type: 'PAYMENT_FAILED' } });
    const noticesBefore = await failureNotices();

    const failure = await deliver({
      id: `${eventId}-intent`, object: 'event', type: 'payment_intent.payment_failed', created: Math.floor(Date.now() / 1000),
      data: { object: { id: `intent-${eventId}`, object: 'payment_intent' } },
    });
    assert.equal(failure.status, 200);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: target.payment.id } })).status, 'PAID');
    assert.equal(await failureNotices(), noticesBefore, 'the artist is not told a settled payment failed');
  });

  await t.test('a checkout that fails before paying is marked failed', async () => {
    const target = await awaitingPayment('PENDING', 'async-failure');
    const failure = await deliver({
      id: `evt-async-failure-${runId}`, object: 'event', type: 'checkout.session.async_payment_failed', created: Math.floor(Date.now() / 1000),
      data: { object: { id: target.payment.provider_ref, object: 'checkout.session', payment_intent: null } },
    });
    assert.equal(failure.status, 200);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: target.payment.id } })).status, 'FAILED');
  });

  await t.test('a second checkout paying an already settled booking is flagged for refund, not recorded twice', async () => {
    const target = await awaitingPayment('PENDING', 'double');
    assert.equal((await deliver(checkoutCompleted(`evt-double-first-${runId}`, target))).status, 200);
    const secondCheckout = { booking: target.booking, payment: { provider_ref: `checkout-double-second-${runId}` } };
    assert.equal((await deliver(checkoutCompleted(`evt-double-second-${runId}`, secondCheckout))).status, 200);
    assert.equal(await prisma.financialTransaction.count({ where: { source_type: 'BOOKING_PAYMENT', source_id: target.payment.id } }), 1);
    assert.equal(await refundRequests(target.booking.id), 1, 'studio staff are asked to refund the second charge');
  });

  await t.test('checkout refuses a booking that cannot be paid, before reaching Stripe', async () => {
    const cancelled = await awaitingPayment('CANCELLED', 'checkout-cancelled');
    const refunded = await awaitingPayment('PENDING', 'checkout-refunded');
    await prisma.payment.update({ where: { id: refunded.payment.id }, data: { status: 'REFUNDED' } });
    for (const [label, target] of [['cancelled booking', cancelled], ['refunded payment', refunded]] as const) {
      const attempt = await request('/payments/stripe/checkout-session', {
        method: 'POST', headers: auth(artistUser), body: JSON.stringify({ booking_id: target.booking.id }),
      });
      assert.equal(attempt.status, 409, label);
    }
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: refunded.payment.id } })).status, 'REFUNDED', 'a refund is never reset to processing');
  });

  // A01, fixed: a live update reaches the people entitled to what it describes,
  // once each. Studio beta must hear nothing about studio alpha.
  await t.test('live updates reach only the people entitled to them, once each', async () => {
    const { broadcastToUser } = await import('../routes/notifications.routes');
    const adminBeta = await staff('admin-beta', 'STUDIO_ADMIN', beta.studio.id);
    const operator = await prisma.user.create({ data: { email: email('operator'), role: 'OIANO_ADMIN' } });
    // A membership alone is not enough. The booking routes still treat a producer
    // as a producer, so one linked to alpha hears only what they could read.
    const linkedProducer = await producer('producer-linked', 'Linked Producer');
    await prisma.studioStaff.create({ data: { user_id: linkedProducer.id, studio_id: alpha.studio.id, role: 'ENGINEER' } });
    // New artists, so each has booked at exactly one studio.
    const newArtist = (label: string) => prisma.user.create({
      data: { email: email(label), role: 'ARTIST', artist: { create: { name: label } } },
      include: { artist: true },
    });
    const alphaArtist = await newArtist('live-alpha-artist');
    const betaArtist = await newArtist('live-beta-artist');
    const alphaProject = await prisma.project.create({
      data: { producer_id: owningProducer.producer!.id, artist_id: alphaArtist.artist!.id, title: 'Live Project' },
    });
    const alphaBooking = await book(alpha, 'PENDING', { artistId: alphaArtist.artist!.id, projectId: alphaProject.id });
    const betaBooking = await book(beta, 'PENDING', { artistId: betaArtist.artist!.id });

    const labels = new Map([[alphaBooking.id, 'alpha booking'], [betaBooking.id, 'beta booking'], [alphaArtist.artist!.id, 'alpha artist']]);
    // The updates this test is about, in words. Notifications and activity events are left out.
    const summarize = (event: any): string | null => {
      if (event.type === 'booking_updated') return `${labels.get(event.bookingId) ?? event.bookingId} is ${event.status}`;
      if (event.type === 'studio_announcement') return `announcement: ${event.announcement.title}`;
      if (event.type === 'artist_status_changed') return `${labels.get(event.artistId) ?? event.artistId} is ${event.status}`;
      return null;
    };

    const listen = async (user: { id: string; role: string }) => {
      const ticket = await request('/notifications/stream-ticket', { method: 'POST', headers: auth(user) });
      const aborter = new AbortController();
      const response = await fetch(`${baseUrl}/notifications/stream?ticket=${encodeURIComponent(ticket.body.ticket)}`, { signal: aborter.signal });
      assert.equal(response.status, 200);
      const events: any[] = [];
      let onChunk = () => {};
      void (async () => {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice('data: '.length)));
          }
          onChunk();
        }
      })().catch(() => { /* the test closed the stream */ });
      const received = (type: string) => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${user.id} never received ${type}`)), 5_000);
        onChunk = () => {
          if (!events.some((event) => event.type === type)) return;
          clearTimeout(timer);
          resolve();
        };
        onChunk();
      });
      await received('connected');
      return { events, received, close: () => aborter.abort() };
    };

    const listeners = { adminAlpha, engineerAlpha, alphaArtist, owningProducer, operator, adminBeta, engineerBeta, betaArtist, unrelatedProducer, linkedProducer };
    const streams = new Map<string, Awaited<ReturnType<typeof listen>>>();
    try {
      for (const [name, user] of Object.entries(listeners)) streams.set(name, await listen(user));

      assert.equal((await setStatus(alphaBooking.id, 'CONFIRMED')).status, 200);
      const announcement = await request('/admin/announcements', {
        method: 'POST', headers: auth(adminAlpha), body: JSON.stringify({ title: 'Alpha closes early Friday', body: 'Doors close at six.' }),
      });
      assert.equal(announcement.status, 201);
      const availability = await request('/artists/me/status', {
        method: 'PATCH', headers: auth(alphaArtist), body: JSON.stringify({ status: 'IN_SESSION' }),
      });
      assert.equal(availability.status, 200);
      assert.equal((await setStatus(betaBooking.id, 'CONFIRMED', adminBeta)).status, 200);

      // Each update above was written to its streams before its request returned,
      // so a marker sent now lands after everything those requests delivered.
      for (const user of Object.values(listeners)) broadcastToUser(user.id, { type: 'marker' });

      const alphaConfirmed = 'alpha booking is CONFIRMED';
      const betaConfirmed = 'beta booking is CONFIRMED';
      const alphaNotice = 'announcement: Alpha closes early Friday';
      const alphaArtistBusy = 'alpha artist is IN_SESSION';
      const expected: Record<keyof typeof listeners, string[]> = {
        adminAlpha: [alphaConfirmed, alphaNotice, alphaArtistBusy],
        engineerAlpha: [alphaConfirmed, alphaNotice, alphaArtistBusy],
        alphaArtist: [alphaConfirmed, alphaNotice],
        owningProducer: [alphaConfirmed],
        operator: [alphaConfirmed, betaConfirmed],
        adminBeta: [betaConfirmed],
        engineerBeta: [betaConfirmed],
        betaArtist: [betaConfirmed],
        unrelatedProducer: [],
        linkedProducer: [],
      };
      for (const [name, updates] of Object.entries(expected)) {
        const stream = streams.get(name)!;
        await stream.received('marker');
        const beforeMarker = stream.events.slice(0, stream.events.findIndex((event) => event.type === 'marker'));
        assert.deepEqual(beforeMarker.map(summarize).filter(Boolean), updates, `${name} heard the wrong live updates`);
      }
    } finally {
      for (const stream of streams.values()) stream.close();
    }
  });

  // Found while fixing A01, now fixed: an artist reads a studio's announcements only
  // if they have booked there, the same artists who hear them live, and staff are no
  // longer answered by the artist-facing route mounted ahead of theirs. Each studio
  // has a notice, so a leak shows up as the other studio's name.
  const betaAnnouncer = await staff('announcer-beta', 'STUDIO_ADMIN', beta.studio.id);
  await prisma.studioAnnouncement.createMany({ data: [
    { studio_id: alpha.studio.id, title: 'Alpha notice', body: 'Doors open at ten.', created_by: adminAlpha.id },
    { studio_id: beta.studio.id, title: 'Beta notice', body: 'Doors open at noon.', created_by: betaAnnouncer.id },
  ] });
  const alphaRegular = await prisma.user.create({
    data: { email: email('alpha-regular'), role: 'ARTIST', artist: { create: { name: 'Alpha Regular' } } },
    include: { artist: true },
  });
  await book(alpha, 'PENDING', { artistId: alphaRegular.artist!.id });
  await book(beta, 'PENDING'); // beta has bookings, just none of theirs
  const studioNames = new Map([[alpha.studio.id, 'alpha'], [beta.studio.id, 'beta']]);
  /** The studios whose announcements a user is given. */
  const announcementsReadBy = async (user: { id: string; role: string; email: string }, query = '') => {
    const list = await request(`/admin/announcements${query}`, { headers: auth(user) });
    assert.equal(list.status, 200, `${user.email} asked for announcements${query}`);
    return [...new Set(list.body.map((row: any) => studioNames.get(row.studio_id) ?? row.studio_id))];
  };

  await t.test('an artist reads announcements only from a studio they have booked with', async () => {
    assert.deepEqual(await announcementsReadBy(alphaRegular, `?studio_id=${beta.studio.id}`), [], 'naming a studio they never booked yields nothing');
    assert.deepEqual(await announcementsReadBy(alphaRegular), ['alpha'], 'naming no studio, the one they booked');
    assert.deepEqual(await announcementsReadBy(alphaRegular, `?studio_id=${alpha.studio.id}`), ['alpha'], 'naming the studio they booked');
  });

  await t.test('a studio admin reads their own studio\'s announcements', async () => {
    assert.deepEqual(await announcementsReadBy(adminAlpha), ['alpha']);
    // Staff get there past the artist-facing route mounted first, which artists must still reach.
    const creditRequest = await request('/admin/credit-request', { method: 'POST', headers: auth(alphaRegular) });
    assert.equal(creditRequest.status, 200, 'an artist still reaches the artist-facing admin route');
  });
});
